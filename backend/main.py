import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings
from app.core.errors import register_error_handlers
from app.services.lifecycle import cleanup_expired_databases


async def _cleanup_loop() -> None:
    while True:
        cleanup_expired_databases()
        await asyncio.sleep(settings.session_ttl_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_expired_databases()
    task = asyncio.create_task(_cleanup_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

register_error_handlers(app)
app.include_router(router)
