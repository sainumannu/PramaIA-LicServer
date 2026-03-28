import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from backend.db.database import engine
from backend.db.init_db import init_database
from backend.routers import example_router, settings_router, license_router, customer_router, license_file_router

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


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "pramaia-licserver"}
