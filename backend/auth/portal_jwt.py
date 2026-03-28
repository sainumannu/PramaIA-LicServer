import os
import jwt
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

security = HTTPBearer(auto_error=False)

PRAMAIA_JWT_SECRET = os.getenv("PRAMAIA_JWT_SECRET")
if not PRAMAIA_JWT_SECRET:
    raise ValueError("PRAMAIA_JWT_SECRET must be set in .env — same value as PramaIA Portal")

PORTAL_ISSUER = "pramaia-portal"


class TokenPayload:
    def __init__(self, data: dict):
        self.sub: str = data.get("sub", "")
        self.email: str = data.get("email", "")
        self.display_name: str = data.get("display_name", "")
        self.roles: list[str] = data.get("roles", [])
        self.apps: list[str] = data.get("apps", [])
        self.tenant_id: str = data.get("tenant_id", "default")
        self.tenants: list[str] = data.get("tenants", [])
        self.tenant_role: str = data.get("tenant_role", "member")
        self.app_admin_for: list[str] = data.get("app_admin_for", [])
        self.is_admin: bool = "admin" in self.roles
        self.raw = data


def decode_portal_token(token: str) -> TokenPayload:
    """Valida un JWT emesso da PramaIA Portal."""
    try:
        payload = jwt.decode(
            token,
            PRAMAIA_JWT_SECRET,
            algorithms=["HS256"],
            options={"require": ["sub", "exp", "iss"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidIssuerError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token issuer")
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")

    if payload.get("iss") != PORTAL_ISSUER:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token not issued by PramaIA Portal")

    return TokenPayload(payload)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> TokenPayload:
    """Dipendenza FastAPI: utente autenticato obbligatorio."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please login via PramaIA Portal.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_portal_token(credentials.credentials)


def require_admin(user: TokenPayload = Security(get_current_user)) -> TokenPayload:
    """Dipendenza FastAPI: richiede ruolo admin."""
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return user


def optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> Optional[TokenPayload]:
    """Dipendenza FastAPI: utente opzionale (endpoint pubblici)."""
    if not credentials:
        return None
    try:
        return decode_portal_token(credentials.credentials)
    except HTTPException:
        return None
