from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, Column, ForeignKey, Index, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, new_id, utcnow
from app.workspaces.models import Project, Tag


class MonitorType(StrEnum):
    http = "http"  # HTTP(S): код ответа, опционально ключевое слово
    tcp = "tcp"  # открыт ли порт
    push = "push"  # heartbeat: сервер сам стучится к нам


class MonitorStatus(StrEnum):
    pending = "pending"
    up = "up"
    down = "down"
    paused = "paused"


monitor_tags = Table(
    "monitor_tags",
    Base.metadata,
    Column("monitor_id", ForeignKey("monitors.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Monitor(Base):
    __tablename__ = "monitors"
    __table_args__ = (Index("ix_monitors_due", "paused", "next_check_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), index=True, default=None
    )

    name: Mapped[str] = mapped_column(String(120))
    type: Mapped[str] = mapped_column(String(16), default=MonitorType.http)

    # http
    url: Mapped[str | None] = mapped_column(String(2048), default=None)
    method: Mapped[str] = mapped_column(String(8), default="GET")
    expected_status: Mapped[str] = mapped_column(String(64), default="200-399")
    keyword: Mapped[str | None] = mapped_column(String(255), default=None)
    keyword_invert: Mapped[bool] = mapped_column(default=False)
    headers: Mapped[dict] = mapped_column(JSON, default=dict)
    follow_redirects: Mapped[bool] = mapped_column(default=True)
    verify_ssl: Mapped[bool] = mapped_column(default=True)
    # tcp
    host: Mapped[str | None] = mapped_column(String(255), default=None)
    port: Mapped[int | None] = mapped_column(Integer, default=None)
    # push
    push_token: Mapped[str | None] = mapped_column(String(64), unique=True, default=None)

    interval: Mapped[int] = mapped_column(Integer, default=60)  # секунды
    timeout: Mapped[int] = mapped_column(Integer, default=10)
    confirmations: Mapped[int] = mapped_column(Integer, default=2)  # подряд неудач до статуса down
    notify: Mapped[bool] = mapped_column(default=True)
    paused: Mapped[bool] = mapped_column(default=False)

    # состояние
    status: Mapped[str] = mapped_column(String(16), default=MonitorStatus.pending, index=True)
    fail_streak: Mapped[int] = mapped_column(Integer, default=0)
    fail_since: Mapped[datetime | None] = mapped_column(default=None)  # первая неудача текущей серии
    last_checked_at: Mapped[datetime | None] = mapped_column(default=None)
    next_check_at: Mapped[datetime | None] = mapped_column(default=None)
    last_change_at: Mapped[datetime | None] = mapped_column(default=None)
    last_latency_ms: Mapped[float | None] = mapped_column(default=None)
    last_status_code: Mapped[int | None] = mapped_column(Integer, default=None)
    last_error: Mapped[str | None] = mapped_column(String(500), default=None)

    ssl_expires_at: Mapped[datetime | None] = mapped_column(default=None)
    ssl_issuer: Mapped[str | None] = mapped_column(String(255), default=None)
    ssl_checked_at: Mapped[datetime | None] = mapped_column(default=None)
    ssl_warn_level: Mapped[int | None] = mapped_column(Integer, default=None)

    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    project: Mapped[Project | None] = relationship(lazy="joined")
    tags: Mapped[list[Tag]] = relationship(secondary=monitor_tags, lazy="selectin", order_by=Tag.name)


class Check(Base):
    __tablename__ = "checks"
    __table_args__ = (Index("ix_checks_monitor_time", "monitor_id", "checked_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    monitor_id: Mapped[str] = mapped_column(ForeignKey("monitors.id", ondelete="CASCADE"))
    checked_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    ok: Mapped[bool]
    latency_ms: Mapped[float | None] = mapped_column(default=None)
    status_code: Mapped[int | None] = mapped_column(Integer, default=None)
    error: Mapped[str | None] = mapped_column(String(500), default=None)


class StatHourly(Base):
    """Почасовые агрегаты — основа для uptime за любой период. Хранятся бессрочно."""

    __tablename__ = "monitor_stats_hourly"

    monitor_id: Mapped[str] = mapped_column(ForeignKey("monitors.id", ondelete="CASCADE"), primary_key=True)
    hour: Mapped[datetime] = mapped_column(primary_key=True)
    total: Mapped[int] = mapped_column(Integer, default=0)
    up: Mapped[int] = mapped_column(Integer, default=0)
    latency_sum: Mapped[float] = mapped_column(default=0.0)
    latency_count: Mapped[int] = mapped_column(Integer, default=0)
    latency_max: Mapped[float] = mapped_column(default=0.0)


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    monitor_id: Mapped[str] = mapped_column(ForeignKey("monitors.id", ondelete="CASCADE"), index=True)
    started_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(default=None)
    cause: Mapped[str | None] = mapped_column(Text, default=None)

    monitor: Mapped[Monitor] = relationship(lazy="joined")
