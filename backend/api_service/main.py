"""
Main API Gateway Service - Routes requests to microservices
"""
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Header, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import httpx
from typing import Optional
import os

from config import (
    AUTH_SERVICE_URL,
    OCR_SERVICE_URL,
    STT_SERVICE_URL,
    AI_SERVICE_URL,
)
from auth_middleware import verify_token

# Global HTTP client
http_client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    http_client = httpx.AsyncClient(timeout=60.0)
    yield
    await http_client.aclose()

async def forward_request(
    method: str,
    url: str,
    headers: Optional[dict] = None,
    params: Optional[dict] = None,
    json_data: Optional[dict] = None,
    data: Optional[dict] = None,
    files: Optional[dict] = None,
    timeout: float = None,
    service_name: str = "Service"
):
    try:
        response = await http_client.request(
            method, url, headers=headers, params=params,
            json=json_data, data=data, files=files, timeout=timeout
        )
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        if response.status_code == 204:
            return None
        try:
            return response.json()
        except Exception:
            return response.text
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"{service_name} unavailable: {str(e)}")

app = FastAPI(title="SmartBill API Gateway", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "api_gateway",
        "services": {
            "auth": AUTH_SERVICE_URL,
            "ocr": OCR_SERVICE_URL,
            "stt": STT_SERVICE_URL,
            "ai": AI_SERVICE_URL,
        }
    }


# ==================== Authentication Routes ====================

@app.post("/api/auth/send-verification-code")
async def send_verification_code(request: dict):
    return await forward_request("POST", f"{AUTH_SERVICE_URL}/send-verification-code", json_data=request, service_name="Auth service")

@app.post("/api/auth/register")
async def register(request: dict):
    return await forward_request("POST", f"{AUTH_SERVICE_URL}/register", json_data=request, service_name="Auth service")

@app.post("/api/auth/login")
async def login(request: dict):
    return await forward_request("POST", f"{AUTH_SERVICE_URL}/login", json_data=request, service_name="Auth service")

@app.post("/api/auth/send-password-reset-code")
async def send_password_reset_code(request: dict):
    return await forward_request("POST", f"{AUTH_SERVICE_URL}/send-password-reset-code", json_data=request, service_name="Auth service")

@app.post("/api/auth/reset-password")
async def reset_password(request: dict):
    return await forward_request("POST", f"{AUTH_SERVICE_URL}/reset-password", json_data=request, service_name="Auth service")

@app.get("/api/auth/me")
async def get_current_user(authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("GET", f"{AUTH_SERVICE_URL}/me", headers=headers, service_name="Auth service")


# ==================== OCR Routes ====================

@app.post("/api/ocr/upload")
async def upload_receipt(image: UploadFile = File(...)):
    """Upload receipt image for OCR processing — no authentication required"""
    image_bytes = await image.read()
    try:
        files = {"image": (image.filename, image_bytes, image.content_type)}
        response = await http_client.post(f"{OCR_SERVICE_URL}/api/ocr/upload", files=files, timeout=60.0)
        if response.status_code == 200:
            return response.json()
        else:
            raise HTTPException(status_code=response.status_code, detail=response.text)
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"OCR service unavailable: {str(e)}")

@app.post("/api/ocr/test")
async def test_ocr_parser(request: dict, user: dict = Depends(verify_token)):
    try:
        response = await http_client.post(f"{OCR_SERVICE_URL}/api/ocr/test", json=request)
        if response.status_code == 200:
            result = response.json()
            result["user_id"] = user["user_id"]
            return result
        else:
            raise HTTPException(status_code=response.status_code, detail=response.text)
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"OCR service unavailable: {str(e)}")


# ==================== STT Routes ====================

@app.post("/api/stt/process-voice")
async def process_voice_expense(
    audio: UploadFile = File(...),
    group_members: Optional[str] = Form(None),
    ocr_items: Optional[str] = Form(None),
    current_user_name: Optional[str] = Form(None),
    override_transcript: Optional[str] = Form(None),  # 新增
    user: dict = Depends(verify_token)
):
    audio_bytes = await audio.read()
    try:
        import json
        files = {"audio": (audio.filename or "audio.webm", audio_bytes, audio.content_type or "audio/webm")}
        data = {}

        if group_members:
            try:
                members_list = json.loads(group_members)
                if not isinstance(members_list, list):
                    members_list = [members_list] if isinstance(members_list, str) else []
                if members_list:
                    data["group_members"] = json.dumps(members_list)
            except (json.JSONDecodeError, TypeError) as e:
                print(f"Warning: Could not parse group_members as JSON: {e}")

        if ocr_items:
            try:
                items_list = json.loads(ocr_items)
                if not isinstance(items_list, list):
                    items_list = []
                if items_list:
                    data["ocr_items"] = json.dumps(items_list)
            except (json.JSONDecodeError, TypeError) as e:
                print(f"Warning: Could not parse ocr_items as JSON: {e}")

        if current_user_name:
            data["current_user_name"] = current_user_name
        elif user and user.get("email"):
            data["current_user_name"] = user["email"].split("@")[0].lower()

        # 新增：转发 override_transcript
        if override_transcript and override_transcript.strip():
            data["override_transcript"] = override_transcript.strip()

        response = await http_client.post(
            f"{STT_SERVICE_URL}/process-voice-expense", files=files, data=data, timeout=60.0
        )
        if response.status_code == 200:
            result = response.json()
            result["user_id"] = user["user_id"]
            return result
        else:
            raise HTTPException(status_code=response.status_code, detail=response.text)
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"STT service unavailable: {str(e)}")


# ==================== AI Routes ====================

@app.post("/api/ai/analyze-expense")
async def analyze_expense(request: dict, user: dict = Depends(verify_token)):
    try:
        response = await http_client.post(f"{AI_SERVICE_URL}/api/ai/analyze-expense", json=request)
        if response.status_code == 200:
            result = response.json()
            result["user_id"] = user["user_id"]
            return result
        else:
            raise HTTPException(status_code=response.status_code, detail=response.text)
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"AI service unavailable: {str(e)}")


# ==================== Expense Routes ====================

@app.post("/api/expenses")
async def create_expense(request: dict, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("POST", f"{AUTH_SERVICE_URL}/expenses", json_data=request, headers=headers, service_name="Auth service")

@app.get("/api/expenses")
async def get_expenses(authorization: str = Header(None), user: dict = Depends(verify_token), limit: int = 50, offset: int = 0):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("GET", f"{AUTH_SERVICE_URL}/expenses", params={"limit": limit, "offset": offset}, headers=headers, service_name="Auth service")

@app.delete("/api/expenses/{expense_id}")
async def delete_expense(expense_id: str, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("DELETE", f"{AUTH_SERVICE_URL}/expenses/{expense_id}", headers=headers, service_name="Auth service")

@app.get("/api/expenses/{expense_id}")
async def get_expense(expense_id: str, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("GET", f"{AUTH_SERVICE_URL}/expenses/{expense_id}", headers=headers, service_name="Auth service")

@app.put("/api/expenses/{expense_id}")
async def update_expense(expense_id: str, request: dict, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("PUT", f"{AUTH_SERVICE_URL}/expenses/{expense_id}", json_data=request, headers=headers, service_name="Auth service")


# ==================== Group Routes ====================

@app.post("/api/groups")
async def create_group(request: dict, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("POST", f"{AUTH_SERVICE_URL}/groups", json_data=request, headers=headers, service_name="Auth service")

@app.get("/api/groups")
async def get_groups(authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("GET", f"{AUTH_SERVICE_URL}/groups", headers=headers, service_name="Auth service")

@app.get("/api/groups/{group_id}")
async def get_group(group_id: str, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("GET", f"{AUTH_SERVICE_URL}/groups/{group_id}", headers=headers, service_name="Auth service")

@app.put("/api/groups/{group_id}")
async def update_group(group_id: str, request: dict, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("PUT", f"{AUTH_SERVICE_URL}/groups/{group_id}", json_data=request, headers=headers, service_name="Auth service")

@app.delete("/api/groups/{group_id}")
async def delete_group(group_id: str, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("DELETE", f"{AUTH_SERVICE_URL}/groups/{group_id}", headers=headers, service_name="Auth service")


# ==================== Expense Split Routes ====================

@app.post("/api/expenses/{expense_id}/splits")
async def create_expense_splits(expense_id: str, request: dict, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("POST", f"{AUTH_SERVICE_URL}/expenses/{expense_id}/splits", json_data=request, headers=headers, service_name="Auth service")

@app.get("/api/expenses/{expense_id}/splits")
async def get_expense_splits(expense_id: str, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("GET", f"{AUTH_SERVICE_URL}/expenses/{expense_id}/splits", headers=headers, service_name="Auth service")

@app.post("/api/expenses/{expense_id}/send-bills")
async def send_bills_to_participants(expense_id: str, request: dict, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("POST", f"{AUTH_SERVICE_URL}/expenses/{expense_id}/send-bills", json_data=request, headers=headers, service_name="Auth service")

@app.get("/api/expenses/shared-with-me")
async def get_shared_expenses(authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("GET", f"{AUTH_SERVICE_URL}/expenses/shared-with-me", headers=headers, service_name="Auth service")


# ==================== Contact Routes ====================

@app.get("/api/contacts")
async def get_contacts(authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("GET", f"{AUTH_SERVICE_URL}/contacts", headers=headers, service_name="Auth service")

@app.post("/api/contacts")
async def add_contact(request: dict, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("POST", f"{AUTH_SERVICE_URL}/contacts", json_data=request, headers=headers, service_name="Auth service")

@app.put("/api/contacts/{contact_id}")
async def update_contact(contact_id: str, request: dict, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("PUT", f"{AUTH_SERVICE_URL}/contacts/{contact_id}", json_data=request, headers=headers, service_name="Auth service")

@app.delete("/api/contacts/{contact_id}")
async def delete_contact(contact_id: str, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("DELETE", f"{AUTH_SERVICE_URL}/contacts/{contact_id}", headers=headers, service_name="Auth service")


# ==================== Contact Group Routes ====================

@app.get("/api/contact-groups")
async def get_contact_groups(authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("GET", f"{AUTH_SERVICE_URL}/contact-groups", headers=headers, service_name="Auth service")

@app.post("/api/contact-groups")
async def create_contact_group(request: dict, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("POST", f"{AUTH_SERVICE_URL}/contact-groups", json_data=request, headers=headers, service_name="Auth service")

@app.put("/api/contact-groups/{group_id}")
async def update_contact_group(group_id: str, request: dict, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("PUT", f"{AUTH_SERVICE_URL}/contact-groups/{group_id}", json_data=request, headers=headers, service_name="Auth service")

@app.delete("/api/contact-groups/{group_id}")
async def delete_contact_group(group_id: str, authorization: str = Header(None), user: dict = Depends(verify_token)):
    headers = {"Authorization": authorization} if authorization else {}
    return await forward_request("DELETE", f"{AUTH_SERVICE_URL}/contact-groups/{group_id}", headers=headers, service_name="Auth service")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)