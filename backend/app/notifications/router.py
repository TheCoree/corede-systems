from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import DB, WS, WorkspaceContext, require_session
from app.notifications.dispatcher import Event, send
from app.notifications.models import ChannelType, NotificationChannel

router = APIRouter(prefix="/channels", tags=["notifications"])

SECRET_KEYS = {"bot_token", "url"}
MASK = "••••"


class ChannelIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    type: Literal["telegram", "discord", "slack", "webhook"]
    config: dict[str, str]
    enabled: bool = True


class ChannelPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    config: dict[str, str] | None = None
    enabled: bool | None = None


class ChannelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    type: str
    config: dict
    enabled: bool
    created_at: datetime
    last_error: str | None
    last_sent_at: datetime | None


def _mask(value: str) -> str:
    return MASK + value[-4:] if len(value) > 8 else MASK


def _out(ch: NotificationChannel) -> ChannelOut:
    cfg = {k: (_mask(v) if k in SECRET_KEYS and isinstance(v, str) else v) for k, v in (ch.config or {}).items()}
    return ChannelOut.model_validate(ch).model_copy(update={"config": cfg})


def _validate(type_: str, cfg: dict[str, str]) -> dict[str, str]:
    cfg = {k: v.strip() for k, v in cfg.items()}
    if type_ == ChannelType.telegram:
        if not cfg.get("bot_token") or not cfg.get("chat_id"):
            raise HTTPException(422, "Укажите токен бота и chat_id")
        return {"bot_token": cfg["bot_token"], "chat_id": cfg["chat_id"]}
    try:
        HttpUrl(cfg.get("url", ""))
    except Exception:  # noqa: BLE001
        raise HTTPException(422, "Укажите корректный URL вебхука") from None
    return {"url": cfg["url"]}


async def _get(db: DB, ctx: WorkspaceContext, channel_id: str) -> NotificationChannel:
    ch = await db.get(NotificationChannel, channel_id)
    if ch is None or ch.workspace_id != ctx.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Канал не найден")
    return ch


@router.get("", response_model=list[ChannelOut])
async def list_channels(ctx: WS, db: DB):
    require_session(ctx)
    rows = await db.scalars(
        select(NotificationChannel)
        .where(NotificationChannel.workspace_id == ctx.id)
        .order_by(NotificationChannel.created_at)
    )
    return [_out(c) for c in rows]


@router.post("", response_model=ChannelOut, status_code=201)
async def create_channel(data: ChannelIn, ctx: WS, db: DB):
    require_session(ctx)
    ch = NotificationChannel(
        workspace_id=ctx.id,
        name=data.name.strip(),
        type=data.type,
        config=_validate(data.type, data.config),
        enabled=data.enabled,
    )
    db.add(ch)
    await db.commit()
    return _out(ch)


@router.patch("/{channel_id}", response_model=ChannelOut)
async def update_channel(channel_id: str, data: ChannelPatch, ctx: WS, db: DB):
    require_session(ctx)
    ch = await _get(db, ctx, channel_id)
    if data.name is not None:
        ch.name = data.name.strip()
    if data.enabled is not None:
        ch.enabled = data.enabled
    if data.config is not None:
        merged = dict(ch.config or {})
        for k, v in data.config.items():
            if not v.startswith(MASK):  # маска = «оставить как было»
                merged[k] = v
        ch.config = _validate(ch.type, merged)
    await db.commit()
    return _out(ch)


@router.delete("/{channel_id}", status_code=204)
async def delete_channel(channel_id: str, ctx: WS, db: DB):
    require_session(ctx)
    await db.delete(await _get(db, ctx, channel_id))
    await db.commit()


@router.post("/{channel_id}/test")
async def test_channel(channel_id: str, ctx: WS, db: DB):
    require_session(ctx)
    ch = await _get(db, ctx, channel_id)
    event = Event(
        kind="test",
        title="Тестовое уведомление",
        lines=[f"Канал «{ch.name}» в пространстве «{ctx.workspace.name}» работает."],
        link=f"{settings.public_url}/{ctx.workspace.slug}",
    )
    try:
        await send(ch.type, ch.config, event)
    except Exception as exc:  # noqa: BLE001
        ch.last_error = str(exc)[:500]
        await db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Не удалось отправить: {exc}") from None
    ch.last_error = None
    await db.commit()
    return {"ok": True}
