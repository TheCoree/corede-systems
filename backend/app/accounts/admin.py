from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, select

from app.accounts.models import User, UserSession, UserStatus
from app.accounts.schemas import AdminUserOut, AdminUserPatch
from app.core.db import utcnow
from app.core.deps import DB, AdminUser
from app.workspaces.models import Workspace, WorkspaceMember
from app.workspaces.service import ensure_personal_workspace

router = APIRouter(prefix="/admin", tags=["admin"])


async def _out(db: DB, user: User) -> AdminUserOut:
    count = await db.scalar(select(func.count()).select_from(WorkspaceMember).where(WorkspaceMember.user_id == user.id))
    return AdminUserOut.model_validate(user).model_copy(update={"workspaces": count or 0})


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(_: AdminUser, db: DB, status_: str | None = Query(default=None, alias="status")):
    q = select(User).order_by(User.created_at.desc())
    if status_:
        q = q.where(User.status == status_)
    users = (await db.scalars(q)).all()
    counts = dict(
        (await db.execute(select(WorkspaceMember.user_id, func.count()).group_by(WorkspaceMember.user_id))).all()
    )
    return [AdminUserOut.model_validate(u).model_copy(update={"workspaces": counts.get(u.id, 0)}) for u in users]


@router.get("/stats")
async def stats(_: AdminUser, db: DB):
    rows = (await db.execute(select(User.status, func.count()).group_by(User.status))).all()
    return {s: c for s, c in rows}


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def update_user(user_id: str, data: AdminUserPatch, admin: AdminUser, db: DB):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден")
    if user.id == admin.id and (data.status not in (None, UserStatus.active) or data.is_admin is False):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нельзя отключить или разжаловать самого себя")

    if data.status is not None and data.status != user.status:
        user.status = data.status
        if data.status == UserStatus.active:
            user.approved_at = user.approved_at or utcnow()
            await ensure_personal_workspace(db, user)
        else:
            await db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    if data.is_admin is not None:
        user.is_admin = data.is_admin
    await db.commit()
    return await _out(db, user)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str, admin: AdminUser, db: DB):
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нельзя удалить самого себя")
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден")
    # Пространства, где пользователь — единственный участник, удаляются вместе с ним
    owned = (await db.scalars(select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id == user.id))).all()
    for ws_id in owned:
        members = await db.scalar(
            select(func.count()).select_from(WorkspaceMember).where(WorkspaceMember.workspace_id == ws_id)
        )
        if members == 1:
            ws = await db.get(Workspace, ws_id)
            if ws:
                await db.delete(ws)
    await db.delete(user)
    await db.commit()
