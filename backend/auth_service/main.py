"""
Authentication Service - Email registration and login
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, close_db
from routers import auth, expenses, contacts, splits

app = FastAPI(title="SmartBill Auth Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    await init_db()  # 改为 await


@app.on_event("shutdown")
async def shutdown_event():
    """Close database on shutdown"""
    await close_db()  # 新增


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "auth_service"}


# Register Routers
app.include_router(auth.router, tags=["Authentication"])
app.include_router(expenses.router, prefix="/expenses", tags=["Expenses"])
app.include_router(contacts.router, tags=["Contacts"])
app.include_router(splits.router, prefix="/expenses", tags=["Splits"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=6000)