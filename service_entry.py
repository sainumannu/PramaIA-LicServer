"""PramaIA Licensing Server - entry point di produzione (PyInstaller / servizio Windows NSSM).

Sviluppo: continua a usare `uvicorn backend.main:app`. Questo file serve solo all'eseguibile.
"""
import logging
import multiprocessing
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path


def get_app_dir() -> Path:
    """Cartella dell'installazione (accanto all'exe), non la cartella temporanea di PyInstaller."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


APP_DIR = get_app_dir()
# I percorsi relativi in .env (DATABASE_URL, KEYS_DIR) sono relativi alla cartella di installazione,
# indipendentemente da come viene avviato il processo (NSSM, doppio click, shortcut).
os.chdir(APP_DIR)

from dotenv import load_dotenv  # noqa: E402

ENV_FILE = APP_DIR / ".env"
load_dotenv(ENV_FILE)


def get_log_dir() -> Path:
    """logs/ accanto all'exe; se non scrivibile ripiega su %APPDATA% (come Mind-ThalamService)."""
    logs_dir = APP_DIR / "logs"
    try:
        logs_dir.mkdir(parents=True, exist_ok=True)
        probe = logs_dir / ".write_test"
        probe.write_text("")
        probe.unlink()
        return logs_dir
    except OSError:
        appdata = Path(os.getenv("APPDATA", str(Path.home() / "AppData" / "Roaming")))
        logs_dir = appdata / "PramaIA" / "LicServer" / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)
        return logs_dir


def setup_logging() -> Path:
    log_file = get_log_dir() / "licserver.log"
    logging.basicConfig(
        level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
        format="%(asctime)s [%(name)s] [%(levelname)s] %(message)s",
        handlers=[
            RotatingFileHandler(log_file, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
    return log_file


def main() -> int:
    log_file = setup_logging()
    logger = logging.getLogger("pramaia-licserver")
    logger.info(f"Avvio da {APP_DIR} - log: {log_file}")

    if not ENV_FILE.is_file():
        logger.error(f".env non trovato in {APP_DIR}. Rieseguire l'installer o crearlo da .env.template.")
        return 1

    Path("data").mkdir(exist_ok=True)

    from backend.main import app  # import diretto: PyInstaller lo vede (a differenza di 'backend.main:app')
    import uvicorn

    host = os.getenv("SERVICE_HOST", "127.0.0.1")
    port = int(os.getenv("BACKEND_PORT", "8030"))
    logger.info(f"Listening on http://{host}:{port}")

    uvicorn.run(app, host=host, port=port, log_level=os.getenv("LOG_LEVEL", "info").lower())
    return 0


if __name__ == "__main__":
    multiprocessing.freeze_support()
    sys.exit(main())
