"""
Expense Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
import uuid as uuid_lib
import json

from dependencies import get_current_user
from models import User, Expense, ExpenseItem, ExpenseParticipant, ExpenseSplit
from expense_schemas import (
    CreateExpenseRequest,
    ExpenseResponse,
    ExpenseListResponse,
    ExpenseItemSchema,
    ExpenseParticipantSchema
)
from schemas import MessageResponse

router = APIRouter()


async def _build_expense_response(expense: Expense) -> ExpenseResponse:
    items = await ExpenseItem.find(ExpenseItem.expense_id == expense.id).to_list()
    participants = await ExpenseParticipant.find(ExpenseParticipant.expense_id == expense.id).to_list()
    return ExpenseResponse(
        id=str(expense.id),
        user_id=str(expense.user_id),
        store_name=expense.store_name,
        total_amount=expense.total_amount,
        subtotal=expense.subtotal,
        tax_amount=expense.tax_amount,
        tax_rate=expense.tax_rate,
        raw_text=expense.raw_text,
        transcript=expense.transcript,
        items=[ExpenseItemSchema(name=i.name, price=i.price, quantity=i.quantity) for i in items],
        participants=[
            ExpenseParticipantSchema(name=p.name, items=json.loads(p.items) if p.items else [])
            for p in participants
        ],
        created_at=expense.created_at
    )


@router.post("", response_model=ExpenseResponse)
async def create_expense(
    request: CreateExpenseRequest,
    current_user: User = Depends(get_current_user)
):
    expense = Expense(
        user_id=current_user.id,
        store_name=request.store_name,
        total_amount=request.total_amount,
        subtotal=request.subtotal,
        tax_amount=request.tax_amount,
        tax_rate=request.tax_rate,
        raw_text=request.raw_text,
        transcript=request.transcript
    )
    await expense.insert()

    for item_data in request.items:
        await ExpenseItem(
            expense_id=expense.id,
            name=item_data.name,
            price=item_data.price,
            quantity=item_data.quantity
        ).insert()

    for p_data in request.participants:
        await ExpenseParticipant(
            expense_id=expense.id,
            name=p_data.name,
            items=json.dumps(p_data.items) if p_data.items else None
        ).insert()

    return await _build_expense_response(expense)


@router.get("", response_model=ExpenseListResponse)
async def get_expenses(
    current_user: User = Depends(get_current_user),
    limit: int = 50,
    offset: int = 0
):
    expenses = await Expense.find(Expense.user_id == current_user.id)\
        .sort(-Expense.created_at).skip(offset).limit(limit).to_list()
    total = await Expense.find(Expense.user_id == current_user.id).count()

    expense_responses = [await _build_expense_response(e) for e in expenses]
    return ExpenseListResponse(expenses=expense_responses, total=total)


@router.delete("/{expense_id}", response_model=MessageResponse)
async def delete_expense(expense_id: str, current_user: User = Depends(get_current_user)):
    try:
        expense_uuid = uuid_lib.UUID(expense_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format")

    expense = await Expense.find_one(Expense.id == expense_uuid, Expense.user_id == current_user.id)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    # Cascade delete items and participants
    items = await ExpenseItem.find(ExpenseItem.expense_id == expense_uuid).to_list()
    for item in items:
        await item.delete()
    participants = await ExpenseParticipant.find(ExpenseParticipant.expense_id == expense_uuid).to_list()
    for p in participants:
        await p.delete()

    await expense.delete()
    return MessageResponse(message="Expense deleted successfully")


@router.get("/shared-with-me", response_model=ExpenseListResponse)
async def get_shared_expenses(
    current_user: User = Depends(get_current_user),
    limit: int = 50,
    offset: int = 0
):
    splits = await ExpenseSplit.find(
        ExpenseSplit.participant_email == current_user.email
    ).sort(-ExpenseSplit.created_at).skip(offset).limit(limit).to_list()

    expense_ids = list(set([s.expense_id for s in splits]))

    expenses = []
    for eid in expense_ids:
        exp = await Expense.find_one(Expense.id == eid, Expense.user_id != current_user.id)
        if exp:
            expenses.append(exp)

    expense_responses = [await _build_expense_response(e) for e in expenses]
    return ExpenseListResponse(expenses=expense_responses, total=len(expense_responses))