"""
Expense Split Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
import uuid as uuid_lib
import json
from datetime import datetime

from dependencies import get_current_user
from models import User, Expense, ExpenseSplit, Contact
from split_schemas import (
    CreateExpenseSplitRequest,
    ExpenseSplitResponse,
    ExpenseSplitListResponse,
    SendBillRequest,
    SendBillResponse
)
from schemas import MessageResponse
from email_service import send_split_bill_email

router = APIRouter()


@router.post("/{expense_id}/splits", response_model=MessageResponse)
async def create_expense_splits(
    expense_id: str,
    request: CreateExpenseSplitRequest,
    current_user: User = Depends(get_current_user)
):
    try:
        expense_uuid = uuid_lib.UUID(expense_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format")

    expense = await Expense.find_one(Expense.id == expense_uuid, Expense.user_id == current_user.id)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    for participant in request.participants:
        participant_email = participant.email
        contact_id = None

        if participant.contact_id:
            try:
                contact_uuid = uuid_lib.UUID(participant.contact_id)
                contact = await Contact.find_one(Contact.id == contact_uuid, Contact.user_id == current_user.id)
                if contact:
                    friend = await User.find_one(User.id == contact.friend_user_id)
                    if friend:
                        participant_email = friend.email
                        contact_id = contact_uuid
            except (ValueError, TypeError):
                pass

        await ExpenseSplit(
            expense_id=expense_uuid,
            participant_name=participant.name,
            participant_email=participant_email,
            contact_id=contact_id,
            amount_owed=float(participant.amount_owed),
            items_detail=json.dumps(participant.items_detail) if participant.items_detail else None
        ).insert()

    return MessageResponse(message="Expense splits created successfully")


@router.get("/{expense_id}/splits", response_model=ExpenseSplitListResponse)
async def get_expense_splits(
    expense_id: str,
    current_user: User = Depends(get_current_user)
):
    try:
        expense_uuid = uuid_lib.UUID(expense_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format")

    expense = await Expense.find_one(Expense.id == expense_uuid, Expense.user_id == current_user.id)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    splits = await ExpenseSplit.find(ExpenseSplit.expense_id == expense_uuid).to_list()

    split_responses = [
        ExpenseSplitResponse(
            id=str(s.id),
            expense_id=str(s.expense_id),
            participant_name=s.participant_name,
            participant_email=s.participant_email,
            contact_id=str(s.contact_id) if s.contact_id else None,
            amount_owed=s.amount_owed,
            items_detail=s.items_detail,
            is_paid=s.is_paid,
            email_sent=s.email_sent,
            email_sent_at=s.email_sent_at,
            created_at=s.created_at
        )
        for s in splits
    ]

    return ExpenseSplitListResponse(splits=split_responses, total=len(split_responses))


async def process_bill_sending_task(
    expense_uuid: uuid_lib.UUID,
    participant_ids: list[str],
    payer_email: str,
    payer_name: str
):
    """Background task to send bill emails"""
    try:
        expense = await Expense.find_one(Expense.id == expense_uuid)
        if not expense:
            print(f"Expense {expense_uuid} not found in background task")
            return

        expense_data = {
            'store_name': expense.store_name or "Unknown",
            'total': expense.total_amount,
            'date': expense.created_at.strftime("%B %d, %Y") if expense.created_at else "Recent"
        }

        for split_id_str in participant_ids:
            try:
                split_id = uuid_lib.UUID(split_id_str)
                split = await ExpenseSplit.find_one(
                    ExpenseSplit.id == split_id,
                    ExpenseSplit.expense_id == expense_uuid
                )
                if not split or not split.participant_email:
                    continue

                split_data = {
                    'amount_owed': split.amount_owed,
                    'items_detail': json.loads(split.items_detail) if split.items_detail else []
                }

                success = await send_split_bill_email(
                    to_email=split.participant_email,
                    to_name=split.participant_name,
                    payer_name=payer_name,
                    expense_data=expense_data,
                    split_data=split_data
                )

                if success:
                    split.email_sent = True
                    split.email_sent_at = datetime.utcnow()
                    await split.save()

            except Exception as e:
                print(f"Error sending email to participant {split_id_str}: {e}")

    except Exception as e:
        print(f"Error in background bill sending task: {e}")


@router.post("/{expense_id}/send-bills", response_model=SendBillResponse)
async def send_bills_to_participants(
    expense_id: str,
    request: SendBillRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    try:
        expense_uuid = uuid_lib.UUID(expense_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format")

    expense = await Expense.find_one(Expense.id == expense_uuid, Expense.user_id == current_user.id)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    payer_name = current_user.email.split('@')[0]
    background_tasks.add_task(
        process_bill_sending_task,
        expense_uuid,
        request.participant_ids,
        current_user.email,
        payer_name
    )

    return SendBillResponse(
        sent_count=0,
        failed_count=0,
        results=[{
            "participant_id": "all",
            "participant_name": "all",
            "status": "queued",
            "message": "Emails are being sent in the background"
        }]
    )