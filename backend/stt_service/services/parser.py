import anthropic
import json
from typing import Optional
from config import settings
from models.schemas import Participant


class ExpenseParserService:

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            api_key = settings.ANTHROPIC_API_KEY
            if api_key:
                self._client = anthropic.Anthropic(api_key=api_key)
        return self._client

    SYSTEM_PROMPT = """Extract expense information from the text. 
    Return JSON with format:
    {
        "participants": [
            {"name": "person_name", "items": ["exact_item_name_from_ocr"]},
            ...
        ]
    }
    Normalize names to lowercase.
    IMPORTANT: For "items", use the EXACT item names from the OCR list provided. Match the spoken items to the OCR items by meaning/similarity.
    IMPORTANT: Return ONLY valid JSON. No markdown, no explanation, no code blocks."""

    async def parse_expense(
        self,
        transcript: str,
        group_members: Optional[list] = None,
        ocr_items: Optional[list] = None,
        current_user_name: Optional[str] = None
    ) -> list[Participant]:
        if not self.client:
            print("Warning: ANTHROPIC_API_KEY not set, returning empty participants")
            return []

        try:
            system_prompt = self.SYSTEM_PROMPT

            if ocr_items and len(ocr_items) > 0:
                items_list = "\n".join([
                    f"- {item.get('name', item) if isinstance(item, dict) else item}"
                    for item in ocr_items
                ])
                system_prompt += f"\n\nAvailable items from receipt (use EXACT names from this list):\n{items_list}\n\nOnly use item names that exist in the list."

            if current_user_name:
                system_prompt += f"\n\nIMPORTANT: When the transcript mentions 'I', 'me', 'my', or 'myself', it refers to the current user: '{current_user_name}'. Map these references to '{current_user_name}' in the participants list."

            if group_members and len(group_members) > 0:
                members_list = ", ".join(group_members)
                system_prompt += f"\n\nThe following people are part of this expense group: {members_list}. Use these names when extracting participants from the transcript."

            user_content = f"Transcript: {transcript}\n\nReturn the JSON response now:"

            print(f"=== Claude Prompt Debug ===")
            print(f"OCR Items: {ocr_items}")
            print(f"Group Members: {group_members}")

            message = self.client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1000,
                system=system_prompt,
                messages=[{"role": "user", "content": user_content}]
            )

            raw_response = message.content[0].text.strip()

            if raw_response.startswith("```"):
                raw_response = raw_response.split("```")[1]
                if raw_response.startswith("json"):
                    raw_response = raw_response[4:]
                raw_response = raw_response.strip()

            print(f"=== Claude Raw Response ===")
            print(f"Raw JSON: {raw_response}")

            parsed_data = json.loads(raw_response)
            participants_raw = parsed_data.get("participants", [])

            # Merge duplicate participants
            merged = {}
            for p in participants_raw:
                name = p.get("name", "").lower().strip()
                items = p.get("items", [])
                if name in merged:
                    merged[name] = list(set(merged[name] + items))
                else:
                    merged[name] = items

            participants = []
            for name, items in merged.items():
                try:
                    participant_obj = Participant(name=name, items=items)
                    participants.append(participant_obj)
                    print(f"Participant: {name} -> {items}")
                except Exception as e:
                    print(f"Error creating Participant: {e}")

            print(f"=== Final Participants ===")
            for p in participants:
                print(f"  - {p.name}: {p.items}")

            return participants

        except json.JSONDecodeError as e:
            print(f"JSON Decode Error: {e}")
            return []
        except Exception as e:
            import traceback
            print(f"Error parsing expense: {e}")
            traceback.print_exc()
            return []


expense_parser_service = ExpenseParserService()
