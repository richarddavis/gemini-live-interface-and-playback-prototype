# Gemini Live Chat Setup Guide

This guide explains how to set up and use the Gemini Live Chat feature in your dockerized webapp.

## Prerequisites

1. **Google Cloud Project**: You need a Google Cloud Project with the Vertex AI API enabled
2. **Service Account**: A service account key file with appropriate permissions
3. **Docker & Docker Compose**: Ensure Docker is running on your system

## Architecture

The live chat feature consists of three main components running in Docker containers:

1. **WebSocket Proxy Service**: Handles authentication and proxies connections to Google's Vertex AI Live API
2. **Frontend Service**: React app with live chat UI
3. **Backend Service**: Flask API for token management and regular chat features

## Setup Instructions

### 1. Service Account Setup

Ensure your service account key is placed at:
```
.secrets/gcp/generative-fashion-355408-d2acee530882.json
```

### 2. Docker Setup

**Option A: Using the convenience script (recommended):**
```bash
./start_docker_live.sh
```

**Option B: Manual Docker commands:**
```bash
# Stop existing containers
docker-compose down

# Build and start all services
docker-compose up --build
```

This will start:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:5001  
- **WebSocket Proxy**: ws://localhost:8080

### 3. Access Live Chat

1. Navigate to http://localhost:3000
2. Click the "Live Mode" toggle in the header
3. Click "Connect" to establish WebSocket connection
4. Start chatting!

## Docker Services

### Frontend Service
- Runs React development server
- Connects to backend API and WebSocket proxy
- Accessible on port 3000

### Backend Service  
- Runs Flask API with Gunicorn
- Provides token endpoint for authentication
- Handles file uploads and regular chat
- Accessible on port 5001

### WebSocket Proxy Service
- Runs the live chat WebSocket proxy
- Authenticates with Google Cloud using service account
- Proxies connections to Vertex AI Live API
- Accessible on port 8080

## Usage

### Basic Text Chat

1. Toggle to "Live Mode" in the header
2. Click "Connect" to establish connection
3. Type messages and get real-time responses

### Audio Features

1. **Recording**: Click "Start Recording" for voice input
2. **Playback**: Audio responses play automatically
3. **Replay**: Click "Replay" on audio messages

### Configuration Options

- **Project ID**: Your Google Cloud Project ID
- **Model**: Choose between Gemini Live models
- **Response Modalities**: Select TEXT and/or AUDIO
- **System Instructions**: Customize AI behavior

## Troubleshooting

### Docker Issues

1. **Port Conflicts**: 
   ```bash
   # Check what's using ports
   lsof -i :3000,5001,8080
   # Stop conflicting processes or change ports
   ```

2. **Build Failures**:
   ```bash
   # Clean rebuild
   docker-compose down
   docker system prune -f
   docker-compose build --no-cache
   ```

3. **Service Account Issues**:
   - Verify the key file path: `.secrets/gcp/generative-fashion-355408-d2acee530882.json`
   - Check file permissions (should be readable)
   - Ensure service account has Vertex AI permissions

### Connection Issues

1. **WebSocket Connection Failed**:
   - Check if websocket_proxy service is running: `docker-compose logs websocket_proxy`
   - Verify network connectivity between containers

2. **Authentication Errors**:
   - Check backend logs: `docker-compose logs backend`
   - Verify service account key is correctly mounted

### Development Tips

**View logs for specific services:**
```bash
docker-compose logs frontend
docker-compose logs backend  
docker-compose logs websocket_proxy
```

**Restart a specific service:**
```bash
docker-compose restart websocket_proxy
```

**Interactive debugging:**
```bash
docker-compose exec backend bash
docker-compose exec websocket_proxy bash
```

## Security Notes

- Service account key is mounted read-only in containers
- Authentication happens entirely in backend services
- No API keys required in frontend for live chat

## Supported Features

- ✅ Text conversations in Docker environment
- ✅ Audio input recording  
- ✅ Audio output playback
- ✅ Real-time streaming responses
- ✅ Container-based deployment
- ✅ Auto-scaling with Docker Compose

## Production Considerations

For production deployment:
- Use proper secrets management instead of file mounting
- Configure proper networking and load balancing
- Set up health checks and monitoring
- Use production-grade container orchestration (Kubernetes, etc.)

## API Flow

1. Frontend requests access token from `/api/token`
2. Frontend connects to WebSocket proxy with the token
3. Proxy authenticates with Google's Vertex AI and establishes bidirectional connection
4. Messages flow: Frontend ↔ Proxy ↔ Vertex AI Live API

## Troubleshooting

### Common Issues

1. **Connection Failed**: 
   - Check if the WebSocket proxy is running on port 8080
   - Verify your service account key is valid and has proper permissions

2. **Authentication Errors**:
   - Ensure your service account has Vertex AI permissions
   - Check that the key file path is correct

3. **Audio Issues**:
   - Grant microphone permissions in your browser
   - Check browser console for audio-related errors

### Debug Mode

Enable debug logging in the JavaScript console to see detailed connection information:

```javascript
// In browser console
localStorage.setItem('debug', 'true');
```

## Future Enhancements

- Function calling support
- Image input support
- Advanced audio configuration
- Conversation history
- Multiple concurrent sessions 