from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modules.monitoring.probes import parse_status_spec

Method = Literal["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


class MonitorIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: Literal["http", "tcp", "push"] = "http"
    project_id: str | None = None
    tag_ids: list[str] = Field(default_factory=list, max_length=50)

    url: str | None = Field(default=None, max_length=2048)
    method: Method = "GET"
    expected_status: str = Field(default="200-399", max_length=64)
    keyword: str | None = Field(default=None, max_length=255)
    keyword_invert: bool = False
    headers: dict[str, str] = Field(default_factory=dict)
    follow_redirects: bool = True
    verify_ssl: bool = True

    host: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)

    interval: int = Field(default=60, ge=20, le=86400)
    timeout: int = Field(default=10, ge=1, le=3600)
    confirmations: int = Field(default=2, ge=1, le=10)
    notify: bool = True
    paused: bool = False

    @field_validator("name", "keyword", "host", mode="before")
    @classmethod
    def _strip(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @field_validator("expected_status")
    @classmethod
    def _status(cls, v: str) -> str:
        try:
            parse_status_spec(v)
        except ValueError:
            raise ValueError("Формат: 200-299, 301, 404") from None
        return v.replace(" ", "")

    @model_validator(mode="after")
    def _by_type(self):
        if not self.name:
            raise ValueError("Укажите название")
        match self.type:
            case "http":
                url = (self.url or "").strip()
                if not url:
                    raise ValueError("Укажите URL")
                if "://" not in url:
                    url = "https://" + url
                if not url.startswith(("http://", "https://")):
                    raise ValueError("URL должен начинаться с http:// или https://")
                self.url = url
            case "tcp":
                if not self.host or not self.port:
                    raise ValueError("Укажите хост и порт")
                self.host = self.host.removeprefix("tcp://").split("/")[0]
            case "push":
                pass
        return self


class MonitorPatch(BaseModel):
    name: str | None = None
    type: Literal["http", "tcp", "push"] | None = None
    project_id: str | None = None
    tag_ids: list[str] | None = None
    url: str | None = None
    method: Method | None = None
    expected_status: str | None = None
    keyword: str | None = None
    keyword_invert: bool | None = None
    headers: dict[str, str] | None = None
    follow_redirects: bool | None = None
    verify_ssl: bool | None = None
    host: str | None = None
    port: int | None = None
    interval: int | None = None
    timeout: int | None = None
    confirmations: int | None = None
    notify: bool | None = None
    paused: bool | None = None


class Ref(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    color: str


class Bar(BaseModel):
    t: datetime
    total: int
    up: int


class MonitorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    type: str
    target: str = ""
    project: Ref | None
    tags: list[Ref]

    url: str | None
    method: str
    expected_status: str
    keyword: str | None
    keyword_invert: bool
    headers: dict
    follow_redirects: bool
    verify_ssl: bool
    host: str | None
    port: int | None
    push_token: str | None

    interval: int
    timeout: int
    confirmations: int
    notify: bool
    paused: bool

    status: str
    fail_streak: int
    fail_since: datetime | None
    last_checked_at: datetime | None
    next_check_at: datetime | None
    last_change_at: datetime | None
    last_latency_ms: float | None
    last_status_code: int | None
    last_error: str | None
    ssl_expires_at: datetime | None
    ssl_issuer: str | None
    created_at: datetime

    uptime_24h: float | None = None
    uptime_7d: float | None = None
    uptime_30d: float | None = None
    avg_latency_24h: float | None = None
    bars: list[Bar] = Field(default_factory=list)


class CheckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    checked_at: datetime
    ok: bool
    latency_ms: float | None
    status_code: int | None
    error: str | None


class MonitorBrief(BaseModel):
    id: str
    name: str
    type: str
    target: str
    status: str
    project: Ref | None


class IncidentOut(BaseModel):
    id: str
    monitor: MonitorBrief
    started_at: datetime
    resolved_at: datetime | None
    cause: str | None
    duration_seconds: float


class BulkIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=1000)
    action: Literal["pause", "resume", "delete", "move", "tag", "untag", "check"]
    project_id: str | None = None
    tag_id: str | None = None


class CheckResultOut(BaseModel):
    ok: bool
    latency_ms: float | None
    status_code: int | None
    error: str | None
