from datetime import timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.core.db import utcnow
from app.core.deps import DB, WS, CurrentUser, WorkspaceContext, require_session
from app.core.security import generate_api_token, hash_token
from app.workspaces.models import ApiToken, Project, Role, Tag
from app.workspaces.schemas import (
    ProjectIn,
    ProjectOut,
    ProjectPatch,
    TagIn,
    TagOut,
    TagPatch,
    TokenCreated,
    TokenIn,
    TokenOut,
    WorkspaceIn,
    WorkspaceOut,
    WorkspacePatch,
)
from app.workspaces.service import RESERVED_SLUGS, SLUG_RE, create_workspace

# /api/workspaces — действия пользователя
user_router = APIRouter(prefix="/workspaces", tags=["workspaces"])
# /api/w/{ws}/... — всё внутри пространства
router = APIRouter(tags=["workspace"])


def _require_manager(ctx: WorkspaceContext) -> None:
    require_session(ctx)
    if not ctx.is_manager:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Недостаточно прав в пространстве")


@user_router.post("", response_model=WorkspaceOut, status_code=201)
async def create(data: WorkspaceIn, user: CurrentUser, db: DB):
    ws = await create_workspace(db, user, data.name.strip())
    await db.commit()
    return WorkspaceOut.model_validate(ws).model_copy(update={"role": Role.owner})


# ---------- workspace ----------


@router.get("", response_model=WorkspaceOut)
async def get_workspace(ctx: WS):
    return WorkspaceOut.model_validate(ctx.workspace).model_copy(update={"role": ctx.role})


@router.patch("", response_model=WorkspaceOut)
async def update_workspace(data: WorkspacePatch, ctx: WS, db: DB):
    _require_manager(ctx)
    ws = await db.merge(ctx.workspace)
    if data.name is not None:
        ws.name = data.name.strip()
    if data.slug is not None and data.slug != ws.slug:
        slug = data.slug.lower()
        if not SLUG_RE.match(slug) or slug in RESERVED_SLUGS:
            raise HTTPException(422, "Адрес: латиница, цифры и дефис, 1–48 символов")
        ws.slug = slug
    try:
        await db.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Этот адрес уже занят") from None
    return WorkspaceOut.model_validate(ws).model_copy(update={"role": ctx.role})


@router.delete("", status_code=204)
async def delete_workspace(ctx: WS, db: DB):
    require_session(ctx)
    if ctx.role != Role.owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Удалить пространство может только владелец")
    await db.delete(await db.merge(ctx.workspace))
    await db.commit()


# ---------- projects ----------


async def _get_project(db: DB, ctx: WorkspaceContext, project_id: str) -> Project:
    p = await db.get(Project, project_id)
    if p is None or p.workspace_id != ctx.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Проект не найден")
    return p


@router.get("/projects", response_model=list[ProjectOut])
async def list_projects(ctx: WS, db: DB):
    return (await db.scalars(select(Project).where(Project.workspace_id == ctx.id).order_by(Project.name))).all()


@router.post("/projects", response_model=ProjectOut, status_code=201)
async def create_project(data: ProjectIn, ctx: WS, db: DB):
    p = Project(workspace_id=ctx.id, name=data.name.strip(), description=data.description, color=data.color)
    db.add(p)
    await db.commit()
    return p


@router.patch("/projects/{project_id}", response_model=ProjectOut)
async def update_project(project_id: str, data: ProjectPatch, ctx: WS, db: DB):
    p = await _get_project(db, ctx, project_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(p, k, v.strip() if isinstance(v, str) and k == "name" else v)
    await db.commit()
    return p


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: str, ctx: WS, db: DB):
    p = await _get_project(db, ctx, project_id)
    await db.delete(p)
    await db.commit()


# ---------- tags ----------


async def _get_tag(db: DB, ctx: WorkspaceContext, tag_id: str) -> Tag:
    t = await db.get(Tag, tag_id)
    if t is None or t.workspace_id != ctx.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Тег не найден")
    return t


@router.get("/tags", response_model=list[TagOut])
async def list_tags(ctx: WS, db: DB):
    return (await db.scalars(select(Tag).where(Tag.workspace_id == ctx.id).order_by(Tag.name))).all()


@router.post("/tags", response_model=TagOut, status_code=201)
async def create_tag(data: TagIn, ctx: WS, db: DB):
    t = Tag(workspace_id=ctx.id, name=data.name.strip(), color=data.color)
    db.add(t)
    try:
        await db.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Такой тег уже есть") from None
    return t


@router.patch("/tags/{tag_id}", response_model=TagOut)
async def update_tag(tag_id: str, data: TagPatch, ctx: WS, db: DB):
    t = await _get_tag(db, ctx, tag_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(t, k, v.strip() if isinstance(v, str) and k == "name" else v)
    try:
        await db.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Такой тег уже есть") from None
    return t


@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(tag_id: str, ctx: WS, db: DB):
    t = await _get_tag(db, ctx, tag_id)
    await db.delete(t)
    await db.commit()


# ---------- API tokens ----------


@router.get("/tokens", response_model=list[TokenOut])
async def list_tokens(ctx: WS, db: DB):
    require_session(ctx)
    return (
        await db.scalars(select(ApiToken).where(ApiToken.workspace_id == ctx.id).order_by(ApiToken.created_at.desc()))
    ).all()


@router.post("/tokens", response_model=TokenCreated, status_code=201)
async def create_token(data: TokenIn, ctx: WS, db: DB):
    user = require_session(ctx)
    raw = generate_api_token()
    token = ApiToken(
        workspace_id=ctx.id,
        user_id=user.id,
        name=data.name.strip(),
        prefix=raw[:10],
        token_hash=hash_token(raw),
        scope=data.scope,
        expires_at=utcnow() + timedelta(days=data.expires_days) if data.expires_days else None,
    )
    db.add(token)
    await db.commit()
    return TokenCreated(**TokenOut.model_validate(token).model_dump(), token=raw)


@router.delete("/tokens/{token_id}", status_code=204)
async def delete_token(token_id: str, ctx: WS, db: DB):
    require_session(ctx)
    await db.execute(delete(ApiToken).where(ApiToken.id == token_id, ApiToken.workspace_id == ctx.id))
    await db.commit()
