# SmartBill - AI-Powered Expense Splitting Assistant

An intelligent expense splitting platform that uses OCR, Speech-to-Text, and LLM to automate bill management.

## Team Members
- Chuanhui He
- Danyan Gu
- Xing Zhou
- Yingyi Kong

## Project Structure
```
SmartBill/
├── backend/
│   ├── api_service/      # API Gateway (Main API Service)
│   ├── auth_service/     # Authentication Service
│   ├── ocr_service/      # OCR module (Yingyi Kong)
│   ├── stt_service/      # Speech-to-Text service
│   ├── ai_service/       # AI & LLM module
│   └── shared/           # Shared code
├── smartbill-app/        # React frontend
├── docs/                 # Documentation
└── README.md
```

## Tech Stack

**Backend:**
- Python (FastAPI)
- Google Gemini 2.5 Flash-Lite (OCR)
- OpenAI/Claude API
- Whisper STT

**Frontend:**
- React.js
- React Router

**Database:**
- PostgreSQL
- SQLAlchemy (ORM)

**Authentication:**
- JWT (JSON Web Tokens)
- Email verification codes
- SMTP email service

## Getting Started

### Prerequisites
- Python 3.12+
- Node.js 18+
- PostgreSQL 14+
- Google Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))

### Backend Setup

#### 1. Database Setup
```bash
# Create PostgreSQL database
createdb smartbill

# Or using psql:
# psql -U postgres
# CREATE DATABASE smartbill;
```

#### 2. Authentication Service (Port 6000)
```bash
cd backend/auth_service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env file (see backend/auth_service/README.md)

# Initialize database
python init_db.py

# Start the server
python -m uvicorn main:app --reload --port 6000
```

#### 3. OCR Service (Port 8000)
```bash
cd backend/ocr_service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env file with:
GEMINI_API_KEY=your_api_key_here

# Start the server
python -m uvicorn main:app --reload --port 8000
```

#### 4. STT Service (Port 8001)
```bash
cd backend/stt_service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env file with:
OPENAI_API_KEY=your_api_key_here

# Start the server
python -m uvicorn main:app --reload --port 8001
```

#### 5. API Gateway Service (Port 5001)
```bash
cd backend/api_service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env file (see backend/api_service/README.md)

# Start the server
python -m uvicorn main:app --reload --port 5001
```

**Note**: All services need to be running simultaneously. It's recommended to use multiple terminal windows.

### Frontend Setup
```bash
cd frontend
npm install

# Create .env file (optional)
# REACT_APP_API_URL=http://localhost:5001

# Start the development server
npm start
```

The frontend will run at `http://localhost:3000`

## Documentation
- [Architecture Design](docs/ARCHITECTURE.md) - System architecture design
- [Software Requirement Specification](docs/SRS.md)
- [API Documentation](docs/API.md)
- [Authentication Service](backend/auth_service/README.md) - Authentication service documentation
- [API Gateway Service](backend/api_service/README.md) - API gateway documentation
- [OCR Service Documentation](backend/ocr_service/README.md) - OCR service documentation

## Service Ports
| Service        | Port | Description                              |
|----------------|------|------------------------------------------|
| API Gateway    | 5001 | Main API service (frontend connects here)|
| Auth Service   | 6000 | Authentication service                   |
| OCR Service    | 8000 | OCR service                             |
| STT Service    | 8001 | Speech-to-text service                  |
| AI Service     | 8002 | AI service                              |
| Frontend       | 3000 | React frontend                          |

## License
MIT License
