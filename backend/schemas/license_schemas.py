"""Pydantic schemas for license-related API operations."""
from datetime import date, datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class DeploymentTypeEnum(str, Enum):
    ON_PREM = "on_prem"
    CLOUD = "cloud"
    HYBRID = "hybrid"


class LicenseStatusEnum(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"
    DEACTIVATED = "deactivated"
    SUSPENDED = "suspended"


# ============== Nested schemas for license structure ==============

class CustomerInfo(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    vat_or_cf: str = Field(..., min_length=1, max_length=20)


class Entitlements(BaseModel):
    """Legacy entitlements - simple flat structure for backward compatibility."""
    modules: List[str] = Field(default_factory=list)
    max_users: int = Field(default=1, ge=1)
    max_instances: int = Field(default=1, ge=1)
    max_version: Optional[str] = None


# ============== Extended Multi-App Entitlements ==============

class AppUserLimits(BaseModel):
    """Per-role user limits for an app."""
    admin: int = Field(default=0, ge=-1, description="Max admin users (-1 = unlimited)")
    standard: int = Field(default=0, ge=-1, description="Max standard users (-1 = unlimited)")
    viewer: int = Field(default=0, ge=-1, description="Max viewer users (-1 = unlimited)")
    # Allow additional custom roles
    class Config:
        extra = "allow"


class AppEntitlement(BaseModel):
    """Entitlements for a specific app."""
    enabled: bool = True
    modules: List[str] = Field(default_factory=list, description="Modules enabled for this app")
    users: AppUserLimits = Field(default_factory=AppUserLimits, description="Per-role user limits")
    max_instances: int = Field(default=1, ge=1, description="Max instances for this app")
    features: Optional[Dict[str, Any]] = Field(default=None, description="App-specific feature flags")


class GlobalLimits(BaseModel):
    """Global limits across all apps."""
    max_total_users: Optional[int] = Field(default=None, ge=1, description="Max users across all apps")
    max_concurrent_sessions: Optional[int] = Field(default=None, ge=1, description="Max concurrent sessions")
    max_tenants: Optional[int] = Field(default=None, ge=1, description="Max tenants allowed")
    max_api_calls_per_day: Optional[int] = Field(default=None, ge=1, description="API rate limit per day")


class ExtendedEntitlements(BaseModel):
    """Extended entitlements with multi-app support."""
    # Legacy fields (for backward compatibility)
    modules: List[str] = Field(default_factory=list)
    max_users: int = Field(default=1, ge=1)
    max_instances: int = Field(default=1, ge=1)
    max_version: Optional[str] = None
    
    # Extended: per-app entitlements
    apps: Optional[Dict[str, AppEntitlement]] = Field(
        default=None,
        description="Per-app entitlements keyed by app_id"
    )
    
    # Global limits
    global_limits: Optional[GlobalLimits] = Field(
        default=None,
        description="Global limits across all apps"
    )


class EnvironmentInfo(BaseModel):
    fingerprint: Optional[str] = None
    deployment_type: DeploymentTypeEnum = DeploymentTypeEnum.ON_PREM


class ValidityInfo(BaseModel):
    issued_at: Optional[date] = None
    expires_at: date
    maintenance_until: Optional[date] = None


# ============== Main License schemas ==============

class LicenseBase(BaseModel):
    """Base license schema with common fields."""
    customer: CustomerInfo
    entitlements: Entitlements
    environment: EnvironmentInfo
    validity: ValidityInfo


class LicenseCreate(LicenseBase):
    """Schema for creating/issuing a new license."""
    license_id: Optional[str] = None  # Auto-generated if not provided


class LicenseResponse(BaseModel):
    """Full license response schema."""
    license_id: str
    customer: CustomerInfo
    entitlements: Entitlements
    environment: EnvironmentInfo
    validity: ValidityInfo
    status: LicenseStatusEnum
    tenant_id: Optional[str] = None
    
    # Extended entitlements (multi-app)
    apps_entitlements: Optional[Dict[str, AppEntitlement]] = None
    global_limits: Optional[GlobalLimits] = None

    class Config:
        from_attributes = True


class LicenseListResponse(BaseModel):
    """Response for listing multiple licenses."""
    licenses: List[LicenseResponse]
    total: int


# ============== Activation Request schemas ==============

class ActivationRequestCreate(BaseModel):
    """Schema for requesting license activation."""
    customer_name: str = Field(..., min_length=1, max_length=255)
    customer_vat_or_cf: str = Field(..., min_length=1, max_length=20)
    customer_email: Optional[str] = None
    
    requested_modules: Optional[List[str]] = None
    requested_max_users: Optional[int] = Field(default=None, ge=1)
    requested_max_instances: Optional[int] = Field(default=None, ge=1)
    
    fingerprint: Optional[str] = None
    deployment_type: Optional[DeploymentTypeEnum] = DeploymentTypeEnum.ON_PREM
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    
    notes: Optional[str] = None


class ActivationRequestResponse(BaseModel):
    """Response after creating an activation request."""
    request_id: str
    status: str
    message: str
    requested_at: datetime

    class Config:
        from_attributes = True


# ============== Validation schemas ==============

class ValidateRequest(BaseModel):
    """Schema for validating a license."""
    license_id: str
    fingerprint: Optional[str] = None
    module: Optional[str] = None  # Optional: validate access to specific module
    check_users: Optional[int] = None  # Optional: check against user count (legacy)
    check_instances: Optional[int] = None  # Optional: check against instance count
    
    # Extended validation for multi-app
    app_id: Optional[str] = Field(default=None, description="App to validate access for")
    role: Optional[str] = Field(default=None, description="Role to check limits for (admin, standard, viewer)")
    user_counts_by_role: Optional[Dict[str, int]] = Field(
        default=None,
        description="Current user counts by role, e.g., {'admin': 3, 'standard': 42}"
    )


class ValidateResponse(BaseModel):
    """Response from license validation."""
    valid: bool
    license_id: str
    status: LicenseStatusEnum
    message: str
    details: Optional[dict] = None
    
    # If valid, include useful info
    expires_at: Optional[date] = None
    days_remaining: Optional[int] = None
    modules: Optional[List[str]] = None
    max_users: Optional[int] = None
    max_instances: Optional[int] = None
    
    # Extended info for multi-app
    app_entitlement: Optional[AppEntitlement] = Field(
        default=None,
        description="Specific app entitlements if app_id was provided"
    )
    global_limits: Optional[GlobalLimits] = None


# ============== Heartbeat schemas ==============

class HeartbeatRequest(BaseModel):
    """Schema for license heartbeat."""
    license_id: str
    fingerprint: Optional[str] = None
    ip_address: Optional[str] = None
    hostname: Optional[str] = None
    active_users: Optional[int] = None
    active_instances: Optional[int] = None


class HeartbeatResponse(BaseModel):
    """Response from heartbeat."""
    success: bool
    license_id: str
    valid: bool
    message: str
    timestamp: datetime
    next_heartbeat_seconds: int = 3600  # Suggested interval for next heartbeat


# ============== Refresh License schemas ==============

class RefreshLicenseRequest(BaseModel):
    """Schema for refreshing/renewing a license."""
    license_id: str
    new_expires_at: Optional[date] = None
    new_maintenance_until: Optional[date] = None
    extend_days: Optional[int] = None  # Alternative: extend by N days


class RefreshLicenseResponse(BaseModel):
    """Response from license refresh."""
    success: bool
    license_id: str
    message: str
    new_expires_at: Optional[date] = None
    new_maintenance_until: Optional[date] = None


# ============== Deactivate schemas ==============

class DeactivateRequest(BaseModel):
    """Schema for deactivating a license."""
    license_id: str
    reason: Optional[str] = None


class DeactivateResponse(BaseModel):
    """Response from license deactivation."""
    success: bool
    license_id: str
    message: str
    deactivated_at: datetime


# ============== Revoke schemas ==============

class RevokeRequest(BaseModel):
    """Schema for revoking a license (admin action)."""
    license_id: str
    reason: str = Field(..., min_length=1)


class RevokeResponse(BaseModel):
    """Response from license revocation."""
    success: bool
    license_id: str
    message: str
    revoked_at: datetime
    revoked_by: str


# ============== Issue License schemas ==============

class IssueLicenseRequest(BaseModel):
    """Schema for issuing a new license (can be from activation request or direct)."""
    # If from activation request
    activation_request_id: Optional[str] = None
    
    # Or direct issue with full details
    customer: Optional[CustomerInfo] = None
    entitlements: Optional[Entitlements] = None  # Legacy flat entitlements
    environment: Optional[EnvironmentInfo] = None
    validity: Optional[ValidityInfo] = None
    
    # Override license_id if needed
    license_id: Optional[str] = None
    
    # Extended multi-app entitlements (preferred over legacy entitlements)
    apps_entitlements: Optional[Dict[str, AppEntitlement]] = Field(
        default=None,
        description="Per-app entitlements, keyed by app_id"
    )
    global_limits: Optional[GlobalLimits] = Field(
        default=None,
        description="Global limits across all apps"
    )


class IssueLicenseResponse(BaseModel):
    """Response from issuing a license."""
    success: bool
    license: LicenseResponse
    message: str
