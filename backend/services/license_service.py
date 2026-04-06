"""License service containing business logic for license operations."""
import uuid
from datetime import datetime, date, timedelta
from typing import Optional, List, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_
from sqlalchemy.orm import selectinload

from backend.models.license import (
    License, LicenseHeartbeat, ActivationRequest,
    LicenseStatus, DeploymentType
)
from backend.schemas.license_schemas import (
    ActivationRequestCreate, ValidateRequest, HeartbeatRequest,
    RefreshLicenseRequest, DeactivateRequest, RevokeRequest,
    IssueLicenseRequest, LicenseResponse, ValidateResponse,
    DeploymentTypeEnum, LicenseStatusEnum, CustomerInfo, Entitlements,
    EnvironmentInfo, ValidityInfo, AppEntitlement, GlobalLimits
)


def generate_license_id() -> str:
    """Generate a unique license ID in format LIC-PA-YYYY-XXXX."""
    year = datetime.now().year
    random_part = uuid.uuid4().hex[:4].upper()
    return f"LIC-PA-{year}-{random_part}"


def generate_request_id() -> str:
    """Generate a unique activation request ID."""
    return f"REQ-{uuid.uuid4().hex[:8].upper()}"


class LicenseService:
    """Service class for license operations."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    # ==================== Activation Request ====================
    
    async def create_activation_request(
        self,
        request: ActivationRequestCreate,
        tenant_id: Optional[str] = None
    ) -> ActivationRequest:
        """Create a new activation request."""
        activation = ActivationRequest(
            request_id=generate_request_id(),
            customer_name=request.customer_name,
            customer_vat_or_cf=request.customer_vat_or_cf,
            customer_email=request.customer_email,
            requested_modules=request.requested_modules,
            requested_max_users=request.requested_max_users,
            requested_max_instances=request.requested_max_instances,
            fingerprint=request.fingerprint,
            deployment_type=DeploymentType(request.deployment_type.value) if request.deployment_type else None,
            hostname=request.hostname,
            ip_address=request.ip_address,
            notes=request.notes,
            status="pending"
        )
        
        self.db.add(activation)
        await self.db.commit()
        await self.db.refresh(activation)
        return activation
    
    async def get_activation_request(self, request_id: str) -> Optional[ActivationRequest]:
        """Get an activation request by ID."""
        result = await self.db.execute(
            select(ActivationRequest).where(ActivationRequest.request_id == request_id)
        )
        return result.scalar_one_or_none()
    
    async def list_activation_requests(
        self,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Tuple[List[ActivationRequest], int]:
        """List activation requests with optional status filter."""
        query = select(ActivationRequest)
        count_query = select(ActivationRequest)
        
        if status:
            query = query.where(ActivationRequest.status == status)
            count_query = count_query.where(ActivationRequest.status == status)
        
        query = query.order_by(ActivationRequest.requested_at.desc()).offset(offset).limit(limit)
        
        result = await self.db.execute(query)
        requests = result.scalars().all()
        
        count_result = await self.db.execute(count_query)
        total = len(count_result.scalars().all())
        
        return list(requests), total
    
    # ==================== Issue License ====================
    
    async def issue_license(
        self,
        request: IssueLicenseRequest,
        issued_by: str,
        tenant_id: Optional[str] = None
    ) -> License:
        """Issue a new license, either from activation request or direct."""
        
        # If from activation request, get the request data
        activation = None
        if request.activation_request_id:
            activation = await self.get_activation_request(request.activation_request_id)
            if not activation:
                raise ValueError(f"Activation request {request.activation_request_id} not found")
            if activation.status != "pending":
                raise ValueError(f"Activation request {request.activation_request_id} is not pending")
        
        # Determine license details
        if activation:
            customer_name = request.customer.name if request.customer else activation.customer_name
            customer_vat = request.customer.vat_or_cf if request.customer else activation.customer_vat_or_cf
            modules = request.entitlements.modules if request.entitlements else (activation.requested_modules or [])
            max_users = request.entitlements.max_users if request.entitlements else (activation.requested_max_users or 1)
            max_instances = request.entitlements.max_instances if request.entitlements else (activation.requested_max_instances or 1)
            max_version = request.entitlements.max_version if request.entitlements else None
            fingerprint = request.environment.fingerprint if request.environment else activation.fingerprint
            deployment = request.environment.deployment_type if request.environment else (
                DeploymentTypeEnum(activation.deployment_type.value) if activation.deployment_type else DeploymentTypeEnum.ON_PREM
            )
        else:
            if not request.customer or not request.validity:
                raise ValueError("Customer and validity info required for direct license issue")
            customer_name = request.customer.name
            customer_vat = request.customer.vat_or_cf
            modules = request.entitlements.modules if request.entitlements else []
            max_users = request.entitlements.max_users if request.entitlements else 1
            max_instances = request.entitlements.max_instances if request.entitlements else 1
            max_version = request.entitlements.max_version if request.entitlements else None
            fingerprint = request.environment.fingerprint if request.environment else None
            deployment = request.environment.deployment_type if request.environment else DeploymentTypeEnum.ON_PREM
        
        # Get validity dates
        if request.validity:
            expires_at = request.validity.expires_at
            maintenance_until = request.validity.maintenance_until
        else:
            # Default: 1 year validity
            expires_at = date.today() + timedelta(days=365)
            maintenance_until = expires_at
        
        # Create the license
        license_id = request.license_id or generate_license_id()
        
        # Handle extended entitlements
        apps_entitlements_dict = None
        global_limits_dict = None
        if request.apps_entitlements:
            apps_entitlements_dict = {
                app_id: ent.model_dump() for app_id, ent in request.apps_entitlements.items()
            }
        if request.global_limits:
            global_limits_dict = request.global_limits.model_dump()
        
        license = License(
            license_id=license_id,
            customer_name=customer_name,
            customer_vat_or_cf=customer_vat,
            modules=modules,
            max_users=max_users,
            max_instances=max_instances,
            max_version=max_version,
            fingerprint=fingerprint,
            deployment_type=DeploymentType(deployment.value),
            issued_at=date.today(),
            expires_at=expires_at,
            maintenance_until=maintenance_until,
            status=LicenseStatus.ACTIVE,
            tenant_id=tenant_id,
            created_by=issued_by,
            apps_entitlements=apps_entitlements_dict,
            global_limits=global_limits_dict
        )
        
        self.db.add(license)
        
        # Update activation request if applicable
        if activation:
            activation.status = "approved"
            activation.processed_at = datetime.utcnow()
            activation.processed_by = issued_by
            activation.issued_license_id = license_id
        
        await self.db.commit()
        await self.db.refresh(license)
        return license
    
    # ==================== Get License ====================
    
    async def get_license(self, license_id: str) -> Optional[License]:
        """Get a license by ID."""
        result = await self.db.execute(
            select(License).where(License.license_id == license_id)
        )
        return result.scalar_one_or_none()
    
    async def delete_license(self, license_id: str) -> bool:
        """Delete a license permanently."""
        license = await self.get_license(license_id)
        if not license:
            return False
        
        await self.db.delete(license)
        await self.db.commit()
        return True
    
    async def list_licenses(
        self,
        tenant_id: Optional[str] = None,
        status: Optional[LicenseStatus] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Tuple[List[License], int]:
        """List licenses with optional filters."""
        query = select(License)
        count_query = select(License)
        
        conditions = []
        if tenant_id:
            conditions.append(License.tenant_id == tenant_id)
        if status:
            conditions.append(License.status == status)
        
        if conditions:
            query = query.where(and_(*conditions))
            count_query = count_query.where(and_(*conditions))
        
        query = query.order_by(License.created_at.desc()).offset(offset).limit(limit)
        
        result = await self.db.execute(query)
        licenses = result.scalars().all()
        
        count_result = await self.db.execute(count_query)
        total = len(count_result.scalars().all())
        
        return list(licenses), total
    
    # ==================== Validate License ====================
    
    async def validate_license(self, request: ValidateRequest) -> ValidateResponse:
        """Validate a license and return detailed status."""
        license = await self.get_license(request.license_id)
        
        if not license:
            return ValidateResponse(
                valid=False,
                license_id=request.license_id,
                status=LicenseStatusEnum.PENDING,  # Unknown
                message="License not found"
            )
        
        # Check status
        if license.status == LicenseStatus.REVOKED:
            return ValidateResponse(
                valid=False,
                license_id=license.license_id,
                status=LicenseStatusEnum.REVOKED,
                message="License has been revoked"
            )
        
        if license.status == LicenseStatus.DEACTIVATED:
            return ValidateResponse(
                valid=False,
                license_id=license.license_id,
                status=LicenseStatusEnum.DEACTIVATED,
                message="License has been deactivated"
            )
        
        if license.status == LicenseStatus.SUSPENDED:
            return ValidateResponse(
                valid=False,
                license_id=license.license_id,
                status=LicenseStatusEnum.SUSPENDED,
                message="License is suspended"
            )
        
        # Check expiration
        today = date.today()
        if license.expires_at < today:
            return ValidateResponse(
                valid=False,
                license_id=license.license_id,
                status=LicenseStatusEnum.EXPIRED,
                message="License has expired",
                expires_at=license.expires_at
            )
        
        # Check fingerprint if provided
        if request.fingerprint and license.fingerprint:
            if request.fingerprint != license.fingerprint:
                return ValidateResponse(
                    valid=False,
                    license_id=license.license_id,
                    status=LicenseStatusEnum(license.status.value),
                    message="Fingerprint mismatch",
                    details={"expected_fingerprint": "***", "provided_fingerprint": request.fingerprint[:8] + "..."}
                )
        
        # Check module access if specified
        if request.module:
            if request.module not in (license.modules or []):
                return ValidateResponse(
                    valid=False,
                    license_id=license.license_id,
                    status=LicenseStatusEnum(license.status.value),
                    message=f"Module '{request.module}' not included in license",
                    modules=license.modules
                )
        
        # Check user count if specified
        if request.check_users and license.max_users:
            if request.check_users > license.max_users:
                return ValidateResponse(
                    valid=False,
                    license_id=license.license_id,
                    status=LicenseStatusEnum(license.status.value),
                    message=f"User count ({request.check_users}) exceeds license limit ({license.max_users})",
                    max_users=license.max_users
                )
        
        # Check instance count if specified
        if request.check_instances and license.max_instances:
            if request.check_instances > license.max_instances:
                return ValidateResponse(
                    valid=False,
                    license_id=license.license_id,
                    status=LicenseStatusEnum(license.status.value),
                    message=f"Instance count ({request.check_instances}) exceeds license limit ({license.max_instances})",
                    max_instances=license.max_instances
                )
        
        # Multi-app validation
        app_entitlement_response = None
        global_limits_response = None
        
        if request.app_id and license.apps_entitlements:
            app_ent = license.apps_entitlements.get(request.app_id)
            if not app_ent:
                return ValidateResponse(
                    valid=False,
                    license_id=license.license_id,
                    status=LicenseStatusEnum(license.status.value),
                    message=f"App '{request.app_id}' not included in license",
                    details={"available_apps": list(license.apps_entitlements.keys())}
                )
            
            if not app_ent.get("enabled", True):
                return ValidateResponse(
                    valid=False,
                    license_id=license.license_id,
                    status=LicenseStatusEnum(license.status.value),
                    message=f"App '{request.app_id}' is disabled in this license"
                )
            
            # Check per-role user limits
            if request.user_counts_by_role and "users" in app_ent:
                users_config = app_ent["users"]
                for role, count in request.user_counts_by_role.items():
                    limit = users_config.get(role, 0)
                    if limit != -1 and count > limit:  # -1 = unlimited
                        return ValidateResponse(
                            valid=False,
                            license_id=license.license_id,
                            status=LicenseStatusEnum(license.status.value),
                            message=f"User count for role '{role}' ({count}) exceeds limit ({limit}) for app '{request.app_id}'",
                            details={"role": role, "count": count, "limit": limit}
                        )
            
            app_entitlement_response = AppEntitlement(**app_ent)
        
        if license.global_limits:
            global_limits_response = GlobalLimits(**license.global_limits)
            
            # Check total users across all roles if user_counts_by_role provided
            if request.user_counts_by_role:
                total_users = sum(request.user_counts_by_role.values())
                if global_limits_response.total_users != -1 and total_users > global_limits_response.total_users:
                    return ValidateResponse(
                        valid=False,
                        license_id=license.license_id,
                        status=LicenseStatusEnum(license.status.value),
                        message=f"Total user count ({total_users}) exceeds global limit ({global_limits_response.total_users})",
                        global_limits=global_limits_response
                    )
        
        # License is valid
        days_remaining = (license.expires_at - today).days
        
        return ValidateResponse(
            valid=True,
            license_id=license.license_id,
            status=LicenseStatusEnum.ACTIVE,
            message="License is valid",
            expires_at=license.expires_at,
            days_remaining=days_remaining,
            modules=license.modules,
            max_users=license.max_users,
            max_instances=license.max_instances,
            app_entitlement=app_entitlement_response,
            global_limits=global_limits_response,
            details={
                "maintenance_until": license.maintenance_until.isoformat() if license.maintenance_until else None,
                "deployment_type": license.deployment_type.value if license.deployment_type else None
            }
        )
    
    # ==================== Heartbeat ====================
    
    async def process_heartbeat(self, request: HeartbeatRequest) -> Tuple[bool, str, bool]:
        """Process a license heartbeat. Returns (success, message, license_valid)."""
        license = await self.get_license(request.license_id)
        
        if not license:
            # Still record the heartbeat attempt
            heartbeat = LicenseHeartbeat(
                license_id=request.license_id,
                fingerprint=request.fingerprint,
                ip_address=request.ip_address,
                hostname=request.hostname,
                active_users=request.active_users,
                active_instances=request.active_instances,
                validation_result=False,
                validation_message="License not found"
            )
            self.db.add(heartbeat)
            await self.db.commit()
            return True, "Heartbeat recorded (license not found)", False
        
        # Validate the license
        validation = await self.validate_license(ValidateRequest(
            license_id=request.license_id,
            fingerprint=request.fingerprint,
            check_users=request.active_users,
            check_instances=request.active_instances
        ))
        
        # Record the heartbeat
        heartbeat = LicenseHeartbeat(
            license_id=request.license_id,
            fingerprint=request.fingerprint,
            ip_address=request.ip_address,
            hostname=request.hostname,
            active_users=request.active_users,
            active_instances=request.active_instances,
            validation_result=validation.valid,
            validation_message=validation.message
        )
        self.db.add(heartbeat)
        await self.db.commit()
        
        return True, validation.message, validation.valid
    
    async def get_heartbeat_history(
        self,
        license_id: str,
        limit: int = 100
    ) -> List[LicenseHeartbeat]:
        """Get heartbeat history for a license."""
        result = await self.db.execute(
            select(LicenseHeartbeat)
            .where(LicenseHeartbeat.license_id == license_id)
            .order_by(LicenseHeartbeat.timestamp.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
    
    # ==================== Refresh License ====================
    
    async def refresh_license(
        self,
        request: RefreshLicenseRequest,
        refreshed_by: str
    ) -> License:
        """Refresh/renew a license."""
        license = await self.get_license(request.license_id)
        
        if not license:
            raise ValueError(f"License {request.license_id} not found")
        
        if license.status == LicenseStatus.REVOKED:
            raise ValueError("Cannot refresh a revoked license")
        
        # Calculate new dates
        if request.new_expires_at:
            license.expires_at = request.new_expires_at
        elif request.extend_days:
            # Extend from current expiry or today, whichever is later
            base_date = max(license.expires_at, date.today())
            license.expires_at = base_date + timedelta(days=request.extend_days)
        
        if request.new_maintenance_until:
            license.maintenance_until = request.new_maintenance_until
        elif request.extend_days and license.maintenance_until:
            base_date = max(license.maintenance_until, date.today())
            license.maintenance_until = base_date + timedelta(days=request.extend_days)
        
        # Reactivate if expired
        if license.status == LicenseStatus.EXPIRED:
            license.status = LicenseStatus.ACTIVE
        
        license.updated_at = datetime.utcnow()
        
        await self.db.commit()
        await self.db.refresh(license)
        return license
    
    # ==================== Deactivate License ====================
    
    async def deactivate_license(
        self,
        request: DeactivateRequest,
        deactivated_by: str
    ) -> License:
        """Deactivate a license (customer-initiated)."""
        license = await self.get_license(request.license_id)
        
        if not license:
            raise ValueError(f"License {request.license_id} not found")
        
        if license.status == LicenseStatus.REVOKED:
            raise ValueError("License is already revoked")
        
        if license.status == LicenseStatus.DEACTIVATED:
            raise ValueError("License is already deactivated")
        
        license.status = LicenseStatus.DEACTIVATED
        license.deactivated_at = datetime.utcnow()
        license.deactivated_by = deactivated_by
        license.updated_at = datetime.utcnow()
        
        await self.db.commit()
        await self.db.refresh(license)
        return license
    
    # ==================== Revoke License ====================
    
    async def revoke_license(
        self,
        request: RevokeRequest,
        revoked_by: str
    ) -> License:
        """Revoke a license (admin action)."""
        license = await self.get_license(request.license_id)
        
        if not license:
            raise ValueError(f"License {request.license_id} not found")
        
        if license.status == LicenseStatus.REVOKED:
            raise ValueError("License is already revoked")
        
        license.status = LicenseStatus.REVOKED
        license.revoked_at = datetime.utcnow()
        license.revoked_by = revoked_by
        license.revocation_reason = request.reason
        license.updated_at = datetime.utcnow()
        
        await self.db.commit()
        await self.db.refresh(license)
        return license
    
    # ==================== Helper: Convert to Response ====================
    
    def license_to_response(self, license: License) -> LicenseResponse:
        """Convert a License model to LicenseResponse schema."""
        # Convert apps_entitlements from dict to Pydantic models
        apps_entitlements_response = None
        if license.apps_entitlements:
            apps_entitlements_response = {
                app_id: AppEntitlement(**ent) 
                for app_id, ent in license.apps_entitlements.items()
            }
        
        global_limits_response = None
        if license.global_limits:
            global_limits_response = GlobalLimits(**license.global_limits)
        
        return LicenseResponse(
            license_id=license.license_id,
            customer=CustomerInfo(
                name=license.customer_name,
                vat_or_cf=license.customer_vat_or_cf
            ),
            entitlements=Entitlements(
                modules=license.modules or [],
                max_users=license.max_users,
                max_instances=license.max_instances,
                max_version=license.max_version
            ),
            environment=EnvironmentInfo(
                fingerprint=license.fingerprint,
                deployment_type=DeploymentTypeEnum(license.deployment_type.value) if license.deployment_type else DeploymentTypeEnum.ON_PREM
            ),
            validity=ValidityInfo(
                issued_at=license.issued_at,
                expires_at=license.expires_at,
                maintenance_until=license.maintenance_until
            ),
            status=LicenseStatusEnum(license.status.value) if license.status else LicenseStatusEnum.PENDING,
            tenant_id=license.tenant_id,
            apps_entitlements=apps_entitlements_response,
            global_limits=global_limits_response
        )
