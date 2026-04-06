"""Model per la cache locale delle app registrate nel Portal."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, JSON, Boolean
from backend.db.database import Base


class CachedApp(Base):
    """Cache locale delle app registrate nel Portal."""
    __tablename__ = "cached_apps"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    app_id = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(String(500), nullable=True)
    app_url = Column(String(500), nullable=True)
    icon = Column(String(255), nullable=True)
    category = Column(String(100), nullable=True)
    modules = Column(JSON, default=list)
    is_active = Column(Boolean, default=True)
    
    # Metadata
    synced_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
