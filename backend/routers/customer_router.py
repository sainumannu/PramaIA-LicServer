"""Customer router with all customer management endpoints."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import get_db
from backend.auth.portal_jwt import get_current_user, require_admin, TokenPayload
from backend.services.customer_service import CustomerService
from backend.schemas.customer_schemas import (
    CustomerCreate, CustomerUpdate, CustomerResponse, CustomerListResponse
)

router = APIRouter(prefix="/api/customers", tags=["Customers"])


@router.post("/", response_model=CustomerResponse)
async def create_customer(
    request: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    """Create a new customer."""
    service = CustomerService(db)
    
    try:
        customer = await service.create_customer(
            request,
            created_by=current_user.email,
            tenant_id=current_user.raw.get("tenant_id")
        )
        return service.customer_to_response(customer)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create customer: {str(e)}"
        )


@router.get("/", response_model=CustomerListResponse)
async def list_customers(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
    query: Optional[str] = Query(None, description="Search in name, VAT/CF, email"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
):
    """List customers with search and pagination."""
    service = CustomerService(db)
    tenant_id = current_user.raw.get("tenant_id") if not current_user.is_admin else None
    
    customers, total = await service.search_customers(
        query=query,
        is_active=is_active,
        tenant_id=tenant_id,
        page=page,
        page_size=page_size
    )
    
    return CustomerListResponse(
        customers=[service.customer_to_response(c) for c in customers],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/all", response_model=list[CustomerResponse])
async def list_all_customers(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """List all active customers (for dropdowns)."""
    service = CustomerService(db)
    tenant_id = current_user.raw.get("tenant_id") if not current_user.is_admin else None
    
    customers = await service.list_all_customers(tenant_id)
    return [service.customer_to_response(c) for c in customers]


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    """Get a customer by ID."""
    service = CustomerService(db)
    tenant_id = current_user.raw.get("tenant_id") if not current_user.is_admin else None
    
    customer = await service.get_customer(customer_id, tenant_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {customer_id} not found"
        )
    
    return service.customer_to_response(customer)


@router.put("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: str,
    request: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user)
):
    """Update a customer."""
    service = CustomerService(db)
    tenant_id = current_user.raw.get("tenant_id") if not current_user.is_admin else None
    
    customer = await service.update_customer(customer_id, request, tenant_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {customer_id} not found"
        )
    
    return service.customer_to_response(customer)


@router.delete("/{customer_id}")
async def delete_customer(
    customer_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_admin)
):
    """Delete a customer (soft delete). Admin only."""
    service = CustomerService(db)
    
    success = await service.delete_customer(customer_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {customer_id} not found"
        )
    
    return {"message": f"Customer {customer_id} deleted successfully"}
