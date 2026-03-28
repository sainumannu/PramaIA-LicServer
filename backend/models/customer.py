"""Customer SQLAlchemy model for database persistence."""
from datetime import datetime
from typing import Optional
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text
from sqlalchemy.orm import relationship

from backend.db.database import Base


class Customer(Base):
    """Customer entity storing all customer information."""
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(String(50), unique=True, nullable=False, index=True)  # e.g., CUST-0001
    
    # Basic information
    name = Column(String(255), nullable=False, index=True)
    vat_or_cf = Column(String(20), nullable=False, unique=True, index=True)  # P.IVA o Codice Fiscale
    
    # Contact information
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    pec = Column(String(255), nullable=True)  # PEC (Posta Elettronica Certificata)
    
    # Address
    address = Column(String(255), nullable=True)
    city = Column(String(100), nullable=True)
    province = Column(String(10), nullable=True)
    postal_code = Column(String(10), nullable=True)
    country = Column(String(100), nullable=True, default="Italia")
    
    # Business info
    sdi_code = Column(String(7), nullable=True)  # Codice SDI per fatturazione elettronica
    
    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Multi-tenancy
    tenant_id = Column(String(50), nullable=True, index=True)
    
    # Notes
    notes = Column(Text, nullable=True)
    
    # Audit fields
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(255), nullable=True)

    def to_dict(self) -> dict:
        """Convert customer to dictionary format."""
        return {
            "id": self.id,
            "customer_id": self.customer_id,
            "name": self.name,
            "vat_or_cf": self.vat_or_cf,
            "email": self.email,
            "phone": self.phone,
            "pec": self.pec,
            "address": self.address,
            "city": self.city,
            "province": self.province,
            "postal_code": self.postal_code,
            "country": self.country,
            "sdi_code": self.sdi_code,
            "is_active": self.is_active,
            "tenant_id": self.tenant_id,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
