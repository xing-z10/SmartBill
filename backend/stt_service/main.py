from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import json
from models.schemas import ExpenseData
from services.transcription import transcription_service
from services.parser import expense_parser_service

app = FastAPI(title="Splitwise Voice Expense API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/process-voice-expense", response_model=ExpenseData)
async def process_voice_expense(
    audio: UploadFile = File(...),
    group_members: Optional[str] = Form(None),
    ocr_items: Optional[str] = Form(None),
    current_user_name: Optional[str] = Form(None),
    override_transcript: Optional[str] = Form(None),  # 新增：直接传入文本跳过 Whisper
):
    try:
        print(f"Received audio file: {audio.filename}, content_type: {audio.content_type}")

        # Parse group_members
        members_list = None
        if group_members:
            try:
                members_list = json.loads(group_members)
                if not isinstance(members_list, list):
                    members_list = [members_list] if isinstance(members_list, str) else None
                print(f"Group members provided: {members_list}")
            except (json.JSONDecodeError, TypeError) as e:
                print(f"Warning: Could not parse group_members as JSON: {e}")

        # Parse ocr_items
        items_list = None
        if ocr_items:
            try:
                items_list = json.loads(ocr_items)
                if not isinstance(items_list, list):
                    items_list = None
                else:
                    print(f"OCR items provided: {len(items_list)} items")
            except (json.JSONDecodeError, TypeError) as e:
                print(f"Warning: Could not parse ocr_items as JSON: {e}")

        # Step 1: Use override transcript or transcribe audio
        if override_transcript and override_transcript.strip():
            transcript = override_transcript.strip()
            print(f"Using override transcript: {transcript}")
        else:
            transcript = await transcription_service.transcribe_audio(audio)

        if not transcript:
            raise HTTPException(status_code=400, detail="No transcript generated from audio")

        # Step 2: Parse transcript
        participants = await expense_parser_service.parse_expense(
            transcript,
            group_members=members_list,
            ocr_items=items_list,
            current_user_name=current_user_name
        )

        return ExpenseData(transcript=transcript, participants=participants)

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing voice: {str(e)}")

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)