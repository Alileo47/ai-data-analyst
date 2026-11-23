import logging
from enum import Enum
from typing import Any, Dict, Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ErrorCode(str, Enum):
    BAD_REQUEST = "BAD_REQUEST"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    UNSUPPORTED_FILE = "UNSUPPORTED_FILE"
    INVALID_DATA = "INVALID_DATA"
    SESSION_EXPIRED = "SESSION_EXPIRED"
    UNSAFE_SQL = "UNSAFE_SQL"
    SQL_EXECUTION_ERROR = "SQL_EXECUTION_ERROR"
    GEMINI_ERROR = "GEMINI_ERROR"
    NOT_FOUND = "NOT_FOUND"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class DomainError(Exception):
    def __init__(
        self,
        code: ErrorCode,
        message: str,
        status_code: int = 400,
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class BadRequestError(DomainError):
    def __init__(self, message: str, details: Optional[Any] = None) -> None:
        super().__init__(ErrorCode.BAD_REQUEST, message, 400, details)


class FileTooLargeError(DomainError):
    def __init__(self, message: str = "Uploaded file exceeds the maximum allowed size.") -> None:
        super().__init__(ErrorCode.FILE_TOO_LARGE, message, 413)


class UnsupportedFileError(DomainError):
    def __init__(self, message: str = "Unsupported file type.") -> None:
        super().__init__(ErrorCode.UNSUPPORTED_FILE, message, 415)


class InvalidDataError(DomainError):
    def __init__(self, message: str, details: Optional[Any] = None) -> None:
        super().__init__(ErrorCode.INVALID_DATA, message, 422, details)


class SessionExpiredError(DomainError):
    def __init__(self, message: str = "The session has expired. Upload the file again.") -> None:
        super().__init__(ErrorCode.SESSION_EXPIRED, message, 404)


class UnsafeSQLError(DomainError):
    def __init__(self, message: str = "Only one read-only SELECT or WITH statement is allowed.") -> None:
        super().__init__(ErrorCode.UNSAFE_SQL, message, 400)


class SQLExecutionError(DomainError):
    def __init__(self, message: str, details: Optional[Any] = None) -> None:
        super().__init__(ErrorCode.SQL_EXECUTION_ERROR, message, 422, details)


class GeminiError(DomainError):
    def __init__(self, message: str = "The AI service could not generate a valid response.") -> None:
        super().__init__(ErrorCode.GEMINI_ERROR, message, 502)


def error_payload(error: DomainError) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "error": {
            "code": error.code.value,
            "message": error.message,
        }
    }
    if error.details is not None:
        payload["error"]["details"] = error.details
    return payload


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=error_payload(exc))

    @app.exception_handler(Exception)
    async def unexpected_error_handler(_: Request, exc: Exception) -> JSONResponse:
        logging.getLogger(__name__).exception("Unhandled application error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": ErrorCode.INTERNAL_ERROR.value,
                    "message": "An unexpected server error occurred.",
                }
            },
        )
