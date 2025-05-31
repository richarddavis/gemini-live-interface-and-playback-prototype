# Full-Stack Chat Application with Google Gemini Live API

A modern, dockerized full-stack web application featuring traditional chat with multiple LLM providers and **direct Google Gemini Live API integration** for real-time multimodal conversations.

## 🏗️ Architecture

### Traditional Chat
```
Frontend (React) ↔ Backend (Flask) ↔ LLM APIs (OpenAI, Anthropic, etc.)
                           ↓
                  Database (PostgreSQL)
```

### Gemini Live API (NEW!)
```
Frontend (React) ↔ WebSocket ↔ Google Gemini Live API
        ↓
Backend (Analytics Only)
```

## ✨ Features

### 💬 Traditional Chat
- **Multiple LLM Providers**: OpenAI, Anthropic, Google, Vertex AI
- **Rich Media Support**: Images, videos, files
- **Session Management**: Create, switch, delete conversations
- **Streaming Responses**: Real-time message streaming
- **Persistent Storage**: PostgreSQL database

### 🎤 Gemini Live API (Direct Connection)
- **Real-time Voice Chat**: Natural voice conversations
- **Video Streaming**: Camera input for visual context
- **Multiple Voices**: Choose from 5 different AI voices
- **Text + Voice**: Seamless switching between modalities
- **Session Analytics**: Usage tracking and statistics
- **Modern UI**: Clean, responsive interface

## 🚀 Quick Start

### 1. Environment Setup

Create `.env` file in the root directory:

```bash
# Database
DATABASE_URL=postgresql://admin:password@db:5432/webapp

# API Keys
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_key

# Gemini Live API (for direct connection)
REACT_APP_GOOGLE_AI_STUDIO_API_KEY=your_api_key_here
REACT_APP_API_URL=http://localhost:8080

# Development
FLASK_ENV=development
REACT_APP_DEBUG=true
```

### 2. Start with Docker

```bash
# Start all services
docker-compose up --build

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:8080
```

### 3. Manual Setup (Development)

```bash
# Backend
cd backend
pip install -r requirements.txt
flask db upgrade
python wsgi.py

# Frontend (new terminal)
cd frontend
npm install
npm start
```

## 📁 Project Structure

```
webapp_starter_cursor/
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── GeminiLiveDirect.js    # Live API component
│   │   │   ├── ChatHeader.js          # Chat controls
│   │   │   └── ...
│   │   └── hooks/
│   └── package.json
├── backend/                  # Flask application
│   ├── app/
│   │   ├── api/
│   │   │   ├── analytics_routes.py    # Live API analytics
│   │   │   ├── routes.py              # Traditional chat API
│   │   │   └── ...
│   │   └── services/
│   ├── requirements.txt
│   └── Dockerfile
├── docker-compose.yml        # Container orchestration
├── README.md                 # This file
└── GEMINI_LIVE_DIRECT.md    # Live API documentation
```

## 🎯 Usage

### Traditional Chat
1. Open http://localhost:3000
2. Add your API keys in the header
3. Select an LLM provider
4. Start chatting with text, images, or videos

### Gemini Live API
1. Click "Toggle Live Mode" in the chat header
2. Click "Connect to Gemini"
3. Configure voice and response settings
4. Enable camera/microphone as needed
5. Start your multimodal conversation!

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Optional |
| `ANTHROPIC_API_KEY` | Anthropic API key | Optional |
| `GOOGLE_API_KEY` | Google AI API key | Optional |
| `REACT_APP_GOOGLE_AI_STUDIO_API_KEY` | Gemini Live API key | For Live API |
| `REACT_APP_API_URL` | Backend URL | Yes |

### Google AI Studio Setup

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create a new project
3. Enable Gemini Live API
4. Generate an API key
5. Add to `REACT_APP_GOOGLE_AI_STUDIO_API_KEY`

## 🛠️ Development

### Adding New Features

1. **Traditional Chat**: Modify backend routes and frontend components
2. **Live API**: Enhance `GeminiLiveDirect.js` component
3. **Analytics**: Add endpoints to `analytics_routes.py`

### Database Migrations

```bash
cd backend

# Create migration
flask db migrate -m "Description"

# Apply migration
flask db upgrade
```

### Testing

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

## 🐳 Docker

### Development
```bash
docker-compose up --build
```

### Production
```bash
docker-compose -f docker-compose.prod.yml up --build
```

### Individual Services
```bash
# Database only
docker-compose up db

# Backend only
docker-compose up backend

# Frontend only
docker-compose up frontend
```

## 📊 Analytics

The backend provides analytics for Live API usage:

- Session tracking (start/end times)
- Interaction counting (text, audio, video)
- Usage statistics
- Error monitoring

Access analytics at: `GET /api/analytics/stats`

## 🔒 Security

- **API Keys**: Store securely, never commit to version control
- **HTTPS**: Required for camera/microphone in production
- **CORS**: Properly configured for frontend domain
- **Database**: Use strong passwords and secure connections

## 🚨 Troubleshooting

### Common Issues

1. **Database Connection**: Check `DATABASE_URL` format
2. **API Keys**: Ensure all required keys are set
3. **CORS Errors**: Verify backend CORS configuration
4. **Live API Connection**: Check Google AI Studio project status
5. **Media Permissions**: Grant browser camera/microphone access

### Logs

```bash
# All services
docker-compose logs

# Specific service
docker-compose logs backend
docker-compose logs frontend
```

## 📚 Documentation

- [Gemini Live API Guide](./GEMINI_LIVE_DIRECT.md) - Detailed Live API documentation
- [API Documentation](./backend/README.md) - Backend API reference
- [Frontend Guide](./frontend/README.md) - Frontend development guide

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆕 What's New

### v2.0 - Direct Gemini Live API
- ✅ Removed complex backend proxy architecture
- ✅ Direct frontend WebSocket connections to Google
- ✅ Simplified backend to analytics-only
- ✅ Modern React component with clean UI
- ✅ Real-time multimodal conversations
- ✅ Comprehensive error handling

### Previous Versions
- v1.x - Traditional multi-LLM chat with media support
- v0.x - Basic chat functionality

---

**Built with ❤️ using React, Flask, PostgreSQL, and Google Gemini Live API** 