"""Утилиты: python -m app.cli <команда>

  migrate                       применить миграции
  create-admin EMAIL NAME       создать/повысить администратора (пароль спросит)
  approve EMAIL                 одобрить заявку пользователя
"""

import asyncio
import getpass
import sys
from pathlib import Path

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def migrate() -> None:
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config(str(ALEMBIC_INI)), "head")
    print("Миграции применены")


async def create_admin(email: str, name: str, password: str) -> None:
    from sqlalchemy import select

    from app.accounts.models import User, UserStatus
    from app.core.db import SessionLocal, utcnow
    from app.core.security import hash_password
    from app.workspaces.service import ensure_personal_workspace

    async with SessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == email.lower()))
        if user is None:
            user = User(email=email.lower(), name=name, password_hash=await hash_password(password))
            db.add(user)
        else:
            user.password_hash = await hash_password(password)
        user.status = UserStatus.active
        user.is_admin = True
        user.approved_at = user.approved_at or utcnow()
        await db.flush()
        await ensure_personal_workspace(db, user)
        await db.commit()
    print(f"Администратор {email} готов")


async def approve(email: str) -> None:
    from sqlalchemy import select

    from app.accounts.models import User, UserStatus
    from app.core.db import SessionLocal, utcnow
    from app.workspaces.service import ensure_personal_workspace

    async with SessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == email.lower()))
        if user is None:
            sys.exit("Пользователь не найден")
        user.status = UserStatus.active
        user.approved_at = utcnow()
        await ensure_personal_workspace(db, user)
        await db.commit()
    print(f"{email} одобрен")


def main(argv: list[str]) -> None:
    match argv:
        case ["migrate"]:
            migrate()
        case ["create-admin", email, *name]:
            migrate()
            pwd = getpass.getpass("Пароль (мин. 8 символов): ")
            if len(pwd) < 8:
                sys.exit("Слишком короткий пароль")
            asyncio.run(create_admin(email, " ".join(name) or email.split("@")[0], pwd))
        case ["approve", email]:
            asyncio.run(approve(email))
        case _:
            print(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
