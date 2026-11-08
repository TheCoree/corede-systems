"""Импорт всех моделей — для Alembic (target_metadata) и create_all."""

from app.accounts.models import User, UserSession  # noqa: F401
from app.core.db import Base  # noqa: F401
from app.modules.monitoring.models import Check, Incident, Monitor, StatHourly  # noqa: F401
from app.notifications.models import NotificationChannel  # noqa: F401
from app.workspaces.models import ApiToken, Project, Tag, Workspace, WorkspaceMember  # noqa: F401
