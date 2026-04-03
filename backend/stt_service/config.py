from dotenv import load_dotenv
import os

# Load from project root .env file
project_root = os.path.join(os.path.dirname(__file__), '..', '..', '..')
env_path = os.path.join(project_root, '.env')
load_dotenv(env_path)
load_dotenv()

class Settings:
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

settings = Settings()