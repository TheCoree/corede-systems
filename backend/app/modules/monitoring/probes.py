"""Сетевые пробы. Ничего не знают о БД — получают Target, возвращают ProbeResult."""

import asyncio
import socket
import ssl
import time
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import UTC, datetime
from urllib.parse import urlsplit

import httpx

from app.core.config import settings

USER_AGENT = "coredeSystems-Monitor/1.0 (+uptime)"
MAX_BODY = 2_000_000


@dataclass(slots=True, frozen=True)
class Target:
    id: str
    workspace_id: str
    type: str
    url: str | None = None
    method: str = "GET"
    expected_status: str = "200-399"
    keyword: str | None = None
    keyword_invert: bool = False
    headers: dict = field(default_factory=dict)
    follow_redirects: bool = True
    verify_ssl: bool = True
    host: str | None = None
    port: int | None = None
    timeout: int = 10
    check_ssl: bool = False


@dataclass(slots=True)
class ProbeResult:
    ok: bool
    latency_ms: float | None = None
    status_code: int | None = None
    error: str | None = None
    ssl_checked: bool = False
    ssl_expires_at: datetime | None = None
    ssl_issuer: str | None = None


def parse_status_spec(spec: str) -> list[tuple[int, int]]:
    """'200-299, 301, 404' -> [(200, 299), (301, 301), (404, 404)]"""
    ranges: list[tuple[int, int]] = []
    for part in spec.replace(" ", "").split(","):
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            lo, hi = int(a), int(b)
        else:
            lo = hi = int(part)
        if not (100 <= lo <= hi <= 599):
            raise ValueError(part)
        ranges.append((lo, hi))
    if not ranges:
        raise ValueError(spec)
    return ranges


def status_matches(code: int, spec: str) -> bool:
    try:
        return any(lo <= code <= hi for lo, hi in parse_status_spec(spec))
    except ValueError:
        return 200 <= code < 400


def _chain(exc: BaseException) -> list[BaseException]:
    out, seen = [], set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        out.append(cur)
        cur = cur.__cause__ or cur.__context__
    return out


def _friendly(exc: BaseException) -> str:
    chain = _chain(exc)
    if any(isinstance(e, socket.gaierror) for e in chain):
        return "DNS: домен не найден"
    if any(isinstance(e, ConnectionRefusedError) for e in chain):
        return "Соединение отклонено"
    if any(isinstance(e, ssl.SSLCertVerificationError) for e in chain):
        cert_err = next(e for e in chain if isinstance(e, ssl.SSLCertVerificationError))
        return f"SSL: {cert_err.verify_message or 'сертификат не прошёл проверку'}"
    if any(isinstance(e, ssl.SSLEOFError) for e in chain):
        return "SSL: сервер оборвал соединение при рукопожатии"
    if ssl_err := next((e for e in chain if isinstance(e, ssl.SSLError)), None):
        return f"SSL: {ssl_err.reason or ssl_err}"
    match exc:
        case httpx.ConnectTimeout():
            return "Таймаут подключения"
        case httpx.ReadTimeout() | httpx.WriteTimeout() | httpx.PoolTimeout() | TimeoutError():
            return "Таймаут ответа"
        case httpx.TooManyRedirects():
            return "Слишком много редиректов"
        case httpx.ConnectError() | httpx.RemoteProtocolError() | OSError():
            msg = str(exc) or exc.__class__.__name__
            low = msg.lower()
            if "getaddrinfo" in low or "name or service not known" in low or "nodename nor servname" in low:
                return "DNS: домен не найден"
            if "certificate" in low or "ssl" in low:
                return f"SSL: {msg}"
            if "refused" in low or "10061" in low or "all connection attempts failed" in low:
                return "Соединение отклонено"
            if "unreachable" in low:
                return "Хост недоступен"
            if msg == exc.__class__.__name__ or not msg:
                return "Не удалось подключиться"
            return f"Ошибка подключения: {msg}"
        case _:
            return f"{exc.__class__.__name__}: {exc}"[:500]


class Prober:
    def __init__(self) -> None:
        self._clients: dict[bool, httpx.AsyncClient] = {}

    def _client(self, verify: bool) -> httpx.AsyncClient:
        client = self._clients.get(verify)
        if client is None:
            client = httpx.AsyncClient(
                verify=verify,
                # проверяем доступность напрямую, а не через системный HTTP(S)_PROXY
                trust_env=settings.probe_use_env_proxy,
                headers={"User-Agent": USER_AGENT, "Accept": "*/*"},
                # без keep-alive: каждая проверка честно проходит DNS + TCP + TLS
                limits=httpx.Limits(max_keepalive_connections=0, max_connections=500),
            )
            self._clients[verify] = client
        return client

    async def aclose(self) -> None:
        for c in self._clients.values():
            await c.aclose()
        self._clients.clear()

    async def run(self, t: Target) -> ProbeResult:
        try:
            async with asyncio.timeout(t.timeout + 5):
                match t.type:
                    case "http":
                        result = await self._http(t)
                    case "tcp":
                        result = await self._tcp(t)
                    case _:
                        return ProbeResult(ok=False, error=f"Тип {t.type} не проверяется активно")
        except TimeoutError:
            result = ProbeResult(ok=False, error="Таймаут")
        if t.check_ssl and t.url:
            await self._attach_ssl(t, result)
        return result

    async def _http(self, t: Target) -> ProbeResult:
        assert t.url
        client = self._client(t.verify_ssl)
        start = time.perf_counter()
        try:
            req = client.build_request(t.method, t.url, headers=t.headers or None, timeout=t.timeout)
            resp = await client.send(req, follow_redirects=t.follow_redirects, stream=True)
            latency = (time.perf_counter() - start) * 1000
            body: str | None = None
            try:
                if t.keyword:
                    buf = bytearray()
                    async for chunk in resp.aiter_bytes():
                        buf += chunk
                        if len(buf) > MAX_BODY:
                            break
                    body = bytes(buf).decode(resp.encoding or "utf-8", errors="replace")
            finally:
                await resp.aclose()
        except Exception as exc:  # noqa: BLE001
            return ProbeResult(ok=False, error=_friendly(exc))

        code = resp.status_code
        if not status_matches(code, t.expected_status):
            return ProbeResult(ok=False, latency_ms=latency, status_code=code, error=f"Неожиданный код ответа {code}")
        if t.keyword and body is not None:
            found = t.keyword in body
            if found and t.keyword_invert:
                return ProbeResult(False, latency, code, f"На странице найдено «{t.keyword}»")
            if not found and not t.keyword_invert:
                return ProbeResult(False, latency, code, f"Ключевое слово «{t.keyword}» не найдено")
        return ProbeResult(ok=True, latency_ms=latency, status_code=code)

    async def _tcp(self, t: Target) -> ProbeResult:
        assert t.host and t.port
        start = time.perf_counter()
        try:
            _, writer = await asyncio.wait_for(asyncio.open_connection(t.host, t.port), t.timeout)
        except Exception as exc:  # noqa: BLE001
            return ProbeResult(ok=False, error=_friendly(exc))
        latency = (time.perf_counter() - start) * 1000
        writer.close()
        with suppress(Exception):
            await writer.wait_closed()
        return ProbeResult(ok=True, latency_ms=latency)

    async def _attach_ssl(self, t: Target, result: ProbeResult) -> None:
        parts = urlsplit(t.url or "")
        if parts.scheme != "https" or not parts.hostname:
            return
        result.ssl_checked = True
        with suppress(Exception):
            result.ssl_expires_at, result.ssl_issuer = await ssl_info(parts.hostname, parts.port or 443, t.timeout)


async def ssl_info(host: str, port: int, timeout: float) -> tuple[datetime, str | None]:
    ctx = ssl.create_default_context()
    _, writer = await asyncio.wait_for(
        asyncio.open_connection(host, port, ssl=ctx, server_hostname=host), timeout
    )
    try:
        cert = writer.get_extra_info("peercert") or {}
    finally:
        writer.close()
        with suppress(Exception):
            await writer.wait_closed()
    expires = datetime.fromtimestamp(ssl.cert_time_to_seconds(cert["notAfter"]), UTC)
    issuer_parts = {k: v for rdn in cert.get("issuer", ()) for k, v in rdn}
    return expires, issuer_parts.get("organizationName") or issuer_parts.get("commonName")
