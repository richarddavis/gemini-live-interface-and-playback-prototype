# Full Stack Starter App with Live AI Integration

A containerized starter application with:
- React frontend
- Flask backend with **Google AI Live API integration**
- PostgreSQL database
- **Real-time camera and microphone streaming** with Gemini Live

This starter app implements a task manager with **Live AI conversation capabilities** including camera vision and voice interaction.

## ✨ New: Live AI Features

🎥 **Camera Streaming** - AI can see through user's camera  
🎤 **Microphone Streaming** - AI can hear user's voice  
🗣 **Voice Responses** - AI responds with natural speech  
💬 **Real-time Chat** - Bidirectional text and voice communication  
🤖 **AI Vision** - Gemini can analyze video feed in real-time  

## Features

- **React Frontend**: Modern UI with state management
- **Flask Backend**: RESTful API with SQLAlchemy ORM + **Live API integration**
- **PostgreSQL**: Relational database
- **Docker**: Containerized for easy setup and deployment
- **Flask-Migrate**: For database schema migrations
- **Live API Service**: Camera/microphone streaming with Google AI Studio
- **Dual Authentication**: Vertex AI for enterprise + Google AI Studio for Live API
- **Sample Application**: Task manager with Live AI conversation

## Prerequisites

- [Docker](https://www.docker.com/get-started) and Docker Compose
- [Git](https://git-scm.com/downloads)
- **Google AI Studio API Key** (for Live API features)

## 🚀 Quick Start

### 1. Clone and Basic Setup
```bash
git clone <your-repo-url>
cd webapp_starter_cursor
```

### 2. Set Up Live AI (Optional but Recommended)
```bash
# Run the automated setup script
./setup_google_ai_studio.sh
```
This will guide you to get your Google AI Studio API key and configure Live API features.

**📚 For detailed setup: See [SETUP_LIVE_API_GUIDE.md](./SETUP_LIVE_API_GUIDE.md)**

### 3. Start the Application
```bash
docker-compose up --build
```

### 4. Access the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5001/api
- **Live API**: http://localhost:5001/api/live/* (when configured)

## Project Structure

```
.
├── frontend/              # React frontend
├── backend/               # Flask backend
│   ├── app/               # Application package
│   │   ├── api/           # API routes
│   │   │   └── live_api_routes.py  # Live API routes (NEW)
│   │   ├── services/      # Service layer
│   │   │   └── live_api_service.py  # Live API service (NEW)
│   │   ├── models.py      # Database models
│   │   └── __init__.py    # App factory
│   ├── migrations/        # Flask-Migrate migration scripts
│   └── requirements.txt   # Python dependencies
├── test_*.py              # Live API test suites
├── docker-compose.yml     # Docker configuration
├── .env.example           # Environment template
└── SETUP_LIVE_API_GUIDE.md  # Live API setup guide
```

## API Endpoints

### Original Endpoints
- `GET /api/health` - Health check
- `GET /api/tasks` - Get all tasks
- `GET /api/tasks/:id` - Get a specific task
- `POST /api/tasks` - Create a new task
- `PUT /api/tasks/:id` - Update a task
- `DELETE /api/tasks/:id` - Delete a task

### 🆕 Live API Endpoints
- `POST /api/live/start-session` - Start Live AI session
- `GET /api/live/session/:id/status` - Get session status
- `POST /api/live/session/:id/end` - End Live AI session
- WebSocket events for real-time camera/microphone streaming

## 🎯 Live AI Integration

### Backend Integration
```python
from app.services.live_api_service import LiveAPIService

# Start camera and microphone session
live_service = LiveAPIService()
session = await live_service.start_camera_session()

# Send video frame
await session.send_video_frame(frame_bytes)

# Send audio chunk  
await session.send_audio(audio_bytes)

# Receive AI responses
async for response in session.receive_responses():
    if response.get("text"):
        print(f"AI: {response['text']}")
```

### Frontend Integration
```javascript
// Start Live AI session
const response = await fetch('/api/live/start-session', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    session_type: 'camera',
    voice_name: 'Aoede'
  })
});

// Get camera and microphone access
const stream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
});
```

## Development

### Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Add your Google AI Studio API key
GEMINI_API_KEY="your_api_key_here"
```

### Testing Live API
```bash
# Test Live API functionality
docker-compose -f docker-compose.test.yml run --rm backend python test_live_connection.py

# Full test suite
./run_comprehensive_tests.sh
```

### Frontend Development
```bash
cd frontend
npm install
npm start
```

### Backend Development
```bash
cd backend
pip install -r requirements.txt
flask run --host=0.0.0.0 --port=5001
```

## Database Migrations (Flask-Migrate)

This project uses Flask-Migrate to handle database schema changes.

1. **Modify Models**: Make changes to your SQLAlchemy models in `backend/app/models.py`.
2. **Generate Migration**: 
   ```bash
   docker-compose exec backend flask db migrate -m "Your migration message"
   ```
3. **Apply Migration**: Automatically applied on startup or manually:
   ```bash
   docker-compose exec backend flask db upgrade
   ```

## 🔧 Authentication Architecture

This app uses a **hybrid authentication approach**:

- **Vertex AI**: For enterprise features, text AI, function calling
- **Google AI Studio**: For Live API camera/microphone streaming

Both work together seamlessly - no conflicts or complications.

## 📖 Documentation

- **[SETUP_LIVE_API_GUIDE.md](./SETUP_LIVE_API_GUIDE.md)** - Complete Live API setup
- **[LIVE_API_PLATFORM_COMPARISON.md](./LIVE_API_PLATFORM_COMPARISON.md)** - Platform comparison
- **[API Examples](./backend/app/api/live_api_routes.py)** - Live API route examples

## 🧪 Testing

### Quick Test
```bash
# Test basic functionality
docker-compose -f docker-compose.test.yml run --rm backend python test_live_connection.py
```

### Comprehensive Testing
```bash
# Run all Live API tests
./run_comprehensive_tests.sh --docker
```

## Customizing

This starter app is designed to be a foundation for your Live AI projects:

1. **Add Live AI to existing components** using the LiveAPIService
2. **Customize voice personalities** in Live API configurations  
3. **Implement camera-based features** with computer vision
4. **Build voice-controlled interfaces** with speech recognition
5. **Create multimodal AI experiences** combining text, voice, and vision

## 🎯 Next Steps

1. **Set up Live API**: Follow [SETUP_LIVE_API_GUIDE.md](./SETUP_LIVE_API_GUIDE.md)
2. **Test camera/microphone**: Run the test suite
3. **Integrate into your UI**: Use the Live API service and routes
4. **Build AI features**: Camera analysis, voice commands, real-time chat

## License

MIT 