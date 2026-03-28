"""License SQLAlchemy models for database persistence."""
from datetime import datetime, date
from typing import Optional
from sqlalchemy import Column, String, Integer, Boolean, Date, DateTime, Text, JSON, Enum as SQLEnum
from sqlalchemy.orm import relationship
import enum

from backend.db.database import Base


class DeploymentType(str, enum.Enum):
    ON_PREM = "on_prem"
    CLOUD = "cloud"
    HYBRID = "hybrid"


class LicenseStatus(str, enum.Enum):
    PENDING = "pending"           # Activation requested, not yet issued
    ACTIVE = "active"             # License is valid and active
    EXPIRED = "expired"           # License validity period ended
    REVOKED = "revoked"           # License manually revoked
    DEACTIVATED = "deactivated"   # License deactivated by customer
    SUSPENDED = "suspended"       # Temporarily suspended


class License(Base):
    """Main license entity storing all license information."""
    __tablename__ = "licenses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    license_id = Column(String(50), unique=True, nullable=False, index=True)  # e.g., LIC-PA-2026-0142
    
    # Customer information
    customer_name = Column(String(255), nullable=False)
    customer_vat_or_cf = Column(String(20), nullable=False)
    
    # Entitlements (legacy - backward compatible)
    modules = Column(JSON, nullable=False, default=list)  # ["albo", "protocollo", "notifiche"]
    max_users = Column(Integer, nullable=False, default=1)
    max_instances = Column(Integer, nullable=False, default=1)
    max_version = Column(String(20), nullable=True)  # e.g., "2.x"
    
    # Extended entitlements (multi-app with per-role limits)
    # Structure: {"app_id": {"enabled": true, "modules": [...], "users": {"admin": 5, "standard": 45}}}
    apps_entitlements = Column(JSON, nullable=True)
    
    # Global limits across all apps
    # Structure: {"max_total_users": 100, "max_concurrent_sessions": 50, "max_tenants": 3}
    global_limits = Column(JSON, nullable=True)
    
    # Environment
    fingerprint = Column(String(255), nullable=True)
    deployment_type = Column(SQLEnum(DeploymentType), nullable=False, default=DeploymentType.ON_PREM)
    
    # Validity
    issued_at = Column(Date, nullable=True)
    expires_at = Column(Date, nullable=False)
    maintenance_until = Column(Date, nullable=True)
    
    # Status and metadata
    status = Column(SQLEnum(LicenseStatus), nullable=False, default=LicenseStatus.PENDING)
    tenant_id = Column(String(50), nullable=True, index=True)
    
    # Audit fields
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(255), nullable=True)
    
    # Revocation info
    revoked_at = Column(DateTime, nullable=True)
    revoked_by = Column(String(255), nullable=True)
    revocation_reason = Column(Text, nullable=True)
    
    # Deactivation info
    deactivated_at = Column(DateTime, nullable=True)
    deactivated_by = Column(String(255), nullable=True)
    
    def to_dict(self) -> dict:
        """Convert license to dictionary format matching the expected JSON structure."""
        result = {
            "license_id": self.license_id,
            "customer": {
                "name": self.customer_name,
                "vat_or_cf": self.customer_vat_or_cf
            },
            "entitlements": {
                "modules": self.modules or [],
                "max_users": self.max_users,
                "max_instances": self.max_instances,
                "max_version": self.max_version
            },
            "environment": {
                "fingerprint": self.fingerprint,
                "deployment_type": self.deployment_type.value if self.deployment_type else None
            },
            "validity": {
                "issued_at": self.issued_at.isoformat() if self.issued_at else None,
                "expires_at": self.expires_at.isoformat() if self.expires_at else None,
                "maintenance_until": self.maintenance_until.isoformat() if self.maintenance_until else None
            },
            "status": self.status.value if self.status else None,
            "tenant_id": self.tenant_id
        }
        
        # Include extended entitlements if present
        if self.apps_entitlements:
            result["apps_entitlements"] = self.apps_entitlements
        if self.global_limits:
            result["global_limits"] = self.global_limits
        
        return result


class LicenseHeartbeat(Base):
    """Tracks license heartbeat events for monitoring and compliance."""
    __tablename__ = "license_heartbeats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    license_id = Column(String(50), nullable=False, index=True)
    
    # Heartbeat data
    fingerprint = Column(String(255), nullable=True)
    ip_address = Column(String(45), nullable=True)
    hostname = Column(String(255), nullable=True)
    active_users = Column(Integer, nullable=True)
    active_instances = Column(Integer, nullable=True)
    
    # Status at heartbeat time
    validation_result = Column(Boolean, nullable=False, default=True)
    validation_message = Column(Text, nullable=True)
    
    # Timestamp
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


class ActivationRequest(Base):
    """Tracks license activation requests before approval."""
    __tablename__ = "activation_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    request_id = Column(String(50), unique=True, nullable=False, index=True)
    
    # Requester info
    customer_name = Column(String(255), nullable=False)
    customer_vat_or_cf = Column(String(20), nullable=False)
    customer_email = Column(String(255), nullable=True)
    
    # Requested entitlements
    requested_modules = Column(JSON, nullable=True)
    requested_max_users = Column(Integer, nullable=True)
    requested_max_instances = Column(Integer, nullable=True)
    
    # Environment info
    fingerprint = Column(String(255), nullable=True)
    deployment_type = Column(SQLEnum(DeploymentType), nullable=True)
    hostname = Column(String(255), nullable=True)
    ip_address = Column(String(45), nullable=True)
    
    # Request status
    status = Column(String(20), nullable=False, default="pending")  # pending, approved, rejected
    
    # Timestamps
    requested_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)
    processed_by = Column(String(255), nullable=True)
    
    # If approved, link to the issued license
    issued_license_id = Column(String(50), nullable=True)
    
    # Notes
    notes = Column(Text, nullable=True)
    rejection_reason = Column(Text, nullable=True)
