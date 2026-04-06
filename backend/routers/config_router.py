"""Config router - endpoint per configurazioni dinamiche."""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import get_db
from backend.services.portal_client import portal_client, PortalApp
from backend.auth.portal_jwt import get_current_user, TokenPayload

router = APIRouter(prefix="/api/config", tags=["Configuration"])


class AppInfo(BaseModel):
    """App info per il frontend."""
    id: str
    name: str
    description: Optional[str] = None
    modules: List[str] = []


class AppsResponse(BaseModel):
    """Response con le app disponibili."""
    apps: List[AppInfo]
    source: str  # "portal" o "cache"
    last_sync: Optional[str] = None


@router.get("/apps", response_model=AppsResponse)
async def get_available_apps(
    refresh: bool = Query(False, description="Forza refresh dal Portal"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    """
    Recupera le app disponibili per il licensing.
    
    Tenta di caricare dal Portal, altrimenti usa la cache locale.
    """
    apps = await portal_client.get_apps(db, force_refresh=refresh)
    
    # Determina la source
    is_healthy = await portal_client.health()
    source = "portal" if is_healthy else "cache"
    last_sync = portal_client.get_last_sync()
    
    return AppsResponse(
        apps=[
            AppInfo(
                id=app.id,
                name=app.name,
                description=app.description,
                modules=app.modules
            )
            for app in apps
        ],
        source=source,
        last_sync=last_sync.isoformat() if last_sync else None
    )


@router.get("/modules")
async def get_all_modules(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    """
    Recupera tutti i moduli unici da tutte le app.
    Utile per licenze legacy che non sono per-app.
    """
    apps = await portal_client.get_apps(db)
    
    # Raccogli tutti i moduli unici
    all_modules = set()
    for app in apps:
        all_modules.update(app.modules)
    
    return {
        "modules": sorted(list(all_modules)),
        "by_app": {
            app.id: app.modules
            for app in apps
        }
    }


@router.post("/apps/refresh")
async def refresh_apps_cache(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    """Forza la sincronizzazione con il Portal."""
    result = await portal_client.sync_apps(db)
    return result
