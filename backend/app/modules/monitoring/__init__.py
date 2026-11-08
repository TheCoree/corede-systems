from app.modules import Module
from app.modules.monitoring.engine import engine
from app.modules.monitoring.router import public_router, router

module = Module(
    id="monitoring",
    name="Мониторинг",
    workspace_router=router,
    public_router=public_router,
    worker_start=[engine.start],
    worker_stop=[engine.stop],
)
