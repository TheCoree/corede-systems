from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import delete, func, select

from app.accounts.models import User, UserSession, UserStatus
from app.accounts.schemas import (
    LoginIn,
    MeOut,
    PasswordIn,
    ProfileIn,
    RegisterIn,
    RegisterOut,
    SessionOut,
    UserOut,
    WorkspaceBrief,
)
from app.core.config import settings
from app.core.db import utcnow
from app.core.deps import DB, CurrentUser
from app.core.ratelimit import RateLimiter, client_ip
from app.core.security import DUMMY_HASH, generate_session_token, hash_password, hash_token, verify_password
from app.workspaces.models import Workspace, WorkspaceMember
from app.workspaces.service import ensure_personal_workspace

router = APIRouter(prefix="/auth", tags=["auth"])

_login_limiter = RateLimiter(limit=10, window_seconds=60)
_register_limiter = RateLimiter(limit=5, window_seconds=3600)


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.session_cookie,
        token,
        max_age=settings.session_ttl_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


async def _start_session(db: DB, user: User, request: Request, response: Response) -> None:
    token = generate_session_token()
    now = utcnow()
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_token(token),
            user_agent=(request.headers.get("user-agent") or "")[:400],
            ip=client_ip(request),
            created_at=now,
            last_seen_at=now,
            expires_at=now + timedelta(days=settings.session_ttl_days),
        )
    )
    user.last_login_at = now
    await db.commit()
    _set_cookie(response, token)


async def build_me(db: DB, user: User) -> MeOut:
    rows = await db.execute(
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
        .order_by(Workspace.created_at)
    )
    workspaces = [WorkspaceBrief(id=w.id, slug=w.slug, name=w.name, role=role) for w, role in rows.all()]
    pending = 0
    if user.is_admin:
        pending = await db.scalar(select(func.count()).select_from(User).where(User.status == UserStatus.pending)) or 0
    return MeOut(user=UserOut.model_validate(user), workspaces=workspaces, pending_users=pending)


@router.post("/register", response_model=RegisterOut, status_code=201)
async def register(data: RegisterIn, request: Request, response: Response, db: DB):
    _register_limiter.hit(client_ip(request))
    email = data.email.lower()
    is_first = not await db.scalar(select(User.id).limit(1))
    if not is_first and not settings.allow_registration:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Регистрация закрыта")
    if await db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Этот email уже зарегистрирован")

    user = User(
        email=email,
        name=data.name.strip(),
        password_hash=await hash_password(data.password),
        note=(data.note or "").strip() or None,
    )
    if is_first:
        # Первый пользователь системы — администратор, без подтверждения
        user.status = UserStatus.active
        user.is_admin = True
        user.approved_at = utcnow()
    db.add(user)
    await db.flush()

    if is_first:
        await ensure_personal_workspace(db, user)
        await _start_session(db, user, request, response)
        return RegisterOut(status="active", message="Аккаунт администратора создан")

    await db.commit()
    return RegisterOut(status="pending", message="Заявка отправлена. Дождитесь подтверждения администратора.")


@router.post("/login", response_model=MeOut)
async def login(data: LoginIn, request: Request, response: Response, db: DB):
    _login_limiter.hit(f"{client_ip(request)}:{data.email.lower()}")
    user = await db.scalar(select(User).where(User.email == data.email.lower()))
    ok = await verify_password(data.password, user.password_hash if user else DUMMY_HASH)
    if user is None or not ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный email или пароль")
    match user.status:
        case UserStatus.pending:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Аккаунт ожидает подтверждения администратора")
        case UserStatus.rejected:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Заявка на доступ отклонена")
        case UserStatus.disabled:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Аккаунт отключён")
    await ensure_personal_workspace(db, user)
    await _start_session(db, user, request, response)
    return await build_me(db, user)


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: DB):
    raw = request.cookies.get(settings.session_cookie)
    if raw:
        await db.execute(delete(UserSession).where(UserSession.token_hash == hash_token(raw)))
        await db.commit()
    response.delete_cookie(settings.session_cookie, path="/")


@router.get("/me", response_model=MeOut)
async def me(user: CurrentUser, db: DB):
    return await build_me(db, user)


@router.patch("/me", response_model=UserOut)
async def update_profile(data: ProfileIn, user: CurrentUser, db: DB):
    user.name = data.name.strip()
    await db.commit()
    return user


@router.post("/password", status_code=204)
async def change_password(data: PasswordIn, request: Request, user: CurrentUser, db: DB):
    if not await verify_password(data.current, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Текущий пароль указан неверно")
    user.password_hash = await hash_password(data.new)
    # Завершаем все остальные сессии
    current_id = getattr(request.state, "session_id", None)
    await db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.id != current_id))
    await db.commit()


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(request: Request, user: CurrentUser, db: DB):
    rows = await db.scalars(
        select(UserSession)
        .where(UserSession.user_id == user.id, UserSession.expires_at > utcnow())
        .order_by(UserSession.last_seen_at.desc())
    )
    current_id = getattr(request.state, "session_id", None)
    return [SessionOut.model_validate(s).model_copy(update={"current": s.id == current_id}) for s in rows]


@router.delete("/sessions/{session_id}", status_code=204)
async def revoke_session(session_id: str, user: CurrentUser, db: DB):
    await db.execute(delete(UserSession).where(UserSession.id == session_id, UserSession.user_id == user.id))
    await db.commit()
