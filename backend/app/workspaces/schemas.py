from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

COLORS = ("gray", "blue", "green", "amber", "red", "purple", "pink", "teal")
Color = Literal["gray", "blue", "green", "amber", "red", "purple", "pink", "teal"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class WorkspaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class WorkspacePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    slug: str | None = Field(default=None, min_length=1, max_length=48)


class WorkspaceOut(ORM):
    id: str
    slug: str
    name: str
    created_at: datetime
    role: str | None = None


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    color: Color = "gray"


class ProjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    color: Color | None = None


class ProjectOut(ORM):
    id: str
    name: str
    description: str | None
    color: str
    created_at: datetime


class TagIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: Color = "gray"


class TagPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    color: Color | None = None


class TagOut(ORM):
    id: str
    name: str
    color: str


class TokenIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    scope: Literal["read", "write"] = "read"
    expires_days: int | None = Field(default=None, ge=1, le=3650)


class TokenOut(ORM):
    id: str
    name: str
    prefix: str
    scope: str
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime | None


class TokenCreated(TokenOut):
    token: str
