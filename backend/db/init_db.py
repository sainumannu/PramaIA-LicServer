from backend.db.database import engine, Base
# Import all models here to ensure they are registered with SQLAlchemy
from backend.models import example_model  # noqa: F401
from backend.models import team_member  # noqa: F401
from backend.models import license  # noqa: F401
from backend.models import customer  # noqa: F401
from backend.models import cached_app  # noqa: F401


async def init_database() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
