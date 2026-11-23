import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.core.config import settings
from app.core.errors import (
    ErrorCode,
    DomainError,
    SessionExpiredError,
)


def new_session_id() -> str:
    return str(uuid.uuid4())


def database_path(session_id: str) -> Path:
    try:
        parsed = uuid.UUID(session_id)
    except (TypeError, ValueError, AttributeError):
        raise DomainError(
            ErrorCode.NOT_FOUND,
            "Invalid session_id.",
            status_code=404,
        )
    if str(parsed) != session_id.lower():
        raise DomainError(
            ErrorCode.NOT_FOUND,
            "Invalid session_id.",
            status_code=404,
        )

    path = settings.temp_dir / f"{parsed}.db"
    return path.resolve()


def verify_active_session(session_id: str, touch: bool = False) -> Path:
    path = database_path(session_id)
    if not path.is_file():
        raise DomainError(
            ErrorCode.NOT_FOUND,
            "Session not found.",
            status_code=404,
        )

    age = time.time() - path.stat().st_mtime
    if age >= settings.session_ttl_seconds:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        raise SessionExpiredError()

    if touch:
        touch_session(path)
    return path


def touch_session(path: Path) -> None:
    if path.is_file():
        path.touch()


@contextmanager
def temporary_upload(raw_path: str | Path) -> Iterator[Path]:
    path = Path(raw_path)
    try:
        yield path
    finally:
        delete_raw_upload(path)


def delete_raw_upload(raw_path: str | Path) -> None:
    path = Path(raw_path)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        return


def cleanup_expired_databases() -> int:
    now = time.time()
    removed = 0
    settings.temp_dir.mkdir(parents=True, exist_ok=True)

    for path in settings.temp_dir.glob("*.db"):
        try:
            if now - path.stat().st_mtime >= settings.session_ttl_seconds:
                path.unlink(missing_ok=True)
                removed += 1
        except FileNotFoundError:
            continue
        except OSError:
            continue
    return removed
