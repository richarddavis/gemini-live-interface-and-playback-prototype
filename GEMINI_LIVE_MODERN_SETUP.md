# Modern Gemini Live API Setup Guide

This guide explains the modernized setup for Gemini Live Chat using the latest Gemini 2.0/2.5 models and APIs.

## 🚀 What's New in This Modern Implementation

### Updated Features:
- **Latest Gemini Models**: Support for Gemini 2.0 Flash Live and Gemini 2.5 Flash models
- **Modern API Endpoint**: Direct connection to `generativelanguage.googleapis.com`
- **Enhanced Audio**: Support for native audio generation with multiple voice options
- **Improved Configuration**: Type-safe configuration classes with validation
- **Better Error Handling**: Comprehensive logging and graceful error recovery
- **Advanced Features**: Voice Activity Detection, interruption handling, and session management

### Available Models:
1. **gemini-2.0-flash-live-001** (Default - Recommended)
   - 32k context window
   - Audio + Video support
   - Function calling
   - Code execution
   - 15-minute sessions

2. **gemini-2.5-flash-preview-native-audio-dialog**
   - 128k context window
   - Native audio generation
   - Enhanced audio quality
   - 15-minute sessions

3. **gemini-2.5-flash-exp-native-audio-thinking-dialog**
   - 128k context window
   - Thinking mode (shows reasoning)
   - Native audio generation
   - Advanced reasoning capabilities

### Available Voices:
- **Aoede** (Default) - Melodic, pleasant female voice
- **Puck** - Playful, quick, upbeat male voice
- **Charon** - Gravelly, serious male voice
- **Kore** - Warm, bright female voice
- **Fenrir** - Deep, assertive male voice

## 📋 Prerequisites

1. **Google Cloud Project** with Generative AI API enabled
2. **Service Account Key** with appropriate permissions
3. **Docker & Docker Compose** installed
4. **Modern Python Environment** (Python 3.8+)

## 🔧 Setup Instructions

### 1. Service Account Setup

Your service account needs these permissions:
- `AI Platform Developer` or `Vertex AI User`
- Access to Generative AI API

Place your service account key at:
```
.secrets/gcp/your-service-account-key.json
```

### 2. Environment Configuration

Update your environment variables:
```bash
# In your .env or docker-compose.yml
GOOGLE_APPLICATION_CREDENTIALS=/app/gcp-key.json
GOOGLE_CLOUD_PROJECT=your-project-id
DEBUG=false
LOG_LEVEL=INFO
```

### 3. Docker Deployment

**Quick Start:**
```bash
./start_docker_live.sh
```

**Manual Commands:**
```bash
# Clean rebuild
docker-compose down
docker system prune -f

# Build and start
docker-compose build --no-cache
docker-compose up
```

**Services:**
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:5001
- **WebSocket Proxy**: ws://localhost:8080

### 4. Testing the Modern Setup

1. Navigate to http://localhost:3000
2. Toggle "Live Mode" in the header
3. Click "Connect" - should connect to modern endpoint
4. Test with various features:
   - Text conversations
   - Voice input
   - Different voice models
   - Audio playback

## 🏗️ Architecture Overview

```
Frontend (React)
    ↓ HTTP/WebSocket
Backend (Flask)
    ↓ Token Exchange
WebSocket Proxy (Modern)
    ↓ Authenticated WebSocket
Gemini Live API
    (generativelanguage.googleapis.com)
```

### Key Components:

1. **Modern WebSocket Proxy** (`live_websocket_proxy.py`)
   - Class-based architecture
   - Enhanced error handling
   - Configuration validation
   - Session management

2. **Configuration System** (`gemini_live_config.py`)
   - Type-safe model definitions
   - Voice and feature validation
   - Environment-based configuration
   - Default setup generation

3. **Enhanced Dependencies**
   - Updated Google Auth libraries
   - Modern WebSocket handling
   - Improved error recovery

## 🎛️ Configuration Options

### Model Selection:
```python
# In your frontend or API calls
{
    "model": "models/gemini-2.0-flash-live-001",  # Default
    "model": "models/gemini-2.5-flash-preview-native-audio-dialog",  # Native audio
    "model": "models/gemini-2.5-flash-exp-native-audio-thinking-dialog"  # Thinking mode
}
```

### Voice Configuration:
```javascript
// Frontend configuration
const sessionConfig = {
    voice: "Aoede",  // Or: Puck, Charon, Kore, Fenrir
    responseModalities: ["TEXT", "AUDIO"],
    systemInstruction: "Custom instruction here..."
};
```

### Advanced Features:
```javascript
// Enable specific features
const advancedConfig = {
    functionCalling: true,
    codeExecution: true,
    searchGrounding: true,
    voiceActivityDetection: {
        speechStartTimeout: "1s",
        speechEndTimeout: "2s"
    }
};
```

## 🔧 Troubleshooting

### Common Issues:

1. **Authentication Errors**:
   ```bash
   # Check service account permissions
   docker-compose logs websocket_proxy
   
   # Verify key file is mounted correctly
   docker-compose exec websocket_proxy ls -la /app/gcp-key.json
   ```

2. **Connection Failures**:
   ```bash
   # Test direct connection
   docker-compose exec websocket_proxy python -c "
   from app.live_websocket_proxy import GeminiLiveProxy
   proxy = GeminiLiveProxy()
   print('Credentials loaded:', proxy.credentials is not None)
   "
   ```

3. **Model Errors**:
   ```bash
   # Check supported models
   docker-compose logs websocket_proxy | grep "model"
   ```

### Debug Mode:
```bash
# Enable debug logging
docker-compose down
DEBUG=true docker-compose up
```

### Health Checks:
```bash
# Check all services
docker-compose ps

# View logs
docker-compose logs frontend
docker-compose logs backend
docker-compose logs websocket_proxy
```

## 🚀 Performance Optimizations

### Session Management:
- Automatic session cleanup
- Connection pooling
- Graceful disconnection handling

### Audio Quality:
- 16kHz input, 24kHz output
- Optimized buffer sizes
- Low-latency streaming

### Rate Limits:
- 3 concurrent sessions per API key
- 4M tokens/minute
- 15-minute audio sessions
- 2-minute video sessions

## 🔒 Security Best Practices

1. **Credential Management**:
   - Never expose service account keys in frontend
   - Use environment variables
   - Implement proper token rotation

2. **Network Security**:
   - HTTPS/WSS in production
   - Proper CORS configuration
   - Rate limiting implementation

3. **Data Privacy**:
   - Audio data encryption in transit
   - No persistent audio storage
   - User consent for microphone access

## 📈 Monitoring and Analytics

### Key Metrics:
- Session duration
- Audio quality metrics
- Token usage
- Error rates
- Response latency

### Logging:
```python
# Custom logging in proxy
logger.info(f"Session started: model={model}, voice={voice}")
logger.info(f"Audio received: {len(audio_data)} bytes")
logger.info(f"Response generated: {response_time}ms")
```

## 🛠️ Development Tips

### Local Development:
```bash
# Run only the proxy for testing
cd backend
python run_live_proxy.py

# Test with curl
curl -X POST http://localhost:5001/api/token
```

### Custom Models:
```python
# Add new models to gemini_live_config.py
CUSTOM_MODEL = "models/your-custom-model"
MODEL_FEATURES[CUSTOM_MODEL] = {
    "context_window": 32000,
    "audio_support": True,
    # ... other features
}
```

### Frontend Integration:
```javascript
// Modern WebSocket connection
const ws = new WebSocket('ws://localhost:8080');
ws.onopen = () => {
    ws.send(JSON.stringify({
        bearer_token: token,
        model: "models/gemini-2.0-flash-live-001",
        project_id: "your-project"
    }));
};
```

## 🚀 Production Deployment

### Kubernetes Example:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gemini-live-proxy
spec:
  replicas: 3
  selector:
    matchLabels:
      app: gemini-live-proxy
  template:
    spec:
      containers:
      - name: proxy
        image: your-registry/gemini-live-proxy:latest
        env:
        - name: GOOGLE_APPLICATION_CREDENTIALS
          value: "/secrets/gcp-key.json"
        volumeMounts:
        - name: gcp-credentials
          mountPath: "/secrets"
          readOnly: true
      volumes:
      - name: gcp-credentials
        secret:
          secretName: gcp-service-account
```

### Load Balancing:
- Use sticky sessions for WebSocket connections
- Implement health checks
- Configure auto-scaling based on session count

## 📚 API Reference

### Setup Message Format:
```json
{
  "setup": {
    "model": "models/gemini-2.0-flash-live-001",
    "generation_config": {
      "response_modalities": ["TEXT", "AUDIO"],
      "speech_config": {
        "voice_config": {
          "prebuilt_voice_config": {
            "voice_name": "Aoede"
          }
        }
      }
    },
    "system_instruction": {
      "parts": [{"text": "Your system instruction"}]
    }
  }
}
```

### Client Message Format:
```json
{
  "client_content": {
    "turns": [{
      "role": "user",
      "parts": [{"text": "Your message"}]
    }],
    "turn_complete": true
  }
}
```

### Server Response Format:
```json
{
  "server_content": {
    "model_turn": {
      "parts": [
        {"text": "Response text"},
        {"inline_data": {"mime_type": "audio/pcm", "data": "base64_audio"}}
      ]
    },
    "turn_complete": true
  }
}
```

## 🎯 Next Steps

### Planned Enhancements:
- [ ] Function calling examples
- [ ] Video input support
- [ ] Multi-language voice options
- [ ] Session persistence
- [ ] Advanced analytics dashboard
- [ ] Custom voice training integration

### Contributing:
1. Fork the repository
2. Create feature branch
3. Add tests for new features
4. Submit pull request with detailed description

---

For support, check the [troubleshooting section](#-troubleshooting) or create an issue with:
- Docker logs output
- Error messages
- Configuration details
- Steps to reproduce 