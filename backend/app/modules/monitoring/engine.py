"""Планировщик проверок и машина состояний мониторов.

Цикл раз в секунду выбирает мониторы с next_check_at <= now, запускает пробы
параллельно (ограничено семафором), а результаты записывает последовательно —
так SQLite не ловит конкурентные блокировки, а на Postgres это всё равно быстро.
"""

import asyncio
import logging
import random
import time
from datetime import timedelta

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import lazyload

from app.core.config import settings
from app.core.db import SessionLocal, utcnow
from app.modules.monitoring.models import Check, Incident, Monitor, MonitorStatus, MonitorType, StatHourly
from app.modules.monitoring.probes import Prober, ProbeResult, Target
from app.notifications.dispatcher import Event, dispatch_soon
from app.workspaces.models import Workspace

log = logging.getLogger("corede.monitoring")

SSL_RECHECK = timedelta(hours=12)
SSL_THRESHOLDS = (14, 7, 3, 1)  # дни — пороги предупреждений
CONFIRM_RETRY_SECONDS = 15


def human_duration(seconds: float) -> str:
    seconds = int(max(0, seconds))
    d, rem = divmod(seconds, 86400)
    h, rem = divmod(rem, 3600)
    m, s = divmod(rem, 60)
    if d:
        return f"{d} д {h} ч"
    if h:
        return f"{h} ч {m} мин"
    if m:
        return f"{m} мин"
    return f"{s} сек"


def target_of(m: Monitor) -> str:
    match m.type:
        case MonitorType.http:
            return m.url or ""
        case MonitorType.tcp:
            return f"{m.host}:{m.port}"
        case _:
            return "push / heartbeat"


def to_target(m: Monitor) -> Target:
    now = utcnow()
    check_ssl = bool(
        m.type == MonitorType.http
        and m.url
        and m.url.startswith("https://")
        and m.verify_ssl
        and (m.ssl_checked_at is None or now - m.ssl_checked_at > SSL_RECHECK)
    )
    return Target(
        id=m.id,
        workspace_id=m.workspace_id,
        type=m.type,
        url=m.url,
        method=m.method,
        expected_status=m.expected_status,
        keyword=m.keyword,
        keyword_invert=m.keyword_invert,
        headers=dict(m.headers or {}),
        follow_redirects=m.follow_redirects,
        verify_ssl=m.verify_ssl,
        host=m.host,
        port=m.port,
        timeout=m.timeout,
        check_ssl=check_ssl,
    )


class MonitorEngine:
    def __init__(self) -> None:
        self.prober = Prober()
        self._sem = asyncio.Semaphore(settings.scheduler_concurrency)
        self._write_lock = asyncio.Lock()
        self._inflight: set[str] = set()
        self._tasks: set[asyncio.Task] = set()
        self._loop_task: asyncio.Task | None = None
        self._last_maintenance = 0.0
        self.running = False

    # ---------- lifecycle ----------

    async def start(self) -> None:
        if self.running:
            return
        self.running = True
        # После простоя самой панели не считаем push-мониторы «пропавшими»
        async with SessionLocal() as db:
            now = utcnow()
            rows = await db.scalars(
                select(Monitor)
                .options(lazyload("*"))
                .where(Monitor.type == MonitorType.push, Monitor.paused.is_(False), Monitor.next_check_at < now)
            )
            for m in rows:
                m.next_check_at = now + timedelta(seconds=m.interval + m.timeout)
            await db.commit()
        self._loop_task = asyncio.create_task(self._loop(), name="monitoring-scheduler")
        log.info("monitoring scheduler started (concurrency=%s)", settings.scheduler_concurrency)

    async def stop(self) -> None:
        self.running = False
        if self._loop_task:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        for t in list(self._tasks):
            t.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        await self.prober.aclose()

    async def _loop(self) -> None:
        while self.running:
            try:
                await self._tick()
                if time.monotonic() - self._last_maintenance > 600:
                    self._last_maintenance = time.monotonic()
                    await self._maintenance()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("scheduler tick failed")
            await asyncio.sleep(1)

    def _spawn(self, coro) -> None:
        task = asyncio.create_task(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _tick(self) -> None:
        now = utcnow()
        async with SessionLocal() as db:
            due = (
                await db.scalars(
                    select(Monitor)
                    .options(lazyload("*"))
                    .where(
                        Monitor.paused.is_(False),
                        or_(Monitor.next_check_at.is_(None), Monitor.next_check_at <= now),
                    )
                    .order_by(Monitor.next_check_at)
                    .limit(1000)
                )
            ).all()
        for m in due:
            if m.id in self._inflight:
                continue
            self._inflight.add(m.id)
            if m.type == MonitorType.push:
                if m.next_check_at is None:
                    self._spawn(self._schedule_push(m.id, m.interval + m.timeout))
                else:
                    missed = ProbeResult(ok=False, error=f"Нет сигнала дольше {human_duration(m.interval)}")
                    self._spawn(self._record_and_release(m.id, missed))
            else:
                self._spawn(self._run(to_target(m)))

    async def _schedule_push(self, monitor_id: str, delay: int) -> None:
        try:
            async with self._write_lock, SessionLocal() as db:
                m = await db.get(Monitor, monitor_id, options=[lazyload("*")])
                if m:
                    m.next_check_at = utcnow() + timedelta(seconds=delay)
                    await db.commit()
        finally:
            self._inflight.discard(monitor_id)

    async def _run(self, target: Target) -> None:
        try:
            async with self._sem:
                result = await self.prober.run(target)
            await self.record(target.id, result)
        except Exception:
            log.exception("check failed for monitor %s", target.id)
        finally:
            self._inflight.discard(target.id)

    async def _record_and_release(self, monitor_id: str, result: ProbeResult) -> None:
        try:
            await self.record(monitor_id, result)
        finally:
            self._inflight.discard(monitor_id)

    # ---------- public API ----------

    async def check_now(self, monitor_id: str) -> ProbeResult | None:
        async with SessionLocal() as db:
            m = await db.get(Monitor, monitor_id, options=[lazyload("*")])
            if m is None or m.type == MonitorType.push:
                return None
            target = to_target(m)
        self._inflight.add(monitor_id)
        try:
            result = await self.prober.run(target)
            await self.record(monitor_id, result)
            return result
        finally:
            self._inflight.discard(monitor_id)

    async def record_push(self, token: str, ok: bool, message: str | None, latency: float | None) -> bool:
        async with SessionLocal() as db:
            m = await db.scalar(select(Monitor).options(lazyload("*")).where(Monitor.push_token == token))
            if m is None or m.type != MonitorType.push:
                return False
            if m.paused:
                return True
            monitor_id = m.id
        result = ProbeResult(ok=ok, latency_ms=latency, error=None if ok else (message or "Сервер сообщил о сбое"))
        await self.record(monitor_id, result, from_push=True)
        return True

    # ---------- state machine ----------

    async def record(self, monitor_id: str, r: ProbeResult, *, from_push: bool = False) -> None:
        events: list[Event] = []
        async with self._write_lock, SessionLocal() as db:
            m = await db.get(Monitor, monitor_id)
            if m is None:
                return
            now = utcnow()
            error = None if r.ok else (r.error or "Ошибка")[:500]
            db.add(Check(monitor_id=m.id, checked_at=now, ok=r.ok, latency_ms=r.latency_ms,
                         status_code=r.status_code, error=error))

            hour = now.replace(minute=0, second=0, microsecond=0)
            stat = await db.get(StatHourly, (m.id, hour))
            if stat is None:
                stat = StatHourly(monitor_id=m.id, hour=hour, total=0, up=0,
                                  latency_sum=0.0, latency_count=0, latency_max=0.0)
                db.add(stat)
            stat.total += 1
            if r.ok:
                stat.up += 1
                if r.latency_ms is not None:
                    stat.latency_sum += r.latency_ms
                    stat.latency_count += 1
                    stat.latency_max = max(stat.latency_max, r.latency_ms)

            m.last_checked_at = now
            m.last_latency_ms = r.latency_ms
            m.last_status_code = r.status_code
            m.last_error = error

            if r.ssl_checked:
                m.ssl_checked_at = now
                if r.ssl_expires_at:
                    m.ssl_expires_at = r.ssl_expires_at
                    m.ssl_issuer = r.ssl_issuer
                    events += self._ssl_events(m, now)

            if not m.paused:
                prev = m.status
                if r.ok:
                    m.fail_streak = 0
                    m.fail_since = None
                    if prev != MonitorStatus.up:
                        m.status = MonitorStatus.up
                        m.last_change_at = now
                        if prev == MonitorStatus.down:
                            inc = await db.scalar(
                                select(Incident).where(Incident.monitor_id == m.id, Incident.resolved_at.is_(None))
                            )
                            started = inc.started_at if inc else (m.last_change_at or now)
                            if inc:
                                inc.resolved_at = now
                            events.append(Event(
                                kind="up",
                                title=f"{m.name} снова работает",
                                lines=[target_of(m), f"Простой: {human_duration((now - started).total_seconds())}"],
                                data={"monitor_id": m.id, "status": "up"},
                            ))
                else:
                    if m.fail_streak == 0:
                        m.fail_since = now
                    m.fail_streak += 1
                    if prev != MonitorStatus.down and m.fail_streak >= max(1, m.confirmations):
                        m.status = MonitorStatus.down
                        started = m.fail_since or now
                        m.last_change_at = started
                        db.add(Incident(workspace_id=m.workspace_id, monitor_id=m.id, started_at=started, cause=error))
                        lines = [target_of(m), f"Причина: {error}"]
                        if m.project:
                            lines.append(f"Проект: {m.project.name}")
                        events.append(Event(
                            kind="down",
                            title=f"{m.name} недоступен",
                            lines=lines,
                            data={"monitor_id": m.id, "status": "down", "error": error},
                        ))

                # следующая проверка
                if m.type == MonitorType.push:
                    delay = m.interval + (m.timeout if from_push else 0)
                elif not r.ok and m.status != MonitorStatus.down:
                    delay = min(m.interval, CONFIRM_RETRY_SECONDS)  # быстро подтверждаем падение
                else:
                    delay = m.interval + random.uniform(0, min(5, m.interval * 0.05))
                m.next_check_at = now + timedelta(seconds=delay)

            notify, ws_id = m.notify, m.workspace_id
            if events and notify:
                ws = await db.get(Workspace, ws_id)
                link = f"{settings.public_url}/{ws.slug}/monitors/{m.id}" if ws else None
                for e in events:
                    e.link = link
                    e.data |= {"monitor": m.name, "target": target_of(m), "workspace": ws.slug if ws else None}
            await db.commit()

        if notify:
            for e in events:
                dispatch_soon(ws_id, e)

    def _ssl_events(self, m: Monitor, now) -> list[Event]:
        assert m.ssl_expires_at
        days = (m.ssl_expires_at - now).total_seconds() / 86400
        if days > SSL_THRESHOLDS[0]:
            m.ssl_warn_level = None
            return []
        level = min((t for t in SSL_THRESHOLDS if days <= t), default=None)
        if level is None or (m.ssl_warn_level is not None and m.ssl_warn_level <= level):
            return []
        m.ssl_warn_level = level
        left = max(0, int(days))
        return [Event(
            kind="ssl",
            title=f"SSL-сертификат {m.name} истекает через {left} дн." if days > 0 else f"SSL-сертификат {m.name} истёк",
            lines=[target_of(m), f"Действует до: {m.ssl_expires_at:%d.%m.%Y %H:%M} UTC"],
            data={"monitor_id": m.id, "ssl_expires_at": m.ssl_expires_at.isoformat()},
        )]

    async def _maintenance(self) -> None:
        cutoff = utcnow() - timedelta(days=settings.checks_retention_days)
        async with self._write_lock, SessionLocal() as db:
            res = await db.execute(delete(Check).where(Check.checked_at < cutoff))
            await db.commit()
        if res.rowcount:
            log.info("purged %s old checks", res.rowcount)


engine = MonitorEngine()
