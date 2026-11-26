from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.errors import (
    BadRequestError,
    FileTooLargeError,
    UnsupportedFileError,
)
from app.services.ai import explain_results, generate_sql
from app.services.ingestion import _inspect_database, ingest_file
from app.services.lifecycle import (
    database_path,
    new_session_id,
    temporary_upload,
    verify_active_session,
)
from app.services.query import execute_session_query, search_session


router = APIRouter()
ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".sql"}


class AskRequest(BaseModel):
    session_id: str = Field(..., min_length=36, max_length=36)
    question: str = Field(..., min_length=1, max_length=2_000)


class SearchRequest(BaseModel):
    session_id: str = Field(..., min_length=36, max_length=36)
    query: str = Field(..., min_length=1, max_length=500)
    column: str | None = Field(default=None, max_length=200)


def _valid_uuid(session_id: str) -> str:
    try:
        parsed = UUID(session_id)
    except (TypeError, ValueError, AttributeError):
        raise BadRequestError("session_id must be a valid UUID.")
    if str(parsed) != session_id.lower():
        raise BadRequestError("session_id must be a valid UUID.")
    return str(parsed)


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict:
    if not file.filename:
        raise BadRequestError("A file name is required.")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise UnsupportedFileError(
            "Unsupported file type. Upload a CSV, XLSX, or SQL file."
        )

    settings.temp_dir.mkdir(parents=True, exist_ok=True)
    session_id = new_session_id()
    raw_path = settings.temp_dir / f"{session_id}{suffix}"

    try:
        with raw_path.open("wb") as destination:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                if destination.tell() + len(chunk) > settings.max_upload_bytes:
                    raise FileTooLargeError()
                destination.write(chunk)

        if raw_path.stat().st_size == 0:
            raise BadRequestError("The uploaded file is empty.")

        db_path = database_path(session_id)
        try:
            result = ingest_file(
                raw_path=raw_path,
                database_path=db_path,
                session_id=session_id,
            )
        except Exception:
            db_path.unlink(missing_ok=True)
            raise
        return {
            "session_id": result["session_id"],
            "tables": result["tables"],
            "preview": result["preview"],
        }
    finally:
        await file.close()
        with temporary_upload(raw_path):
            pass


@router.post("/ask")
async def ask(request: AskRequest) -> dict:
    session_id = _valid_uuid(request.session_id)
    db_path = verify_active_session(session_id, touch=True)
    schema = _inspect_database(db_path)

    generated_sql = generate_sql(schema["tables"], request.question)
    execution = execute_session_query(session_id, generated_sql)
    explanation = explain_results(
        question=request.question,
        executed_sql=generated_sql,
        column_names=execution["columns"],
        actual_results=execution["rows"],
    )

    return {
        "columns": execution["columns"],
        "rows": execution["rows"],
        "sql": generated_sql,
        "explanation": explanation,
        "is_empty": execution["is_empty"],
        "truncated": execution["truncated"],
    }


@router.post("/search")
async def search(request: SearchRequest) -> dict:
    session_id = _valid_uuid(request.session_id)
    result = search_session(
        session_id=session_id,
        query=request.query,
        column=request.column,
    )
    return {
        "columns": result["columns"],
        "rows": result["rows"],
        "is_empty": result["is_empty"],
        "truncated": result["truncated"],
    }
