from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]  # backend/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_prefix="CDS_", extra="ignore")

    app_name: str = "corede Systems"
    database_url: str = f"sqlite+aiosqlite:///{(BASE_DIR / 'data' / 'corede.db').as_posix()}"
    public_url: str = "http://localhost:3000"

    session_cookie: str = "cds_session"
    session_ttl_days: int = 30
    cookie_secure: bool = False

    allow_registration: bool = True
    auto_migrate: bool = True

    run_scheduler: bool = True
    scheduler_concurrency: int = 50
    checks_retention_days: int = 14
    # Пробы мониторинга идут напрямую; true — использовать HTTP(S)_PROXY из окружения
    probe_use_env_proxy: bool = False

    cors_origins: list[str] = []

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
