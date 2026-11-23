import os
from dataclasses import dataclass
from pathlib import Path
from typing import Tuple


@dataclass(frozen=True)
class Settings:
    app_name: str = "AI Data Analyst"
    environment: str = "development"
    gemini_api_key: str = ""
    temp_dir: Path = Path("/tmp")
    max_upload_bytes: int = 20 * 1024 * 1024
    session_ttl_seconds: int = 30 * 60
    cors_origins: Tuple[str, ...] = (
        "http://localhost:8081",
        "http://127.0.0.1:8081",
    )


def _cors_origins() -> Tuple[str, ...]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if not raw:
        return Settings().cors_origins
    return tuple(origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip())


def load_settings() -> Settings:
    environment = os.getenv("ENVIRONMENT", "development").strip().lower()
    max_upload_mb = int(os.getenv("MAX_UPLOAD_MB", "20"))
    max_upload_mb = min(20, max(15, max_upload_mb))
    return Settings(
        environment=environment,
        gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip(),
        temp_dir=Path(os.getenv("TEMP_DIR", "/tmp")),
        max_upload_bytes=max_upload_mb * 1024 * 1024,
        session_ttl_seconds=int(os.getenv("SESSION_TTL_SECONDS", str(30 * 60))),
        cors_origins=_cors_origins(),
    )


settings = load_settings()
