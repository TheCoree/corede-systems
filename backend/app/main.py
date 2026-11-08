import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.accounts.admin import router as admin_router
from app.accounts.router import router as auth_router
from app.core.config import settings
from app.modules import load_modules
from app.notifications import dispatcher
from app.notifications.router import router as channels_router
from app.workspaces.router import router as workspace_router
from app.workspaces.router import user_router as workspaces_user_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("corede")
# каждая проверка — HTTP-запрос; не засоряем лог
logging.getLogger("httpx").setLevel(logging.WARNING)

MODULES = load_modules()


def run_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    from app.cli import ALEMBIC_INI

    cfg = Config(str(ALEMBIC_INI))
    cfg.attributes["from_app"] = True
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_migrate:
        await asyncio.to_thread(run_migrations)
    if settings.run_scheduler:
        for m in MODULES:
            for start in m.worker_start:
                await start()
    yield
    if settings.run_scheduler:
        for m in MODULES:
            for stop in m.worker_stop:
                await stop()
    await dispatcher.close()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    swagger_ui_oauth2_redirect_url=None,
)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

api = APIRouter(prefix="/api")
api.include_router(auth_router)
api.include_router(admin_router)
api.include_router(workspaces_user_router)

WS_PREFIX = "/w/{ws}"  # всё внутри пространства: /api/w/<slug>/...
api.include_router(workspace_router, prefix=WS_PREFIX)
api.include_router(channels_router, prefix=WS_PREFIX)
for module in MODULES:
    if module.workspace_router:
        api.include_router(module.workspace_router, prefix=WS_PREFIX)
    if module.public_router:
        api.include_router(module.public_router)


@api.get("/health", tags=["system"])
async def health():
    return {"ok": True, "modules": [m.id for m in MODULES], "scheduler": settings.run_scheduler}


@api.get("/modules", tags=["system"])
async def modules():
    return [{"id": m.id, "name": m.name} for m in MODULES]


app.include_router(api)
