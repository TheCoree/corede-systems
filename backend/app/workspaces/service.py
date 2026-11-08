import re
import secrets
import unicodedata

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import User
from app.workspaces.models import Role, Workspace, WorkspaceMember

RESERVED_SLUGS = {
    "admin", "account", "api", "login", "register", "logout", "new", "settings",
    "app", "static", "_next", "favicon.ico", "w", "auth", "docs", "help", "status",
}

_TRANSLIT = str.maketrans({
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z",
    "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
    "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
})

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$")


def slugify(value: str) -> str:
    value = value.lower().translate(_TRANSLIT)
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:40].strip("-") or "workspace"


async def unique_slug(db: AsyncSession, base: str) -> str:
    base = slugify(base)
    slug = base
    while slug in RESERVED_SLUGS or await db.scalar(select(Workspace.id).where(Workspace.slug == slug)):
        slug = f"{base}-{secrets.token_hex(2)}"
    return slug


async def create_workspace(db: AsyncSession, owner: User, name: str) -> Workspace:
    ws = Workspace(name=name, slug=await unique_slug(db, name))
    db.add(ws)
    await db.flush()
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=owner.id, role=Role.owner))
    return ws


async def ensure_personal_workspace(db: AsyncSession, user: User) -> None:
    has_any = await db.scalar(select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id == user.id).limit(1))
    if not has_any:
        first = user.name.split()[0] if user.name.strip() else user.email.split("@")[0]
        await create_workspace(db, user, first)
