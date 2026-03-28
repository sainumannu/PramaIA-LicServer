"""License router with all licensing endpoints."""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import get_db
from backend.auth.portal_jwt import get_current_user, require_admin, optional_user, TokenPayload
from backend.services.license_service import LicenseService
from backend.schemas.license_schemas import (
    ActivationRequestCreate, ActivationRequestResponse,
    ValidateRequest, ValidateResponse,
    HeartbeatRequest, HeartbeatResponse,
    RefreshLicenseRequest, RefreshLicenseResponse,
    DeactivateRequest, DeactivateResponse,
    RevokeRequest, RevokeResponse,
    IssueLicenseRequest, IssueLicenseResponse,
    LicenseResponse, LicenseListResponse,
    LicenseStatusEnum
)
from backend.models.license import LicenseStatus

router = APIRouter(prefix="/api/licenses", tags=["Licenses"])


# ==================== POST /activate-request ====================
@router.post("/activate-request", response_model=ActivationRequestResponse)
async def create_activation_request(
    request: ActivationRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[TokenPayload] = Depends(optional_user)
):
    """
    Request license activation.
    
    This endpoint allows customers to request a new license activation.
    The request will be reviewed and a license will be issued upon approval.
    """
    service = LicenseService(db)
    tenant_id = current_user.tenant_id if current_user else None
    
    try:
        activation = await service.create_activation_request(request, tenant_id)
        return ActivationRequestResponse(
            request_id=activation.request_id,
            status=activation.status,
            message="Activation request created successfully. You will be notified when the license is issued.",
            requested_at=activation.requested_at
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create activation request: {str(e)}"
        )


# ==================== POST /issue-license ====================
@router.post("/issue-license", response_model=IssueLicenseResponse)
async def issue_license(
    request: IssueLicenseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_admin)
):
    """
    Issue a new license (Admin only).
    
    Can issue from an activation request or create a license directly.
    Requires admin privileges.
    """
    service = LicenseService(db)
    
    try:
        license = await service.issue_license(
            request,
            issued_by=current_user.email,
            tenant_id=current_user.tenant_id
        )
        return IssueLicenseResponse(
            success=True,
            license=service.license_to_response(license),
            message=f"License {license.license_id} issued successfully"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to issue license: {str(e)}"
        )


# ==================== POST /validate ====================
@router.post("/validate", response_model=ValidateResponse)
async def validate_license(
    request: ValidateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Validate a license.
    
    This endpoint is public (no authentication required) to allow
    client applications to validate their licenses.
    
    Can optionally check:
    - Fingerprint match
    - Access to specific module
    - User count within limits
    - Instance count within limits
    """
    service = LicenseService(db)
    return await service.validate_license(request)


# ==================== POST /heartbeat ====================
@router.post("/heartbeat", response_model=HeartbeatResponse)
async def license_heartbeat(
    request: HeartbeatRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Send license heartbeat.
    
    Client applications should periodically call this endpoint to:
    - Confirm the license is still in use
    - Report current usage metrics
    - Receive updated license status
    
    This endpoint is public to allow client applications to send heartbeats.
    """
    service = LicenseService(db)
    
    success, message, license_valid = await service.process_heartbeat(request)
    
    return HeartbeatResponse(
        success=success,
        license_id=request.license_id,
        valid=license_valid,
        message=message,
        timestamp=datetime.utcnow(),
        next_heartbeat_seconds=3600 if license_valid else 60  # More frequent if invalid
    )


# ==================== POST /refresh-license ====================
@router.post("/refresh-license", response_model=RefreshLicenseResponse)
async def refresh_license(
    request: RefreshLicenseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_admin)
):
    """
    Refresh/renew a license (Admin only).
    
    Can extend the license validity by:
    - Setting a new expiration date
    - Extending by a number of days
    - Updating maintenance period
    """
    service = LicenseService(db)
    
    try:
        license = await service.refresh_license(request, refreshed_by=current_user.email)
        return RefreshLicenseResponse(
            success=True,
            license_id=license.license_id,
            message=f"License {license.license_id} refreshed successfully",
            new_expires_at=license.expires_at,
            new_maintenance_until=license.maintenance_until
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to refresh license: {str(e)}"
        )


# ==================== POST /deactivate ====================
@router.post("/deactivate", response_model=DeactivateResponse)
async def deactivate_license(
    request: DeactivateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    """
    Deactivate a license.
    
    This is typically a customer-initiated action when they no longer
    need the license (e.g., migrating to a different system).
    """
    service = LicenseService(db)
    
    try:
        license = await service.deactivate_license(request, deactivated_by=current_user.email)
        return DeactivateResponse(
            success=True,
            license_id=license.license_id,
            message=f"License {license.license_id} deactivated successfully",
            deactivated_at=license.deactivated_at
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to deactivate license: {str(e)}"
        )


# ==================== GET /license/{id} ====================
@router.get("/license/{license_id}", response_model=LicenseResponse)
async def get_license(
    license_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    """
    Get license details by ID.
    
    Returns full license information including customer, entitlements,
    environment, and validity details.
    """
    service = LicenseService(db)
    
    license = await service.get_license(license_id)
    if not license:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"License {license_id} not found"
        )
    
    return service.license_to_response(license)


# ==================== POST /revoke ====================
@router.post("/revoke", response_model=RevokeResponse)
async def revoke_license(
    request: RevokeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_admin)
):
    """
    Revoke a license (Admin only).
    
    This is an administrative action to permanently revoke a license.
    Requires a reason to be provided for audit purposes.
    """
    service = LicenseService(db)
    
    try:
        license = await service.revoke_license(request, revoked_by=current_user.email)
        return RevokeResponse(
            success=True,
            license_id=license.license_id,
            message=f"License {license.license_id} revoked successfully",
            revoked_at=license.revoked_at,
            revoked_by=current_user.email
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke license: {str(e)}"
        )


# ==================== Additional utility endpoints ====================

@router.get("/", response_model=LicenseListResponse)
async def list_licenses(
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    """
    List all licenses.
    
    Supports filtering by status and pagination.
    """
    service = LicenseService(db)
    
    license_status = None
    if status:
        try:
            license_status = LicenseStatus(status)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {status}"
            )
    
    licenses, total = await service.list_licenses(
        tenant_id=current_user.tenant_id,
        status=license_status,
        limit=limit,
        offset=offset
    )
    
    return LicenseListResponse(
        licenses=[service.license_to_response(lic) for lic in licenses],
        total=total
    )


@router.get("/activation-requests")
async def list_activation_requests(
    status: Optional[str] = Query(None, description="Filter by status (pending, approved, rejected)"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_admin)
):
    """
    List activation requests (Admin only).
    
    Returns pending, approved, or rejected activation requests.
    """
    service = LicenseService(db)
    
    requests, total = await service.list_activation_requests(
        status=status,
        limit=limit,
        offset=offset
    )
    
    return {
        "requests": [
            {
                "request_id": req.request_id,
                "customer_name": req.customer_name,
                "customer_vat_or_cf": req.customer_vat_or_cf,
                "customer_email": req.customer_email,
                "status": req.status,
                "requested_at": req.requested_at,
                "processed_at": req.processed_at,
                "issued_license_id": req.issued_license_id
            }
            for req in requests
        ],
        "total": total
    }
