"""
Database models for authentication service (MongoDB with Beanie)
"""
from beanie import Document, Link
from pydantic import EmailStr, Field
from typing import Optional, List
from datetime import datetime
import uuid


class User(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    email: EmailStr
    password_hash: str
    email_verified: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Settings:
        name = "users"


class EmailVerificationCode(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    email: str
    code: str
    expires_at: datetime
    used: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "email_verification_codes"


class PasswordResetCode(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    email: str
    code: str
    expires_at: datetime
    used: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "password_reset_codes"


class ExpenseItem(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    expense_id: uuid.UUID
    name: str
    price: float
    quantity: float = 1.0
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "expense_items"


class ExpenseParticipant(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    expense_id: uuid.UUID
    name: str
    email: Optional[str] = None
    items: Optional[str] = None  # JSON string
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "expense_participants"


class ExpenseSplit(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    expense_id: uuid.UUID
    participant_name: str
    participant_email: Optional[str] = None
    contact_id: Optional[uuid.UUID] = None
    amount_owed: float
    items_detail: Optional[str] = None  # JSON string
    is_paid: bool = False
    email_sent: bool = False
    email_sent_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Settings:
        name = "expense_splits"


class Expense(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    user_id: uuid.UUID
    store_name: Optional[str] = None
    total_amount: float
    subtotal: Optional[float] = None
    tax_amount: Optional[float] = None
    tax_rate: Optional[float] = None
    raw_text: Optional[str] = None
    transcript: Optional[str] = None
    receipt_image_url: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Settings:
        name = "expenses"


class Contact(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    user_id: uuid.UUID
    friend_user_id: uuid.UUID
    nickname: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "contacts"


class ContactGroup(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    user_id: uuid.UUID
    name: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Settings:
        name = "contact_groups"


class ContactGroupMember(Document):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    group_id: uuid.UUID
    contact_id: Optional[uuid.UUID] = None       # None for free members
    free_member_name: Optional[str] = None        # Name-only members (no account needed)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "contact_group_members"