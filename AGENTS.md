# Gemini Live API WebApp - Agent Instructions

## Project Overview
React frontend + Flask backend webapp for real-time audio/video communication with Gemini Live API.

## Stack
- **Frontend**: React, WebSocket, Audio/Video APIs  
- **Backend**: Flask, PostgreSQL, Google Cloud Storage
- **Infrastructure**: Docker (containerization), Google Cloud Platform

## Key Files & Structure
```
frontend/src/
├── components/     # React components
├── hooks/         # Custom hooks (useInteractionReplay)
├── services/      # API & WebSocket services
└── contexts/      # React contexts

backend/
├── app/api/       # Flask API endpoints  
├── app/services/  # Backend business logic
├── static/uploads/# Static file storage
└── tests/         # Backend tests
```

## Development Guidelines
- **Audio/Video**: Use segment-based playback for audio, proper state management for video
- **WebSocket**: Direct connection to Gemini Live API for real-time communication
- **Database**: PostgreSQL for interaction storage, migrations via Flask-Migrate
- **Testing**: Backend uses pytest, Frontend uses Jest
- **GCP Integration**: Google Cloud Storage for media files

## Commands
```bash
# Start development
docker-compose up          # Full stack with services
npm run api               # Backend only (from root)
npm run dev               # Frontend only (from frontend/)

# Testing  
pytest                    # Backend tests (from backend/)
npm test                  # Frontend tests (from frontend/)
```

## Environment Variables
- `REACT_APP_GEMINI_API_KEY`: Gemini Live API key
- `DATABASE_URL`: PostgreSQL connection string
- `GCS_BUCKET_NAME`: Google Cloud Storage bucket
- `GOOGLE_APPLICATION_CREDENTIALS`: GCP service account key

## Notes
- Do not guess Gemini Live API endpoints - search for current documentation
- Preserve existing audio/video playback functionality when making changes
- Use Flask-SQLAlchemy for database operations
- Environment variables are managed via .env file

## Testing Guidelines
- **Do not run tests automatically.** The test suite is for local development and CI/CD, not the Codex sandbox.
- Many tests are integration tests that require live network access and will fail here.
- If you must run tests, run unit tests only. Backend unit tests will pass, but integration tests will be skipped.
- Focus on functional development and code generation. 