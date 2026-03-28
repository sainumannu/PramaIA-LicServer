"""License file router for generating, downloading and verifying signed license files."""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from backend.db.database import get_db
from backend.auth.portal_jwt import get_current_user, require_admin, TokenPayload
from backend.services.license_service import LicenseService
from backend.services.license_signing import get_signing_service


router = APIRouter(prefix="/api/license-files", tags=["License Files"])


class SignedLicenseResponse(BaseModel):
    """Response containing a signed license file."""
    success: bool
    message: str
    signed_license: Optional[dict] = None
    filename: Optional[str] = None


class VerifyLicenseRequest(BaseModel):
    """Request to verify a signed license."""
    signed_license: dict


class VerifyLicenseResponse(BaseModel):
    """Response from license verification."""
    valid: bool
    message: str
    license_id: Optional[str] = None
    customer_name: Optional[str] = None
    expires_at: Optional[str] = None


class PublicKeyResponse(BaseModel):
    """Response containing the public key for verification."""
    public_key_pem: str
    fingerprint: str
    algorithm: str = "RSA-SHA256"


@router.get("/{license_id}/generate", response_model=SignedLicenseResponse)
async def generate_signed_license(
    license_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    """Generate a signed license file for download.
    
    This creates a JSON file containing the license data and a digital signature
    that can be verified by clients using the public key.
    """
    service = LicenseService(db)
    signing_service = get_signing_service()
    
    # Get the license
    license = await service.get_license(license_id)
    if not license:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"License {license_id} not found"
        )
    
    # Check tenant access (unless admin)
    tenant_id = current_user.raw.get("tenant_id")
    if not current_user.is_admin and license.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this license"
        )
    
    # Convert license to dict for signing
    license_data = license.to_dict()
    
    # Sign the license
    signed_license = signing_service.sign_license_data(license_data)
    
    filename = f"{license_id}.lic.json"
    
    return SignedLicenseResponse(
        success=True,
        message="Signed license generated successfully",
        signed_license=signed_license,
        filename=filename
    )


@router.get("/{license_id}/download")
async def download_signed_license(
    license_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    """Download a signed license file.
    
    Returns the signed license as a downloadable JSON file.
    """
    service = LicenseService(db)
    signing_service = get_signing_service()
    
    # Get the license
    license = await service.get_license(license_id)
    if not license:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"License {license_id} not found"
        )
    
    # Check tenant access (unless admin)
    tenant_id = current_user.raw.get("tenant_id")
    if not current_user.is_admin and license.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this license"
        )
    
    # Convert and sign
    license_data = license.to_dict()
    signed_license = signing_service.sign_license_data(license_data)
    
    # Format JSON nicely for the file
    content = json.dumps(signed_license, indent=2)
    filename = f"{license_id}.lic.json"
    
    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.post("/verify", response_model=VerifyLicenseResponse)
async def verify_signed_license(
    request: VerifyLicenseRequest,
):
    """Verify a signed license file.
    
    This endpoint is PUBLIC and can be used by anyone to verify
    the authenticity of a license file.
    """
    signing_service = get_signing_service()
    
    is_valid, message = signing_service.verify_signature(request.signed_license)
    
    response = VerifyLicenseResponse(
        valid=is_valid,
        message=message
    )
    
    if is_valid and "license" in request.signed_license:
        license_data = request.signed_license["license"]
        response.license_id = license_data.get("license_id")
        response.customer_name = license_data.get("customer", {}).get("name")
        validity = license_data.get("validity", {})
        response.expires_at = validity.get("expires_at")
    
    return response


@router.get("/public-key", response_model=PublicKeyResponse)
async def get_public_key():
    """Get the public key for license verification.
    
    Clients should use this public key to verify signed license files.
    This endpoint is PUBLIC.
    """
    signing_service = get_signing_service()
    
    return PublicKeyResponse(
        public_key_pem=signing_service.get_public_key_pem(),
        fingerprint=signing_service.get_key_fingerprint(),
        algorithm="RSA-SHA256"
    )


@router.post("/regenerate-keys")
async def regenerate_signing_keys(
    current_user: TokenPayload = Depends(require_admin)
):
    """Regenerate the signing key pair (Admin only).
    
    WARNING: This will invalidate all previously signed licenses!
    Only use this if you need to rotate keys.
    """
    from backend.services.license_signing import generate_key_pair, PRIVATE_KEY_FILE, PUBLIC_KEY_FILE, ensure_keys_directory
    import os
    
    ensure_keys_directory()
    
    # Generate new keys
    private_pem, public_pem = generate_key_pair()
    
    # Backup old keys if they exist
    if PRIVATE_KEY_FILE.exists():
        backup_suffix = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        PRIVATE_KEY_FILE.rename(PRIVATE_KEY_FILE.with_suffix(f".pem.bak.{backup_suffix}"))
        PUBLIC_KEY_FILE.rename(PUBLIC_KEY_FILE.with_suffix(f".pem.bak.{backup_suffix}"))
    
    # Write new keys
    PRIVATE_KEY_FILE.write_bytes(private_pem)
    PUBLIC_KEY_FILE.write_bytes(public_pem)
    os.chmod(PRIVATE_KEY_FILE, 0o600)
    
    # Reload the signing service
    global _signing_service
    from backend.services import license_signing
    license_signing._signing_service = None
    
    signing_service = get_signing_service()
    
    return {
        "message": "Signing keys regenerated successfully",
        "warning": "All previously signed licenses are now invalid!",
        "new_fingerprint": signing_service.get_key_fingerprint()
    }
