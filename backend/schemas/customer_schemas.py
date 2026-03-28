"""Pydantic schemas for customer-related API operations."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr


class CustomerCreate(BaseModel):
    """Schema for creating a new customer."""
    name: str = Field(..., min_length=1, max_length=255)
    vat_or_cf: str = Field(..., min_length=1, max_length=20)
    email: Optional[str] = None
    phone: Optional[str] = None
    pec: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = "Italia"
    sdi_code: Optional[str] = None
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    """Schema for updating a customer."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[str] = None
    phone: Optional[str] = None
    pec: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    sdi_code: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class CustomerResponse(BaseModel):
    """Full customer response schema."""
    id: int
    customer_id: str
    name: str
    vat_or_cf: str
    email: Optional[str] = None
    phone: Optional[str] = None
    pec: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    sdi_code: Optional[str] = None
    is_active: bool
    tenant_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CustomerListResponse(BaseModel):
    """Response for listing multiple customers."""
    customers: List[CustomerResponse]
    total: int
    page: int
    page_size: int


class CustomerSearchParams(BaseModel):
    """Search parameters for customers."""
    query: Optional[str] = None
    is_active: Optional[bool] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
