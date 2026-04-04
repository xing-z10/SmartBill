#!/bin/bash

echo "🚀 Starting SmartBill..."

# Start MongoDB
brew services start mongodb-community
echo "✅ MongoDB started"

BASE=/Users/xingz/Desktop/NEU/Fall2025/CS5500/project/SmartBill/backend

start_service() {
  local name=$1
  local dir=$2
  local port=$3

  lsof -ti:$port | xargs kill -9 2>/dev/null
  cd "$dir"
  source venv/bin/activate
  python -m uvicorn main:app --port $port &
  echo "✅ $name started on port $port"
  cd -
}

start_service "Auth Service" "$BASE/auth_service" 6000
start_service "OCR Service"  "$BASE/ocr_service"  8000
start_service "STT Service"  "$BASE/stt_service"  8001
start_service "API Gateway"  "$BASE/api_service"  5001

# Start frontend
cd /Users/xingz/Desktop/NEU/Fall2025/CS5500/project/SmartBill/frontend
npm start &
echo "✅ Frontend started on port 3000"

echo ""
echo "🎉 All services started!"
echo "   Frontend:    http://localhost:3000"
echo "   API Gateway: http://localhost:5001"
echo ""
echo "Press Ctrl+C to stop all services"

wait
