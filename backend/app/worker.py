"""Отдельный процесс фоновых воркеров: `python -m app.worker`.

Нужен, если API запущен в несколько процессов (тогда CDS_RUN_SCHEDULER=false у API).
"""

import asyncio
import logging
import signal
from contextlib import suppress

from app.core.config import settings
from app.main import MODULES, run_migrations
from app.notifications import dispatcher

log = logging.getLogger("corede.worker")


async def main() -> None:
    if settings.auto_migrate:
        await asyncio.to_thread(run_migrations)
    for m in MODULES:
        for start in m.worker_start:
            await start()
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        with suppress(NotImplementedError):  # Windows
            loop.add_signal_handler(sig, stop.set)
    log.info("worker running, modules: %s", ", ".join(m.id for m in MODULES))
    try:
        await stop.wait()
    finally:
        for m in MODULES:
            for fn in m.worker_stop:
                await fn()
        await dispatcher.close()


if __name__ == "__main__":
    with suppress(KeyboardInterrupt):
        asyncio.run(main())
