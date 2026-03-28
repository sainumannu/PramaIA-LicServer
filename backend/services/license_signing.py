"""License signing service using RSA digital signatures.

This module provides functionality to:
1. Generate and manage RSA key pairs for signing
2. Sign license files with the private key
3. Verify license signatures with the public key
"""
import os
import json
import base64
import hashlib
from datetime import datetime
from typing import Tuple, Optional, Union
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey, RSAPublicKey
from cryptography.hazmat.backends import default_backend
from cryptography.exceptions import InvalidSignature

# Keys storage directory
KEYS_DIR = Path(os.getenv("KEYS_DIR", "./keys"))
PRIVATE_KEY_FILE = KEYS_DIR / "license_private_key.pem"
PUBLIC_KEY_FILE = KEYS_DIR / "license_public_key.pem"

# Key configuration
KEY_SIZE = 2048  # RSA key size in bits


def ensure_keys_directory():
    """Ensure the keys directory exists."""
    KEYS_DIR.mkdir(parents=True, exist_ok=True)


def generate_key_pair() -> Tuple[bytes, bytes]:
    """Generate a new RSA key pair.
    
    Returns:
        Tuple of (private_key_pem, public_key_pem)
    """
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=KEY_SIZE,
        backend=default_backend()
    )
    
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    
    public_key = private_key.public_key()
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    
    return private_pem, public_pem


def init_signing_keys() -> Tuple[bytes, bytes]:
    """Initialize or load signing keys.
    
    If keys don't exist, generate new ones.
    Returns:
        Tuple of (private_key_pem, public_key_pem)
    """
    ensure_keys_directory()
    
    if PRIVATE_KEY_FILE.exists() and PUBLIC_KEY_FILE.exists():
        # Load existing keys
        private_pem = PRIVATE_KEY_FILE.read_bytes()
        public_pem = PUBLIC_KEY_FILE.read_bytes()
    else:
        # Generate new keys
        private_pem, public_pem = generate_key_pair()
        PRIVATE_KEY_FILE.write_bytes(private_pem)
        PUBLIC_KEY_FILE.write_bytes(public_pem)
        # Set restrictive permissions on private key (Unix-like systems)
        try:
            os.chmod(PRIVATE_KEY_FILE, 0o600)
        except OSError:
            pass  # Windows may not support chmod
    
    return private_pem, public_pem


def get_public_key() -> bytes:
    """Get the public key PEM."""
    if not PUBLIC_KEY_FILE.exists():
        init_signing_keys()
    return PUBLIC_KEY_FILE.read_bytes()


def get_private_key() -> bytes:
    """Get the private key PEM."""
    if not PRIVATE_KEY_FILE.exists():
        init_signing_keys()
    return PRIVATE_KEY_FILE.read_bytes()


class LicenseSigningService:
    """Service for signing and verifying license files."""
    
    def __init__(self):
        self._private_key: RSAPrivateKey
        self._public_key: RSAPublicKey
        self._load_keys()
    
    def _load_keys(self):
        """Load or initialize signing keys."""
        private_pem, public_pem = init_signing_keys()
        
        private_key = serialization.load_pem_private_key(
            private_pem,
            password=None,
            backend=default_backend()
        )
        
        public_key = serialization.load_pem_public_key(
            public_pem,
            backend=default_backend()
        )
        
        # Ensure we have RSA keys
        if not isinstance(private_key, RSAPrivateKey):
            raise TypeError("Private key must be RSA")
        if not isinstance(public_key, RSAPublicKey):
            raise TypeError("Public key must be RSA")
        
        self._private_key = private_key
        self._public_key = public_key
    
    def sign_license_data(self, license_data: dict) -> dict:
        """Sign license data and return signed license file content.
        
        The signed license file contains:
        - license: The original license data
        - signature: Base64 encoded signature
        - signed_at: Timestamp of signing
        - public_key_fingerprint: SHA256 fingerprint of the public key
        
        Args:
            license_data: Dictionary containing license information
            
        Returns:
            Dictionary containing the signed license file
        """
        # Serialize license data to canonical JSON
        license_json = json.dumps(license_data, sort_keys=True, separators=(',', ':'))
        license_bytes = license_json.encode('utf-8')
        
        # Sign the license data
        signature = self._private_key.sign(
            license_bytes,
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        
        # Calculate public key fingerprint
        public_pem = self._public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        key_fingerprint = hashlib.sha256(public_pem).hexdigest()[:16]
        
        signed_license = {
            "license": license_data,
            "signature": base64.b64encode(signature).decode('ascii'),
            "signed_at": datetime.utcnow().isoformat() + "Z",
            "key_fingerprint": key_fingerprint,
            "algorithm": "RSA-SHA256"
        }
        
        return signed_license
    
    def verify_signature(self, signed_license: dict) -> Tuple[bool, str]:
        """Verify a signed license file.
        
        Args:
            signed_license: Dictionary containing the signed license
            
        Returns:
            Tuple of (is_valid, message)
        """
        try:
            license_data = signed_license.get("license")
            signature_b64 = signed_license.get("signature")
            
            if not license_data or not signature_b64:
                return False, "Invalid signed license format: missing license or signature"
            
            # Decode signature
            try:
                signature = base64.b64decode(signature_b64)
            except Exception:
                return False, "Invalid signature format"
            
            # Serialize license data to canonical JSON
            license_json = json.dumps(license_data, sort_keys=True, separators=(',', ':'))
            license_bytes = license_json.encode('utf-8')
            
            # Verify signature
            try:
                self._public_key.verify(
                    signature,
                    license_bytes,
                    padding.PKCS1v15(),
                    hashes.SHA256()
                )
                return True, "Signature is valid"
            except InvalidSignature:
                return False, "Signature verification failed: signature is invalid"
                
        except Exception as e:
            return False, f"Verification error: {str(e)}"
    
    def get_public_key_pem(self) -> str:
        """Get the public key in PEM format for distribution to clients."""
        return self._public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode('ascii')
    
    def get_key_fingerprint(self) -> str:
        """Get the SHA256 fingerprint of the public key."""
        public_pem = self._public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        return hashlib.sha256(public_pem).hexdigest()


# Singleton instance
_signing_service: Optional[LicenseSigningService] = None


def get_signing_service() -> LicenseSigningService:
    """Get the signing service singleton."""
    global _signing_service
    if _signing_service is None:
        _signing_service = LicenseSigningService()
    return _signing_service
