import logging

from backend.db.database import engine, Base
# Import all models here to ensure they are registered with SQLAlchemy
from backend.models import example_model  # noqa: F401
from backend.models import team_member  # noqa: F401
from backend.models import license  # noqa: F401
from backend.models import customer  # noqa: F401
from backend.models import cached_app  # noqa: F401

logger = logging.getLogger("pramaia-licserver.db")

# Colonne aggiunte ad activation_requests dopo la release iniziale. Su un DB nuovo le crea già
# create_all (legge il modello corrente); su un DB esistente (dev o installazione già in uso)
# create_all non altera una tabella che esiste già, quindi vanno aggiunte a mano.
# Non c'è Alembic in questo progetto: ALTER TABLE ADD COLUMN basta, SQLite non supporta altro.
_ACTIVATION_REQUESTS_NEW_COLUMNS = {
    "app_id": "VARCHAR(100)",
    "app_name": "VARCHAR(255)",
    "app_version": "VARCHAR(50)",
    "modules_catalog": "JSON",
    "umbrella_module": "VARCHAR(100)",
    "source": "VARCHAR(20) DEFAULT 'manual'",
    "import_batch_id": "VARCHAR(50)",
}


async def _migrate_activation_requests(conn) -> None:
    result = await conn.exec_driver_sql("PRAGMA table_info(activation_requests)")
    existing_columns = {row[1] for row in result.fetchall()}
    for name, coltype in _ACTIVATION_REQUESTS_NEW_COLUMNS.items():
        if name not in existing_columns:
            logger.info(f"Migrazione DB: aggiungo colonna activation_requests.{name}")
            await conn.exec_driver_sql(f"ALTER TABLE activation_requests ADD COLUMN {name} {coltype}")


async def init_database() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate_activation_requests(conn)
