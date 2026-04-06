"""
Portal Client — client per comunicare con PramaIA Portal API.

Permette di recuperare le app registrate, utenti autorizzati, ecc.
Le app vengono salvate localmente nel database per garantire disponibilità offline.
"""
import os
import httpx
import logging
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

logger = logging.getLogger("pramaia-licserver.portal")

PORTAL_API_URL = os.getenv("PORTAL_API_URL", "http://localhost:8080")
STANDALONE_MODE = os.getenv("STANDALONE_MODE", "true").lower() in ("true", "1", "yes")


class PortalApp(BaseModel):
    """Schema per un'app registrata nel Portal."""
    id: str
    name: str
    description: Optional[str] = None
    app_url: Optional[str] = None
    icon: Optional[str] = None
    category: Optional[str] = None
    is_active: bool = True
    modules: List[str] = []


class PortalClient:
    """
    Client HTTP per comunicare con PramaIA Portal.
    Salva le app localmente nel database per garantire disponibilità offline.
    """

    def __init__(self, base_url: str = PORTAL_API_URL):
        self.base_url = base_url.rstrip("/")
        self._client: httpx.AsyncClient | None = None
        self._last_sync: datetime | None = None

    async def start(self) -> None:
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=30.0)
        logger.info(f"PortalClient initialized with {self.base_url}")

    async def stop(self) -> None:
        if self._client:
            await self._client.aclose()

    async def _fetch_from_portal(self) -> List[PortalApp] | None:
        """Tenta di recuperare le app dal Portal. Ritorna None se fallisce."""
        try:
            if self._client is None:
                await self.start()
            
            response = await self._client.get("/api/apps/", timeout=10.0)
            response.raise_for_status()
            data = response.json()
            
            # Gestisce sia array diretto che oggetto con items
            apps_data = data if isinstance(data, list) else data.get("items", data.get("apps", []))
            
            apps = []
            for app in apps_data:
                try:
                    # Preferisci app_id (identificativo app) rispetto a id (UUID)
                    app_id = app.get("app_id") or app.get("id", "")
                    portal_app = PortalApp(
                        id=app_id,
                        name=app.get("name") or app.get("app_name", ""),
                        description=app.get("description", ""),
                        app_url=app.get("app_url") or app.get("url", ""),
                        icon=app.get("icon", ""),
                        category=app.get("category", ""),
                        is_active=app.get("is_active", True),
                        modules=app.get("modules") or []
                    )
                    if portal_app.id and portal_app.name:
                        apps.append(portal_app)
                except Exception as e:
                    logger.warning(f"Failed to parse app: {app}, error: {e}")
            
            logger.info(f"Fetched {len(apps)} apps from Portal")
            return apps
            
        except Exception as e:
            logger.warning(f"Failed to fetch apps from Portal: {e}")
            return None

    async def _save_apps_to_db(self, db: AsyncSession, apps: List[PortalApp]) -> None:
        """Salva le app nel database locale."""
        from backend.models.cached_app import CachedApp
        
        now = datetime.utcnow()
        
        # Rimuovi app non più presenti nel Portal
        portal_app_ids = {app.id for app in apps}
        await db.execute(
            delete(CachedApp).where(CachedApp.app_id.notin_(portal_app_ids))
        )
        
        # Upsert delle app
        for app in apps:
            result = await db.execute(
                select(CachedApp).where(CachedApp.app_id == app.id)
            )
            cached = result.scalar_one_or_none()
            
            if cached:
                # Update
                cached.name = app.name
                cached.description = app.description
                cached.app_url = app.app_url
                cached.icon = app.icon
                cached.category = app.category
                cached.modules = app.modules
                cached.is_active = app.is_active
                cached.synced_at = now
                cached.updated_at = now
            else:
                # Insert
                cached = CachedApp(
                    app_id=app.id,
                    name=app.name,
                    description=app.description,
                    app_url=app.app_url,
                    icon=app.icon,
                    category=app.category,
                    modules=app.modules,
                    is_active=app.is_active,
                    synced_at=now,
                    created_at=now,
                    updated_at=now
                )
                db.add(cached)
        
        await db.commit()
        self._last_sync = now
        logger.info(f"Saved {len(apps)} apps to local cache")

    async def _load_apps_from_db(self, db: AsyncSession) -> List[PortalApp]:
        """Carica le app dalla cache locale."""
        from backend.models.cached_app import CachedApp
        
        result = await db.execute(
            select(CachedApp).where(CachedApp.is_active == True)
        )
        cached_apps = result.scalars().all()
        
        apps = []
        for cached in cached_apps:
            apps.append(PortalApp(
                id=cached.app_id,
                name=cached.name,
                description=cached.description,
                app_url=cached.app_url,
                icon=cached.icon,
                category=cached.category,
                is_active=cached.is_active,
                modules=cached.modules or []
            ))
        
        logger.info(f"Loaded {len(apps)} apps from local cache")
        return apps

    async def get_apps(self, db: AsyncSession, force_refresh: bool = False) -> List[PortalApp]:
        """
        Recupera le app registrate.
        
        1. Prova a caricare dal Portal
        2. Se successo, salva nel DB locale
        3. Se fallisce, carica dal DB locale
        """
        # Tenta fetch dal Portal
        portal_apps = await self._fetch_from_portal()
        
        if portal_apps is not None:
            # Successo: salva nel DB e ritorna
            await self._save_apps_to_db(db, portal_apps)
            return portal_apps
        else:
            # Fallback: carica dalla cache locale
            return await self._load_apps_from_db(db)

    async def sync_apps(self, db: AsyncSession) -> dict:
        """Forza la sincronizzazione con il Portal."""
        portal_apps = await self._fetch_from_portal()
        
        if portal_apps is not None:
            await self._save_apps_to_db(db, portal_apps)
            return {
                "success": True,
                "apps_count": len(portal_apps),
                "synced_at": self._last_sync.isoformat() if self._last_sync else None
            }
        else:
            return {
                "success": False,
                "message": "Portal not reachable",
                "apps_count": 0
            }

    async def health(self) -> bool:
        """Verifica che il Portal sia raggiungibile."""
        if self._client is None:
            await self.start()
        try:
            r = await self._client.get("/api/health", timeout=5.0)
            return r.status_code == 200
        except Exception:
            return False

    def get_last_sync(self) -> datetime | None:
        """Ritorna la data dell'ultima sincronizzazione."""
        return self._last_sync


# Singleton
portal_client = PortalClient()
