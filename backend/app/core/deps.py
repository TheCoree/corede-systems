from dataclasses import dataclass
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Path, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import User, UserSession, UserStatus
from app.core.config import settings
from app.core.db import get_db, utcnow
from app.core.security import API_TOKEN_PREFIX, hash_token
from app.workspaces.models import ApiToken, Role, TokenScope, Workspace, WorkspaceMember

DB = Annotated[AsyncSession, Depends(get_db)]

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


async def _session_from_cookie(request: Request, db: AsyncSession) -> UserSession | None:
    raw = request.cookies.get(settings.session_cookie)
    if not raw:
        return None
    sess = await db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(raw)))
    now = utcnow()
    if sess is None or sess.expires_at <= now:
        return None
    if now - sess.last_seen_at > timedelta(minutes=5):
        sess.last_seen_at = now
        await db.commit()
    return sess


async def optional_user(request: Request, db: DB) -> User | None:
    sess = await _session_from_cookie(request, db)
    if sess is None:
        return None
    user = await db.get(User, sess.user_id)
    if user is None or user.status != UserStatus.active:
        return None
    request.state.session_id = sess.id
    return user


async def current_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Требуется вход")
    return user


async def admin_user(user: Annotated[User, Depends(current_user)]) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Только для администраторов")
    return user


CurrentUser = Annotated[User, Depends(current_user)]
AdminUser = Annotated[User, Depends(admin_user)]


def bearer_token(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        if token.startswith(API_TOKEN_PREFIX):
            return token
    return None


async def resolve_api_token(raw: str, db: AsyncSession) -> ApiToken:
    token = await db.scalar(select(ApiToken).where(ApiToken.token_hash == hash_token(raw)))
    now = utcnow()
    if token is None or (token.expires_at and token.expires_at <= now):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный или просроченный токен")
    owner = await db.get(User, token.user_id)
    if owner is None or owner.status != UserStatus.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Владелец токена отключён")
    if token.last_used_at is None or now - token.last_used_at > timedelta(minutes=1):
        token.last_used_at = now
        await db.commit()
    return token


@dataclass(slots=True)
class WorkspaceContext:
    workspace: Workspace
    user: User | None
    role: str | None
    token: ApiToken | None

    @property
    def id(self) -> str:
        return self.workspace.id

    @property
    def is_manager(self) -> bool:
        return self.token is None and self.role in (Role.owner, Role.admin)


async def workspace_ctx(
    request: Request,
    db: DB,
    ws: Annotated[str, Path(description="slug пространства")],
) -> WorkspaceContext:
    workspace = await db.scalar(select(Workspace).where(Workspace.slug == ws))
    if workspace is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пространство не найдено")

    raw = bearer_token(request)
    if raw:
        token = await resolve_api_token(raw, db)
        if token.workspace_id != workspace.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Токен выдан для другого пространства")
        if request.method not in _SAFE_METHODS and token.scope != TokenScope.write:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "У токена только права на чтение")
        return WorkspaceContext(workspace, None, None, token)

    user = await optional_user(request, db)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Требуется вход")
    member = await db.get(WorkspaceMember, (workspace.id, user.id))
    if member is None:
        if not user.is_admin:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Пространство не найдено")
        role = Role.admin  # системный админ видит всё
    else:
        role = member.role
    return WorkspaceContext(workspace, user, role, None)


WS = Annotated[WorkspaceContext, Depends(workspace_ctx)]


def require_session(ctx: WorkspaceContext) -> User:
    """Действия, недоступные API-токенам (управление токенами, каналами и т.п.)."""
    if ctx.user is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Недоступно для API-токена")
    return ctx.user
