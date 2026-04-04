"""
Pydantic schemas for expense API
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from decimal import Decimal


class ExpenseItemSchema(BaseModel):
    name: str
    price: Decimal
    quantity: Decimal = Decimal(1)


class ExpenseParticipantSchema(BaseModel):
    name: str
    email: Optional[str] = None  # 新增：用于跨账号身份对齐
    items: Optional[List[str]] = []


class CreateExpenseRequest(BaseModel):
    store_name: Optional[str] = None
    total_amount: Decimal
    subtotal: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None
    tax_rate: Optional[Decimal] = None
    raw_text: Optional[str] = None
    transcript: Optional[str] = None
    items: List[ExpenseItemSchema] = []
    participants: List[ExpenseParticipantSchema] = []


class ExpenseResponse(BaseModel):
    id: str
    user_id: str
    store_name: Optional[str]
    total_amount: Decimal
    subtotal: Optional[Decimal]
    tax_amount: Optional[Decimal]
    tax_rate: Optional[Decimal]
    raw_text: Optional[str]
    transcript: Optional[str]
    items: List[ExpenseItemSchema] = []
    participants: List[ExpenseParticipantSchema] = []
    created_at: datetime

    class Config:
        from_attributes = True


class ExpenseListResponse(BaseModel):
    expenses: List[ExpenseResponse]
    total: int