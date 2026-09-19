import os
import sys
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from dotenv import load_dotenv

from backend.db.database import engine
from backend.db.init_db import init_database
from backend.routers import example_router, settings_router, license_router, customer_router, license_file_router, config_router

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] [%(levelname)s] %(message)s",
)
logger = logging.getLogger("pramaia-licserver")

APP_NAME = os.getenv("APP_NAME", "PramaIA Licensing Server")
PORTAL_URL = os.getenv("PORTAL_URL", "http://localhost:3080")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"{APP_NAME} starting...")
    await init_database()
    logger.info(f"{APP_NAME} ready")
    yield
    logger.info(f"{APP_NAME} shutting down")


app = FastAPI(
    title=APP_NAME,
    description="Server per la gestione delle licenze PramaIA",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[PORTAL_URL, "http://localhost:3030"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(example_router.router)
app.include_router(settings_router.router)
app.include_router(license_router.router)
app.include_router(customer_router.router)
app.include_router(license_file_router.router)
app.include_router(config_router.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "pramaia-licserver"}


def _resolve_frontend_dir() -> Optional[Path]:
    """Cartella con la build React (index.html), se presente.

    Nell'installazione Windows il backend serve anche il frontend sulla stessa porta.
    In sviluppo il frontend gira sul dev server (porta 3030) e questa funzione ritorna None.
    """
    candidates = []
    if os.getenv("FRONTEND_DIST_DIR"):
        candidates.append(Path(os.environ["FRONTEND_DIST_DIR"]))
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).resolve().parent / "frontend")
    return next((c for c in candidates if (c / "index.html").is_file()), None)


FRONTEND_DIR = _resolve_frontend_dir()

if FRONTEND_DIR:
    logger.info(f"Serving frontend from {FRONTEND_DIR}")
    _frontend_root = FRONTEND_DIR.resolve()

    # Handler sul 404 invece di una route catch-all: una catch-all intercetterebbe anche
    # /api/customers prima del redirect automatico a /api/customers/ (redirect_slashes).
    @app.exception_handler(StarletteHTTPException)
    async def spa_fallback(request: Request, exc: StarletteHTTPException):
        path = request.url.path
        if exc.status_code != 404 or request.method != "GET" or path == "/api" or path.startswith("/api/"):
            return await http_exception_handler(request, exc)
        candidate = (_frontend_root / path.lstrip("/")).resolve()
        if candidate.is_file() and _frontend_root in candidate.parents:
            return FileResponse(candidate)
        # Fallback SPA: le rotte di react-router (/licenses, /customers, ...) risolvono su index.html
        return FileResponse(_frontend_root / "index.html")
