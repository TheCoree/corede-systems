"""Агрегаты для графиков и uptime. Всё портируемо между SQLite и Postgres."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import utcnow
from app.modules.monitoring.models import Check, StatHourly


@dataclass(slots=True)
class Agg:
    total: int = 0
    up: int = 0
    latency_sum: float = 0.0
    latency_count: int = 0
    latency_max: float = 0.0

    def add(self, total: int, up: int, lsum: float, lcount: int, lmax: float) -> None:
        self.total += total
        self.up += up
        self.latency_sum += lsum
        self.latency_count += lcount
        self.latency_max = max(self.latency_max, lmax)

    @property
    def uptime(self) -> float | None:
        return round(self.up / self.total * 100, 3) if self.total else None

    @property
    def avg_latency(self) -> float | None:
        return round(self.latency_sum / self.latency_count, 1) if self.latency_count else None


def floor_hour(dt: datetime) -> datetime:
    return dt.replace(minute=0, second=0, microsecond=0)


async def aggregate(db: AsyncSession, monitor_ids: list[str], since: datetime) -> dict[str, Agg]:
    if not monitor_ids:
        return {}
    rows = await db.execute(
        select(
            StatHourly.monitor_id,
            func.sum(StatHourly.total),
            func.sum(StatHourly.up),
            func.sum(StatHourly.latency_sum),
            func.sum(StatHourly.latency_count),
            func.max(StatHourly.latency_max),
        )
        .where(StatHourly.monitor_id.in_(monitor_ids), StatHourly.hour >= floor_hour(since))
        .group_by(StatHourly.monitor_id)
    )
    out: dict[str, Agg] = {}
    for mid, total, up, lsum, lcount, lmax in rows.all():
        a = Agg()
        a.add(total or 0, up or 0, lsum or 0.0, lcount or 0, lmax or 0.0)
        out[mid] = a
    return out


async def hourly_bars(db: AsyncSession, monitor_ids: list[str], hours: int = 24) -> dict[str, list[dict]]:
    """Последние N часов по каждому монитору: [{t, total, up}], пустые часы — total=0."""
    if not monitor_ids:
        return {}
    end = floor_hour(utcnow())
    start = end - timedelta(hours=hours - 1)
    rows = await db.execute(
        select(StatHourly.monitor_id, StatHourly.hour, StatHourly.total, StatHourly.up).where(
            StatHourly.monitor_id.in_(monitor_ids), StatHourly.hour >= start
        )
    )
    by: dict[str, dict[datetime, tuple[int, int]]] = defaultdict(dict)
    for mid, hour, total, up in rows.all():
        by[mid][hour] = (total, up)
    slots = [start + timedelta(hours=i) for i in range(hours)]
    return {
        mid: [{"t": s, "total": by[mid].get(s, (0, 0))[0], "up": by[mid].get(s, (0, 0))[1]} for s in slots]
        for mid in monitor_ids
    }


RANGES: dict[str, tuple[timedelta, int]] = {
    # диапазон, размер корзины в секундах
    "24h": (timedelta(hours=24), 600),
    "7d": (timedelta(days=7), 3600),
    "30d": (timedelta(days=30), 6 * 3600),
    "90d": (timedelta(days=90), 86400),
}


def _bucket_start(dt: datetime, size: int, shift: int) -> datetime:
    ts = dt.timestamp() + shift
    return datetime.fromtimestamp(ts - ts % size - shift, dt.tzinfo)


async def series(db: AsyncSession, monitor_id: str, range_: str, tz_shift: int = 0) -> dict:
    span, size = RANGES[range_]
    now = utcnow()
    since = now - span
    shift = tz_shift if size >= 86400 else 0
    buckets: dict[datetime, Agg] = defaultdict(Agg)
    total = Agg()

    if range_ == "24h":
        rows = await db.execute(
            select(Check.checked_at, Check.ok, Check.latency_ms).where(
                Check.monitor_id == monitor_id, Check.checked_at >= since
            )
        )
        for at, ok, lat in rows.all():
            b = buckets[_bucket_start(at, size, shift)]
            has_lat = ok and lat is not None
            b.add(1, int(ok), lat if has_lat else 0.0, int(has_lat), lat if has_lat else 0.0)
            total.add(1, int(ok), lat if has_lat else 0.0, int(has_lat), lat if has_lat else 0.0)
    else:
        rows = await db.execute(
            select(StatHourly).where(StatHourly.monitor_id == monitor_id, StatHourly.hour >= floor_hour(since))
        )
        for s in rows.scalars():
            args = (s.total, s.up, s.latency_sum, s.latency_count, s.latency_max)
            buckets[_bucket_start(s.hour, size, shift)].add(*args)
            total.add(*args)

    first = _bucket_start(since, size, shift)
    points = []
    cur = first
    while cur <= now:
        a = buckets.get(cur)
        points.append({
            "t": cur,
            "total": a.total if a else 0,
            "up": a.up if a else 0,
            "avg": a.avg_latency if a else None,
            "max": round(a.latency_max, 1) if a and a.latency_count else None,
        })
        cur += timedelta(seconds=size)
    return {
        "range": range_,
        "bucket_seconds": size,
        "uptime": total.uptime,
        "avg_latency": total.avg_latency,
        "max_latency": round(total.latency_max, 1) if total.latency_count else None,
        "checks": total.total,
        "points": points,
    }


async def daily(db: AsyncSession, monitor_id: str, days: int = 90, tz_shift: int = 0) -> list[dict]:
    now = utcnow()
    since = now - timedelta(days=days)
    rows = await db.execute(
        select(StatHourly.hour, StatHourly.total, StatHourly.up).where(
            StatHourly.monitor_id == monitor_id, StatHourly.hour >= floor_hour(since)
        )
    )
    by_day: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for hour, total, up in rows.all():
        key = (hour + timedelta(seconds=tz_shift)).date().isoformat()
        by_day[key][0] += total
        by_day[key][1] += up
    today = (now + timedelta(seconds=tz_shift)).date()
    out = []
    for i in range(days - 1, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        total, up = by_day.get(d, [0, 0])
        out.append({"date": d, "total": total, "up": up})
    return out
