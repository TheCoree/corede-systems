from datetime import timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select, update

from app.core.db import utcnow
from app.core.deps import DB, WS, WorkspaceContext, bearer_token, resolve_api_token
from app.core.security import generate_push_token
from app.modules.monitoring import stats
from app.modules.monitoring.engine import engine, target_of
from app.modules.monitoring.models import Check, Incident, Monitor, MonitorStatus, MonitorType
from app.modules.monitoring.schemas import (
    Bar,
    BulkIn,
    CheckOut,
    CheckResultOut,
    IncidentOut,
    MonitorBrief,
    MonitorIn,
    MonitorOut,
    MonitorPatch,
    Ref,
)
from app.workspaces.models import Project, Tag, Workspace

router = APIRouter(tags=["monitoring"])  # /api/w/{ws}/...
public_router = APIRouter(tags=["monitoring: public"])  # /api/...

TZ = Annotated[int, Query(description="getTimezoneOffset() браузера, минуты", ge=-900, le=900)]

# ---------- helpers ----------


async def _get(db: DB, ctx: WorkspaceContext, monitor_id: str) -> Monitor:
    m = await db.get(Monitor, monitor_id)
    if m is None or m.workspace_id != ctx.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Монитор не найден")
    return m


async def _reload(db: DB, monitor_id: str) -> Monitor:
    return await db.scalar(
        select(Monitor).where(Monitor.id == monitor_id).execution_options(populate_existing=True)
    )


async def _tags(db: DB, ctx: WorkspaceContext, ids: list[str]) -> list[Tag]:
    if not ids:
        return []
    tags = (await db.scalars(select(Tag).where(Tag.workspace_id == ctx.id, Tag.id.in_(ids)))).all()
    if len(tags) != len(set(ids)):
        raise HTTPException(422, "Тег не найден")
    return list(tags)


async def _check_project(db: DB, ctx: WorkspaceContext, project_id: str | None) -> None:
    if project_id:
        p = await db.get(Project, project_id)
        if p is None or p.workspace_id != ctx.id:
            raise HTTPException(422, "Проект не найден")


async def _with_stats(db: DB, monitors: list[Monitor], bars: bool = True) -> list[MonitorOut]:
    ids = [m.id for m in monitors]
    now = utcnow()
    a24 = await stats.aggregate(db, ids, now - timedelta(hours=24))
    a7 = await stats.aggregate(db, ids, now - timedelta(days=7))
    a30 = await stats.aggregate(db, ids, now - timedelta(days=30))
    hb = await stats.hourly_bars(db, ids) if bars else {}
    out = []
    for m in monitors:
        o = MonitorOut.model_validate(m)
        out.append(o.model_copy(update={
            "target": target_of(m),
            "uptime_24h": a24[m.id].uptime if m.id in a24 else None,
            "uptime_7d": a7[m.id].uptime if m.id in a7 else None,
            "uptime_30d": a30[m.id].uptime if m.id in a30 else None,
            "avg_latency_24h": a24[m.id].avg_latency if m.id in a24 else None,
            "bars": [Bar(**b) for b in hb.get(m.id, [])],
        }))
    return out


async def _resolve_open_incidents(db: DB, monitor_id: str) -> None:
    await db.execute(
        update(Incident)
        .where(Incident.monitor_id == monitor_id, Incident.resolved_at.is_(None))
        .values(resolved_at=utcnow())
    )


def _reset_state(m: Monitor) -> None:
    now = utcnow()
    m.status = MonitorStatus.pending
    m.fail_streak = 0
    m.fail_since = None
    m.last_change_at = now
    m.next_check_at = now + timedelta(seconds=m.interval + m.timeout) if m.type == MonitorType.push else now


async def _set_paused(db: DB, m: Monitor, paused: bool) -> None:
    if m.paused == paused:
        return
    m.paused = paused
    if paused:
        m.status = MonitorStatus.paused
        m.next_check_at = None
        m.last_change_at = utcnow()
        await _resolve_open_incidents(db, m.id)
    else:
        _reset_state(m)


def _brief(m: Monitor) -> MonitorBrief:
    return MonitorBrief(
        id=m.id, name=m.name, type=m.type, target=target_of(m), status=m.status,
        project=Ref.model_validate(m.project) if m.project else None,
    )


def _incident_out(i: Incident) -> IncidentOut:
    end = i.resolved_at or utcnow()
    return IncidentOut(
        id=i.id, monitor=_brief(i.monitor), started_at=i.started_at, resolved_at=i.resolved_at,
        cause=i.cause, duration_seconds=(end - i.started_at).total_seconds(),
    )


# ---------- monitors ----------


@router.get("/monitors", response_model=list[MonitorOut])
async def list_monitors(ctx: WS, db: DB):
    monitors = (await db.scalars(select(Monitor).where(Monitor.workspace_id == ctx.id).order_by(Monitor.name))).all()
    return await _with_stats(db, list(monitors))


@router.post("/monitors", response_model=MonitorOut, status_code=201)
async def create_monitor(data: MonitorIn, ctx: WS, db: DB):
    await _check_project(db, ctx, data.project_id)
    tags = await _tags(db, ctx, data.tag_ids)
    fields = data.model_dump(exclude={"tag_ids"})
    m = Monitor(workspace_id=ctx.id, **fields, tags=tags)
    if m.type == MonitorType.push:
        m.push_token = generate_push_token()
        m.confirmations = 1 if "confirmations" not in data.model_fields_set else m.confirmations
    if m.paused:
        m.status = MonitorStatus.paused
    else:
        _reset_state(m)
    db.add(m)
    await db.commit()
    return (await _with_stats(db, [await _reload(db, m.id)]))[0]


@router.get("/monitors/{monitor_id}", response_model=MonitorOut)
async def get_monitor(monitor_id: str, ctx: WS, db: DB):
    return (await _with_stats(db, [await _get(db, ctx, monitor_id)]))[0]


@router.patch("/monitors/{monitor_id}", response_model=MonitorOut)
async def update_monitor(monitor_id: str, data: MonitorPatch, ctx: WS, db: DB):
    m = await _get(db, ctx, monitor_id)
    patch = data.model_dump(exclude_unset=True)
    current = {k: getattr(m, k) for k in MonitorIn.model_fields if k != "tag_ids"}
    current["tag_ids"] = [t.id for t in m.tags]
    merged = MonitorIn.model_validate(current | patch)

    if "project_id" in patch:
        await _check_project(db, ctx, merged.project_id)
    if "tag_ids" in patch:
        m.tags = await _tags(db, ctx, merged.tag_ids)

    critical = ("type", "url", "host", "port", "method", "expected_status", "keyword", "keyword_invert")
    changed_target = any(getattr(m, k) != getattr(merged, k) for k in critical)
    for k in MonitorIn.model_fields:
        if k in ("tag_ids", "paused"):
            continue
        setattr(m, k, getattr(merged, k))

    if m.type == MonitorType.push and not m.push_token:
        m.push_token = generate_push_token()
    if m.type != MonitorType.http:
        m.ssl_expires_at = m.ssl_issuer = m.ssl_checked_at = None

    if "paused" in patch:
        await _set_paused(db, m, merged.paused)
    if changed_target and not m.paused:
        await _resolve_open_incidents(db, m.id)
        m.ssl_checked_at = None
        _reset_state(m)
    elif "interval" in patch and m.next_check_at and not m.paused:
        m.next_check_at = min(m.next_check_at, utcnow() + timedelta(seconds=m.interval))

    await db.commit()
    return (await _with_stats(db, [await _reload(db, m.id)]))[0]


@router.delete("/monitors/{monitor_id}", status_code=204)
async def delete_monitor(monitor_id: str, ctx: WS, db: DB):
    await db.delete(await _get(db, ctx, monitor_id))
    await db.commit()


@router.post("/monitors/{monitor_id}/check", response_model=CheckResultOut)
async def check_now(monitor_id: str, ctx: WS, db: DB):
    m = await _get(db, ctx, monitor_id)
    if m.type == MonitorType.push:
        raise HTTPException(400, "Push-монитор проверяется сигналами с сервера")
    result = await engine.check_now(m.id)
    if result is None:
        raise HTTPException(404, "Монитор не найден")
    return CheckResultOut(ok=result.ok, latency_ms=result.latency_ms, status_code=result.status_code, error=result.error)


@router.post("/monitors/{monitor_id}/push-token", response_model=MonitorOut)
async def rotate_push_token(monitor_id: str, ctx: WS, db: DB):
    m = await _get(db, ctx, monitor_id)
    if m.type != MonitorType.push:
        raise HTTPException(400, "Только для push-мониторов")
    m.push_token = generate_push_token()
    await db.commit()
    return (await _with_stats(db, [await _reload(db, m.id)]))[0]


@router.post("/monitors/bulk")
async def bulk(data: BulkIn, ctx: WS, db: DB):
    monitors = (
        await db.scalars(select(Monitor).where(Monitor.workspace_id == ctx.id, Monitor.id.in_(data.ids)))
    ).all()
    match data.action:
        case "pause" | "resume":
            for m in monitors:
                await _set_paused(db, m, data.action == "pause")
        case "delete":
            for m in monitors:
                await db.delete(m)
        case "move":
            await _check_project(db, ctx, data.project_id)
            for m in monitors:
                m.project_id = data.project_id
        case "tag" | "untag":
            tag = (await _tags(db, ctx, [data.tag_id] if data.tag_id else []) or [None])[0]
            if tag is None:
                raise HTTPException(422, "Укажите тег")
            for m in monitors:
                if data.action == "tag" and tag not in m.tags:
                    m.tags.append(tag)
                elif data.action == "untag" and tag in m.tags:
                    m.tags.remove(tag)
        case "check":
            now = utcnow()
            for m in monitors:
                if not m.paused and m.type != MonitorType.push:
                    m.next_check_at = now
    await db.commit()
    return {"affected": len(monitors)}


@router.get("/monitors/{monitor_id}/checks", response_model=list[CheckOut])
async def list_checks(
    monitor_id: str,
    ctx: WS,
    db: DB,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    failed: bool = False,
):
    m = await _get(db, ctx, monitor_id)
    q = select(Check).where(Check.monitor_id == m.id)
    if failed:
        q = q.where(Check.ok.is_(False))
    return (await db.scalars(q.order_by(Check.checked_at.desc()).limit(limit))).all()


@router.get("/monitors/{monitor_id}/stats")
async def monitor_stats(
    monitor_id: str,
    ctx: WS,
    db: DB,
    range_: Annotated[Literal["24h", "7d", "30d", "90d"], Query(alias="range")] = "24h",
    tz: TZ = 0,
):
    m = await _get(db, ctx, monitor_id)
    return await stats.series(db, m.id, range_, tz_shift=-tz * 60)


@router.get("/monitors/{monitor_id}/daily")
async def monitor_daily(
    monitor_id: str, ctx: WS, db: DB, days: Annotated[int, Query(ge=7, le=365)] = 90, tz: TZ = 0
):
    m = await _get(db, ctx, monitor_id)
    return await stats.daily(db, m.id, days, tz_shift=-tz * 60)


# ---------- incidents & summary ----------


@router.get("/incidents", response_model=list[IncidentOut])
async def list_incidents(
    ctx: WS,
    db: DB,
    state: Literal["open", "resolved", "all"] = "all",
    monitor_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
):
    q = select(Incident).where(Incident.workspace_id == ctx.id)
    if state == "open":
        q = q.where(Incident.resolved_at.is_(None))
    elif state == "resolved":
        q = q.where(Incident.resolved_at.is_not(None))
    if monitor_id:
        q = q.where(Incident.monitor_id == monitor_id)
    rows = (await db.scalars(q.order_by(Incident.started_at.desc()).limit(limit))).all()
    return [_incident_out(i) for i in rows]


@router.get("/summary")
async def summary(ctx: WS, db: DB):
    now = utcnow()
    monitors = (await db.scalars(select(Monitor).where(Monitor.workspace_id == ctx.id))).all()
    counts = {s.value: 0 for s in MonitorStatus}
    for m in monitors:
        counts[m.status] = counts.get(m.status, 0) + 1
    ids = [m.id for m in monitors]
    total24 = stats.Agg()
    for a in (await stats.aggregate(db, ids, now - timedelta(hours=24))).values():
        total24.add(a.total, a.up, a.latency_sum, a.latency_count, a.latency_max)
    total30 = stats.Agg()
    for a in (await stats.aggregate(db, ids, now - timedelta(days=30))).values():
        total30.add(a.total, a.up, a.latency_sum, a.latency_count, a.latency_max)

    open_inc = (
        await db.scalars(
            select(Incident)
            .where(Incident.workspace_id == ctx.id, Incident.resolved_at.is_(None))
            .order_by(Incident.started_at)
        )
    ).all()
    recent = (
        await db.scalars(
            select(Incident).where(Incident.workspace_id == ctx.id).order_by(Incident.started_at.desc()).limit(8)
        )
    ).all()
    ssl_soon = sorted(
        (m for m in monitors if not m.paused and m.ssl_expires_at and m.ssl_expires_at < now + timedelta(days=14)),
        key=lambda m: m.ssl_expires_at,
    )
    incidents_30d = await db.scalar(
        select(func.count()).select_from(Incident).where(
            Incident.workspace_id == ctx.id, Incident.started_at >= now - timedelta(days=30)
        )
    )
    return {
        "counts": counts,
        "total": len(monitors),
        "uptime_24h": total24.uptime,
        "uptime_30d": total30.uptime,
        "avg_latency_24h": total24.avg_latency,
        "incidents_30d": incidents_30d or 0,
        "open_incidents": [_incident_out(i) for i in open_inc],
        "recent_incidents": [_incident_out(i) for i in recent],
        "ssl_expiring": [
            {**_brief(m).model_dump(), "ssl_expires_at": m.ssl_expires_at} for m in ssl_soon
        ],
    }


# ---------- public: push & widget ----------


@public_router.api_route("/push/{token}", methods=["GET", "POST"], operation_id="push_heartbeat")
async def push(
    token: str,
    status_: Annotated[Literal["up", "down"], Query(alias="status")] = "up",
    msg: Annotated[str | None, Query(max_length=300)] = None,
    ping: Annotated[float | None, Query(ge=0, le=600000)] = None,
):
    ok = await engine.record_push(token, status_ == "up", msg, ping)
    if not ok:
        raise HTTPException(404, "Неизвестный push-токен")
    return {"ok": True}


_ORDER = {MonitorStatus.down: 0, MonitorStatus.pending: 1, MonitorStatus.up: 2, MonitorStatus.paused: 3}


@public_router.get("/widget")
async def widget(request: Request, db: DB, project: str | None = None, tag: str | None = None):
    """Сводка для iOS-виджета (Scriptable) и любых внешних дашбордов. Только Bearer-токен."""
    raw = bearer_token(request)
    if not raw:
        raise HTTPException(401, "Нужен заголовок Authorization: Bearer cds_...")
    token = await resolve_api_token(raw, db)
    ws = await db.get(Workspace, token.workspace_id)
    monitors = list((await db.scalars(select(Monitor).where(Monitor.workspace_id == token.workspace_id))).all())
    # Фильтры в Python: SQLite lower() не знает кириллицу
    if project:
        p = project.strip().casefold()
        monitors = [m for m in monitors if m.project and m.project.name.casefold() == p]
    if tag:
        t = tag.strip().casefold()
        monitors = [m for m in monitors if any(x.name.casefold() == t for x in m.tags)]
    monitors.sort(key=lambda m: (_ORDER.get(m.status, 9), m.name.lower()))
    a24 = await stats.aggregate(db, [m.id for m in monitors], utcnow() - timedelta(hours=24))
    hb = await stats.hourly_bars(db, [m.id for m in monitors], hours=24)
    total = stats.Agg()
    for a in a24.values():
        total.add(a.total, a.up, a.latency_sum, a.latency_count, a.latency_max)
    counts = {s.value: 0 for s in MonitorStatus}
    for m in monitors:
        counts[m.status] = counts.get(m.status, 0) + 1
    from app.core.config import settings

    return {
        "workspace": {"name": ws.name, "slug": ws.slug} if ws else None,
        "url": f"{settings.public_url}/{ws.slug}" if ws else settings.public_url,
        "generated_at": utcnow(),
        "filter": {"project": project, "tag": tag},
        "total": len(monitors),
        "counts": counts,
        "uptime_24h": total.uptime,
        "monitors": [
            {
                "id": m.id,
                "name": m.name,
                "status": m.status,
                "target": target_of(m),
                "project": m.project.name if m.project else None,
                "latency_ms": round(m.last_latency_ms) if m.last_latency_ms is not None else None,
                "uptime_24h": a24[m.id].uptime if m.id in a24 else None,
                "since": m.last_change_at,
                "error": m.last_error if m.status == MonitorStatus.down else None,
                # доля успешных проверок по часам за 24 ч (null — нет данных)
                "bars": [round(b["up"] / b["total"], 3) if b["total"] else None for b in hb.get(m.id, [])],
            }
            for m in monitors
        ],
    }
