"""
Pydantic schemas for Contact Group API
"""
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime


class ContactGroupMemberSchema(BaseModel):
    contact_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    contact_email: Optional[str] = None
    contact_nickname: Optional[str] = None
    is_creator: bool = False


class CreateContactGroupRequest(BaseModel):
    name: str
    description: Optional[str] = None
    contact_ids: List[UUID] = []
    free_members: List[str] = []  # 直接输入的名字，不需要账号


class UpdateContactGroupRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    contact_ids: Optional[List[UUID]] = None
    free_members: Optional[List[str]] = []  # 直接输入的名字


class ContactGroupResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str] = None
    members: List[ContactGroupMemberSchema] = []
    member_count: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ContactGroupListResponse(BaseModel):
    groups: List[ContactGroupResponse]
    total: int