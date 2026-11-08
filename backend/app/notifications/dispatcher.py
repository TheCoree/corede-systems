"""Отправка событий во внешние каналы. Любой модуль может вызвать `dispatch()`."""

import asyncio
import html
import logging
from dataclasses import dataclass, field
from typing import Literal

import httpx
from sqlalchemy import select

from app.core.db import SessionLocal, utcnow
from app.notifications.models import ChannelType, NotificationChannel

log = logging.getLogger("corede.notify")

Kind = Literal["down", "up", "ssl", "test"]

_ICON = {"down": "🔴", "up": "🟢", "ssl": "🟡", "test": "🔔"}
_DISCORD_COLOR = {"down": 0xEF4444, "up": 0x22C55E, "ssl": 0xF59E0B, "test": 0x3B82F6}


@dataclass(slots=True)
class Event:
    kind: Kind
    title: str
    lines: list[str] = field(default_factory=list)
    link: str | None = None
    data: dict = field(default_factory=dict)


_client: httpx.AsyncClient | None = None


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=10, headers={"User-Agent": "coredeSystems-Notify/1.0"})
    return _client


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def send(channel_type: str, config: dict, event: Event) -> None:
    icon = _ICON[event.kind]
    client = _http()
    match channel_type:
        case ChannelType.telegram:
            parts = [f"{icon} <b>{html.escape(event.title)}</b>"]
            parts += [html.escape(line) for line in event.lines]
            if event.link:
                parts.append(f'<a href="{html.escape(event.link, quote=True)}">Открыть в панели</a>')
            r = await client.post(
                f"https://api.telegram.org/bot{config['bot_token']}/sendMessage",
                json={
                    "chat_id": config["chat_id"],
                    "text": "\n".join(parts),
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True,
                },
            )
        case ChannelType.discord:
            r = await client.post(
                config["url"],
                json={
                    "username": "corede Systems",
                    "embeds": [
                        {
                            "title": f"{icon} {event.title}",
                            "description": "\n".join(event.lines),
                            "url": event.link,
                            "color": _DISCORD_COLOR[event.kind],
                        }
                    ],
                },
            )
        case ChannelType.slack:
            text = f"{icon} *{event.title}*\n" + "\n".join(event.lines)
            if event.link:
                text += f"\n<{event.link}|Открыть в панели>"
            r = await client.post(config["url"], json={"text": text})
        case ChannelType.webhook:
            r = await client.post(
                config["url"],
                json={"event": event.kind, "title": event.title, "lines": event.lines, "url": event.link, **event.data},
            )
        case _:
            raise ValueError(f"Неизвестный тип канала: {channel_type}")
    if r.status_code >= 400:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:200]}")


async def _deliver(channel_id: str, channel_type: str, config: dict, event: Event) -> None:
    error: str | None = None
    try:
        await send(channel_type, config, event)
    except Exception as exc:  # noqa: BLE001
        error = str(exc)[:500] or exc.__class__.__name__
        log.warning("notify channel %s failed: %s", channel_id, error)
    async with SessionLocal() as db:
        ch = await db.get(NotificationChannel, channel_id)
        if ch is not None:
            ch.last_error = error
            if error is None:
                ch.last_sent_at = utcnow()
            await db.commit()


async def dispatch(workspace_id: str, event: Event) -> None:
    async with SessionLocal() as db:
        channels = (
            await db.scalars(
                select(NotificationChannel).where(
                    NotificationChannel.workspace_id == workspace_id, NotificationChannel.enabled.is_(True)
                )
            )
        ).all()
        targets = [(c.id, c.type, dict(c.config)) for c in channels]
    if targets:
        await asyncio.gather(*(_deliver(cid, t, cfg, event) for cid, t, cfg in targets))


_background: set[asyncio.Task] = set()


def dispatch_soon(workspace_id: str, event: Event) -> None:
    """Fire-and-forget: не задерживает обработку проверок."""
    task = asyncio.create_task(dispatch(workspace_id, event))
    _background.add(task)
    task.add_done_callback(_background.discard)
