"""Пароли (scrypt из stdlib) и непрозрачные токены (хранятся только хэши)."""

import base64
import hashlib
import hmac
import secrets

import anyio

_N, _R, _P, _DKLEN = 2**14, 8, 1, 32


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, dklen=_DKLEN, maxmem=64 * 1024 * 1024)


def _hash_password_sync(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = _scrypt(password, salt, _N, _R, _P)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return f"scrypt${_N}${_R}${_P}${b64(salt)}${b64(dk)}"


def _verify_password_sync(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, dk = stored.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(dk)
        actual = _scrypt(password, base64.b64decode(salt), int(n), int(r), int(p))
        return hmac.compare_digest(expected, actual)
    except ValueError:
        return False


async def hash_password(password: str) -> str:
    return await anyio.to_thread.run_sync(_hash_password_sync, password)


async def verify_password(password: str, stored: str) -> bool:
    return await anyio.to_thread.run_sync(_verify_password_sync, password, stored)


# Заранее посчитанный хэш, чтобы время ответа при несуществующем email не отличалось
DUMMY_HASH = _hash_password_sync(secrets.token_urlsafe(16))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


API_TOKEN_PREFIX = "cds_"


def generate_api_token() -> str:
    return API_TOKEN_PREFIX + secrets.token_urlsafe(30)


def generate_push_token() -> str:
    return secrets.token_urlsafe(18)
