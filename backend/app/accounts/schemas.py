from datetime import datetime

from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field


def _email(v: str) -> str:
    v = v.strip().lower()
    local, _, domain = v.partition("@")
    if not local or not domain or " " in v or "@" in domain:
        raise ValueError("Некорректный email")
    return v


Email = Annotated[str, Field(min_length=3, max_length=320), AfterValidator(_email)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterIn(BaseModel):
    email: Email
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=200)
    note: str | None = Field(default=None, max_length=1000)


class LoginIn(BaseModel):
    email: Email
    password: str = Field(max_length=200)


class UserOut(ORM):
    id: str
    email: str
    name: str
    status: str
    is_admin: bool
    created_at: datetime
    last_login_at: datetime | None


class AdminUserOut(UserOut):
    note: str | None
    approved_at: datetime | None
    workspaces: int = 0


class WorkspaceBrief(BaseModel):
    id: str
    slug: str
    name: str
    role: str


class MeOut(BaseModel):
    user: UserOut
    workspaces: list[WorkspaceBrief]
    pending_users: int = 0


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class PasswordIn(BaseModel):
    current: str = Field(max_length=200)
    new: str = Field(min_length=8, max_length=200)


class SessionOut(ORM):
    id: str
    user_agent: str | None
    ip: str | None
    created_at: datetime
    last_seen_at: datetime
    current: bool = False


class AdminUserPatch(BaseModel):
    status: str | None = Field(default=None, pattern="^(pending|active|rejected|disabled)$")
    is_admin: bool | None = None


class RegisterOut(BaseModel):
    status: str
    message: str
