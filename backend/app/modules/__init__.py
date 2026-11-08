"""Реестр модулей системы.

Каждый модуль — пакет в app/modules/<name>/ с объектом `module: Module` в __init__.py.
Чтобы подключить новый модуль, добавьте его в MODULES.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from fastapi import APIRouter


@dataclass(slots=True)
class Module:
    id: str
    name: str
    # Роутеры, монтируются под /api/w/{workspace}/...
    workspace_router: APIRouter | None = None
    # Публичные / токен-роутеры, монтируются под /api/...
    public_router: APIRouter | None = None
    # Фоновые воркеры (планировщики). Запускаются в API при CDS_RUN_SCHEDULER=true
    # или отдельным процессом `python -m app.worker`
    worker_start: list[Callable[[], Awaitable[None]]] = field(default_factory=list)
    worker_stop: list[Callable[[], Awaitable[None]]] = field(default_factory=list)


def load_modules() -> list[Module]:
    from app.modules.monitoring import module as monitoring

    return [monitoring]
