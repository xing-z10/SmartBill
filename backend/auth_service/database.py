"""
Database connection and session management (MongoDB with Beanie)
"""
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
import os
from dotenv import load_dotenv

# Load from project root .env file
project_root = os.path.join(os.path.dirname(__file__), '..', '..', '..')
env_path = os.path.join(project_root, '.env')
load_dotenv(env_path)
load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "smartbill")

client: AsyncIOMotorClient = None


async def init_db():
    """Initialize MongoDB connection and Beanie ODM"""
    global client
    from models import (
        User, EmailVerificationCode, PasswordResetCode,
        Expense, ExpenseItem, ExpenseParticipant, ExpenseSplit,
        Contact, ContactGroup, ContactGroupMember
    )
    client = AsyncIOMotorClient(MONGODB_URL)
    await init_beanie(
        database=client[MONGODB_DB],
        document_models=[
            User, EmailVerificationCode, PasswordResetCode,
            Expense, ExpenseItem, ExpenseParticipant, ExpenseSplit,
            Contact, ContactGroup, ContactGroupMember
        ]
    )


async def close_db():
    """Close MongoDB connection"""
    global client
    if client:
        client.close()