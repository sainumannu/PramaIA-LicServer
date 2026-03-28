"""Customer service containing business logic for customer operations."""
import uuid
from datetime import datetime
from typing import Optional, List, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, or_, func

from backend.models.customer import Customer
from backend.schemas.customer_schemas import (
    CustomerCreate, CustomerUpdate, CustomerResponse
)


def generate_customer_id() -> str:
    """Generate a unique customer ID in format CUST-XXXX."""
    random_part = uuid.uuid4().hex[:4].upper()
    return f"CUST-{random_part}"


class CustomerService:
    """Service class for customer operations."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_customer(
        self,
        request: CustomerCreate,
        created_by: str,
        tenant_id: Optional[str] = None
    ) -> Customer:
        """Create a new customer."""
        # Check if VAT/CF already exists
        existing = await self.db.execute(
            select(Customer).where(Customer.vat_or_cf == request.vat_or_cf)
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"Customer with VAT/CF {request.vat_or_cf} already exists")
        
        customer = Customer(
            customer_id=generate_customer_id(),
            name=request.name,
            vat_or_cf=request.vat_or_cf,
            email=request.email,
            phone=request.phone,
            pec=request.pec,
            address=request.address,
            city=request.city,
            province=request.province,
            postal_code=request.postal_code,
            country=request.country or "Italia",
            sdi_code=request.sdi_code,
            notes=request.notes,
            tenant_id=tenant_id,
            created_by=created_by,
        )
        
        self.db.add(customer)
        await self.db.commit()
        await self.db.refresh(customer)
        return customer
    
    async def get_customer(self, customer_id: str, tenant_id: Optional[str] = None) -> Optional[Customer]:
        """Get a customer by ID."""
        query = select(Customer).where(Customer.customer_id == customer_id)
        if tenant_id:
            query = query.where(Customer.tenant_id == tenant_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_customer_by_vat(self, vat_or_cf: str, tenant_id: Optional[str] = None) -> Optional[Customer]:
        """Get a customer by VAT/CF."""
        query = select(Customer).where(Customer.vat_or_cf == vat_or_cf)
        if tenant_id:
            query = query.where(Customer.tenant_id == tenant_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def update_customer(
        self,
        customer_id: str,
        request: CustomerUpdate,
        tenant_id: Optional[str] = None
    ) -> Optional[Customer]:
        """Update a customer."""
        customer = await self.get_customer(customer_id, tenant_id)
        if not customer:
            return None
        
        update_data = request.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(customer, field, value)
        
        customer.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(customer)
        return customer
    
    async def delete_customer(self, customer_id: str, tenant_id: Optional[str] = None) -> bool:
        """Delete a customer (soft delete by setting is_active=False)."""
        customer = await self.get_customer(customer_id, tenant_id)
        if not customer:
            return False
        
        customer.is_active = False
        customer.updated_at = datetime.utcnow()
        await self.db.commit()
        return True
    
    async def search_customers(
        self,
        query: Optional[str] = None,
        is_active: Optional[bool] = None,
        tenant_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[Customer], int]:
        """Search customers with filters and pagination."""
        base_query = select(Customer)
        count_query = select(func.count()).select_from(Customer)
        
        # Apply filters
        if tenant_id:
            base_query = base_query.where(Customer.tenant_id == tenant_id)
            count_query = count_query.where(Customer.tenant_id == tenant_id)
        
        if is_active is not None:
            base_query = base_query.where(Customer.is_active == is_active)
            count_query = count_query.where(Customer.is_active == is_active)
        
        if query:
            search_filter = or_(
                Customer.name.ilike(f"%{query}%"),
                Customer.vat_or_cf.ilike(f"%{query}%"),
                Customer.email.ilike(f"%{query}%"),
                Customer.customer_id.ilike(f"%{query}%"),
            )
            base_query = base_query.where(search_filter)
            count_query = count_query.where(search_filter)
        
        # Get total count
        total_result = await self.db.execute(count_query)
        total = total_result.scalar()
        
        # Apply pagination
        offset = (page - 1) * page_size
        base_query = base_query.order_by(Customer.name).offset(offset).limit(page_size)
        
        result = await self.db.execute(base_query)
        customers = result.scalars().all()
        
        return list(customers), total
    
    async def list_all_customers(self, tenant_id: Optional[str] = None) -> List[Customer]:
        """List all active customers (for dropdowns)."""
        query = select(Customer).where(Customer.is_active == True)
        if tenant_id:
            query = query.where(Customer.tenant_id == tenant_id)
        query = query.order_by(Customer.name)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    def customer_to_response(self, customer: Customer) -> CustomerResponse:
        """Convert customer model to response schema."""
        return CustomerResponse(
            id=customer.id,
            customer_id=customer.customer_id,
            name=customer.name,
            vat_or_cf=customer.vat_or_cf,
            email=customer.email,
            phone=customer.phone,
            pec=customer.pec,
            address=customer.address,
            city=customer.city,
            province=customer.province,
            postal_code=customer.postal_code,
            country=customer.country,
            sdi_code=customer.sdi_code,
            is_active=customer.is_active,
            tenant_id=customer.tenant_id,
            notes=customer.notes,
            created_at=customer.created_at,
            updated_at=customer.updated_at,
        )
