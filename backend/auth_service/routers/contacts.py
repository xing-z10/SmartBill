"""
Contact and Contact Group Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
import uuid as uuid_lib
from datetime import datetime

from dependencies import get_current_user
from models import User, Contact, ContactGroup, ContactGroupMember
from contact_schemas import AddContactRequest, UpdateContactRequest, ContactResponse, ContactListResponse
from contact_group_schemas import (
    CreateContactGroupRequest,
    UpdateContactGroupRequest,
    ContactGroupResponse,
    ContactGroupListResponse,
    ContactGroupMemberSchema
)
from schemas import MessageResponse

router = APIRouter()


# ==================== Contact/Friend Management Routes ====================

@router.post("/contacts", response_model=ContactResponse)
async def add_contact(request: AddContactRequest, current_user: User = Depends(get_current_user)):
    friend = await User.find_one(User.email == request.friend_email.lower())
    if not friend:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User with this email is not registered")
    if friend.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot add yourself as a contact")
    existing = await Contact.find_one(Contact.user_id == current_user.id, Contact.friend_user_id == friend.id)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This user is already in your contacts")

    contact = Contact(user_id=current_user.id, friend_user_id=friend.id, nickname=request.nickname)
    await contact.insert()

    reverse_existing = await Contact.find_one(Contact.user_id == friend.id, Contact.friend_user_id == current_user.id)
    if not reverse_existing:
        await Contact(user_id=friend.id, friend_user_id=current_user.id, nickname=current_user.email.split('@')[0]).insert()

    return ContactResponse(
        id=str(contact.id), user_id=str(contact.user_id),
        friend_user_id=str(contact.friend_user_id), friend_email=friend.email,
        nickname=contact.nickname, created_at=contact.created_at
    )


@router.get("/contacts", response_model=ContactListResponse)
async def get_contacts(current_user: User = Depends(get_current_user)):
    contacts = await Contact.find(Contact.user_id == current_user.id).to_list()
    contact_responses = []
    for contact in contacts:
        friend = await User.find_one(User.id == contact.friend_user_id)
        if friend:
            contact_responses.append(ContactResponse(
                id=str(contact.id), user_id=str(contact.user_id),
                friend_user_id=str(contact.friend_user_id), friend_email=friend.email,
                nickname=contact.nickname, created_at=contact.created_at
            ))
    return ContactListResponse(contacts=contact_responses, total=len(contact_responses))


@router.put("/contacts/{contact_id}", response_model=ContactResponse)
async def update_contact(contact_id: str, request: UpdateContactRequest, current_user: User = Depends(get_current_user)):
    try:
        contact_uuid = uuid_lib.UUID(contact_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format")

    contact = await Contact.find_one(Contact.id == contact_uuid, Contact.user_id == current_user.id)
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")

    if request.nickname is not None:
        contact.nickname = request.nickname if request.nickname else None
    await contact.save()

    friend = await User.find_one(User.id == contact.friend_user_id)
    return ContactResponse(
        id=str(contact.id), user_id=str(contact.user_id),
        friend_user_id=str(contact.friend_user_id), friend_email=friend.email,
        nickname=contact.nickname, created_at=contact.created_at
    )


@router.delete("/contacts/{contact_id}", response_model=MessageResponse)
async def delete_contact(contact_id: str, current_user: User = Depends(get_current_user)):
    try:
        contact_uuid = uuid_lib.UUID(contact_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format")

    contact = await Contact.find_one(Contact.id == contact_uuid, Contact.user_id == current_user.id)
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")

    await contact.delete()
    return MessageResponse(message="Contact deleted successfully")


# ==================== Contact Group Routes ====================

async def _build_group_response(group: ContactGroup, creator: User) -> ContactGroupResponse:
    """Helper to build ContactGroupResponse with members"""
    members = [ContactGroupMemberSchema(
        contact_id=None, user_id=creator.id,
        contact_email=creator.email, contact_nickname=None, is_creator=True
    )]
    group_members = await ContactGroupMember.find(ContactGroupMember.group_id == group.id).to_list()
    for gm in group_members:
        if gm.contact_id:
            # Linked to a real contact
            contact = await Contact.find_one(Contact.id == gm.contact_id)
            if contact:
                friend = await User.find_one(User.id == contact.friend_user_id)
                if friend:
                    members.append(ContactGroupMemberSchema(
                        contact_id=contact.id, user_id=friend.id,
                        contact_email=friend.email, contact_nickname=contact.nickname, is_creator=False
                    ))
        else:
            # Free member (name only, no contact/user linked)
            members.append(ContactGroupMemberSchema(
                contact_id=None, user_id=None,
                contact_email=gm.free_member_name,  # store name in contact_email field for display
                contact_nickname=gm.free_member_name, is_creator=False
            ))
    return ContactGroupResponse(
        id=group.id, user_id=group.user_id, name=group.name,
        description=group.description, members=members,
        member_count=len(members), created_at=group.created_at, updated_at=group.updated_at
    )


@router.post("/contact-groups", response_model=ContactGroupResponse)
async def create_contact_group(
    request: CreateContactGroupRequest,
    current_user: User = Depends(get_current_user)
):
    if request.contact_ids:
        contact_uuids = [uuid_lib.UUID(str(cid)) for cid in request.contact_ids]
        for cid in contact_uuids:
            contact = await Contact.find_one(Contact.id == cid, Contact.user_id == current_user.id)
            if not contact:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more contacts not found")

    group = ContactGroup(user_id=current_user.id, name=request.name, description=request.description)
    await group.insert()

    # Add contact-linked members
    for contact_id in request.contact_ids:
        await ContactGroupMember(group_id=group.id, contact_id=uuid_lib.UUID(str(contact_id))).insert()

    # Add free-input members (name only)
    for name in (request.free_members or []):
        if name.strip():
            await ContactGroupMember(group_id=group.id, contact_id=None, free_member_name=name.strip()).insert()

    return await _build_group_response(group, current_user)


@router.get("/contact-groups", response_model=ContactGroupListResponse)
async def get_contact_groups(current_user: User = Depends(get_current_user)):
    # 自己创建的 groups
    my_groups = await ContactGroup.find(ContactGroup.user_id == current_user.id).sort(-ContactGroup.created_at).to_list()

    # 自己作为成员的 groups（通过 contact 关联）
    # 找到所有以当前用户为 friend 的 contacts
    contacts_as_friend = await Contact.find(Contact.friend_user_id == current_user.id).to_list()
    contact_ids_as_friend = [c.id for c in contacts_as_friend]

    # 找到这些 contacts 所在的 group members
    shared_group_ids = set()
    if contact_ids_as_friend:
        for cid in contact_ids_as_friend:
            members = await ContactGroupMember.find(ContactGroupMember.contact_id == cid).to_list()
            for m in members:
                shared_group_ids.add(m.group_id)

    # 获取这些 groups，排除已经是自己创建的
    my_group_ids = {g.id for g in my_groups}
    shared_groups = []
    for gid in shared_group_ids:
        if gid not in my_group_ids:
            g = await ContactGroup.find_one(ContactGroup.id == gid)
            if g:
                shared_groups.append(g)

    all_groups = my_groups + shared_groups

    group_responses = []
    for g in all_groups:
        creator = await User.find_one(User.id == g.user_id)
        if creator:
            group_responses.append(await _build_group_response(g, creator))

    return ContactGroupListResponse(groups=group_responses, total=len(group_responses))


@router.put("/contact-groups/{group_id}", response_model=ContactGroupResponse)
async def update_contact_group(
    group_id: str,
    request: UpdateContactGroupRequest,
    current_user: User = Depends(get_current_user)
):
    try:
        group_uuid = uuid_lib.UUID(group_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format")

    group = await ContactGroup.find_one(ContactGroup.id == group_uuid)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if group.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only group creator can update this group")

    if request.name is not None:
        group.name = request.name
    if request.description is not None:
        group.description = request.description
    group.updated_at = datetime.utcnow()

    # Delete all existing members and re-insert
    old_members = await ContactGroupMember.find(ContactGroupMember.group_id == group.id).to_list()
    for m in old_members:
        await m.delete()

    if request.contact_ids is not None:
        if request.contact_ids:
            contact_uuids = [uuid_lib.UUID(str(cid)) for cid in request.contact_ids]
            for cid in contact_uuids:
                contact = await Contact.find_one(Contact.id == cid, Contact.user_id == current_user.id)
                if not contact:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more contacts not found")
        for contact_id in request.contact_ids:
            if contact_id:
                await ContactGroupMember(group_id=group.id, contact_id=uuid_lib.UUID(str(contact_id))).insert()

    for name in (request.free_members or []):
        if name.strip():
            await ContactGroupMember(group_id=group.id, contact_id=None, free_member_name=name.strip()).insert()

    await group.save()
    return await _build_group_response(group, current_user)


@router.delete("/contact-groups/{group_id}", response_model=MessageResponse)
async def delete_contact_group(group_id: str, current_user: User = Depends(get_current_user)):
    try:
        group_uuid = uuid_lib.UUID(group_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format")

    group = await ContactGroup.find_one(ContactGroup.id == group_uuid)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if group.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only group creator can delete this group")

    old_members = await ContactGroupMember.find(ContactGroupMember.group_id == group.id).to_list()
    for m in old_members:
        await m.delete()
    await group.delete()

    return MessageResponse(message="Group deleted successfully")