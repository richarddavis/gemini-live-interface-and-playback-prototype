# Live API Integration Guide

This guide explains how to use the newly implemented Google Gemini Live API integration for real-time multimodal communication.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install Python dependencies
pip install -r backend/requirements.txt

# The main new dependencies are:
# - google-genai>=1.16.0 (for Live API)
# - librosa>=0.10.0 (for audio processing)
# - websockets>=12.0 (for WebSocket communication)
```

### 2. Configure API Key

Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey) and add it to your `.env` file:

```bash
GEMINI_API_KEY=your_api_key_here
```

### 3. Test the Integration

```bash
# Run the integration test
python test_live_api_integration.py

# Start the backend server
python start_live_backend.py
```

### 4. Test API Endpoints

```bash
# Health check
curl http://localhost:5000/api/live/health

# Create a text session
curl -X POST http://localhost:5000/api/live/start-session \
  -H "Content-Type: application/json" \
  -d '{"session_type": "text", "voice_name": "Aoede"}'

# Send a message (replace session_id with actual ID)
curl -X POST http://localhost:5000/api/live/send-message \
  -H "Content-Type: application/json" \
  -d '{"session_id": "live_session_0_123456", "message": "Hello!"}'
```

## 🎯 Features Implemented

### ✅ Core Features
- **Real Live API Integration**: Uses Google GenAI SDK for authentic communication
- **Text Communication**: Send/receive text messages in real-time
- **Audio Streaming**: Send audio input and receive audio responses
- **Video Frame Processing**: Send camera frames for visual understanding
- **Session Management**: Create, start, monitor, and end sessions
- **WebSocket Support**: Real-time bidirectional communication
- **Multiple Voice Options**: Aoede, Puck, Charon, Kore, Fenrir, Leda, Orus, Zephyr
- **Configurable Models**: Support for latest Gemini models including `gemini-2.0-flash-live-001`

### 🎛️ Session Types
- **Text**: Text-only communication
- **Audio**: Voice input/output
- **Video**: Camera + text/voice
- **Multimodal**: Full camera + microphone + text

## 📡 API Endpoints

### HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/live/health` | GET | Service health check |
| `/api/live/start-session` | POST | Create a new session |
| `/api/live/session/{id}/connect` | POST | Connect to session |
| `/api/live/session/{id}/status` | GET | Get session status |
| `/api/live/session/{id}/end` | POST | End session |
| `/api/live/send-message` | POST | Send text message |
| `/api/live/session/{id}/send-audio` | POST | Send audio data |
| `/api/live/session/{id}/send-video` | POST | Send video frame |
| `/api/live/sessions` | GET | List active sessions |
| `/api/live/example` | GET | Frontend example code |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `connect` | Client → Server | WebSocket connection |
| `start_session` | Client → Server | Start Live API session |
| `send_text` | Client → Server | Send text message |
| `send_audio` | Client → Server | Send audio data |
| `send_video` | Client → Server | Send video frame |
| `end_session` | Client → Server | End session |
| `session_started` | Server → Client | Session ready |
| `text_response` | Server → Client | AI text response |
| `audio_response` | Server → Client | AI audio response |
| `session_ended` | Server → Client | Session closed |

## 💻 Frontend Integration

### Basic HTML Setup

```html
<!DOCTYPE html>
<html>
<head>
    <title>Live API Demo</title>
    <script src="https://cdn.socket.io/4.5.0/socket.io.min.js"></script>
</head>
<body>
    <video id="video-preview" autoplay muted></video>
    <button id="start-session">Start Session</button>
    <button id="send-message">Send Message</button>
    <button id="end-session">End Session</button>
    
    <script src="live-api-client.js"></script>
</body>
</html>
```

### JavaScript Client

```javascript
// Get the example client code from:
// http://localhost:5000/api/live/example

const liveClient = new LiveAPIClient();

// Start multimodal session
await liveClient.startMultimodalSession();

// Send text message
const response = await liveClient.sendTextMessage("Hello! Can you see me?");

// Start audio recording
liveClient.startRecording();

// End session
await liveClient.endSession();
```

### WebSocket Client

```javascript
const socket = io('http://localhost:5000');

// Start session
socket.emit('start_session', {
    session_type: 'multimodal',
    voice_name: 'Aoede',
    enable_camera: true,
    enable_microphone: true
});

// Listen for responses
socket.on('session_started', (data) => {
    console.log('Session ready:', data.session_id);
});

socket.on('text_response', (data) => {
    console.log('AI response:', data.text);
});
```

## 🎵 Audio Processing

### Input Requirements
- **Format**: 16-bit PCM
- **Sample Rate**: 16kHz  
- **Channels**: Mono
- **Encoding**: Raw bytes or Base64 for WebSocket

### Output Format
- **Format**: 24kHz PCM from Live API
- **Encoding**: Base64 for WebSocket transmission

### Example Audio Processing

```javascript
// Setup audio context for microphone input
const audioContext = new AudioContext();
const source = audioContext.createMediaStreamSource(mediaStream);
const processor = audioContext.createScriptProcessor(4096, 1, 1);

processor.addEventListener('audioprocess', (event) => {
    const inputData = event.inputBuffer.getChannelData(0);
    
    // Convert to 16-bit PCM
    const pcmData = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
    }
    
    // Send to Live API
    sendAudioData(pcmData.buffer);
});
```

## 📹 Video Processing

### Input Requirements
- **Format**: JPEG or PNG
- **Encoding**: Base64 for WebSocket
- **Recommended**: 1 FPS for efficiency

### Example Video Capture

```javascript
function setupVideoCapture() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const video = document.querySelector('#video-preview');
    
    setInterval(() => {
        if (!video.videoWidth) return;
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        
        canvas.toBlob((blob) => {
            if (blob) sendVideoFrame(blob);
        }, 'image/jpeg', 0.8);
    }, 1000); // 1 FPS
}
```

## 🔧 Configuration Options

### Session Configuration

```python
from backend.app.services.live_api_service import LiveSessionConfig

config = LiveSessionConfig(
    session_type="multimodal",      # text, audio, video, multimodal
    voice_name="Aoede",             # Aoede, Puck, Charon, Kore, etc.
    language_code="en-US",          # Language for speech
    system_instruction="Custom instruction...",
    enable_camera=True,             # Video input
    enable_microphone=True,         # Audio input
    model="gemini-2.0-flash-live-001"  # Model to use
)
```

### Available Voices
- **Aoede**: Default female voice
- **Puck**: Energetic voice
- **Charon**: Deep voice
- **Kore**: Warm voice
- **Fenrir**: Strong voice
- **Leda**: Clear voice
- **Orus**: Professional voice
- **Zephyr**: Smooth voice

### Available Models
- `gemini-2.0-flash-live-001` (Recommended)
- `gemini-2.5-flash-preview-native-audio-dialog`
- `gemini-2.5-flash-exp-native-audio-thinking-dialog`

## 🚨 Troubleshooting

### Common Issues

1. **Import Error**: `ModuleNotFoundError: No module named 'google.genai'`
   ```bash
   pip install google-genai>=1.16.0
   ```

2. **API Key Error**: `GEMINI_API_KEY not found`
   - Get key from https://aistudio.google.com/app/apikey
   - Add to `.env` file

3. **Audio Processing Error**: Install audio dependencies
   ```bash
   pip install librosa soundfile
   ```

4. **WebSocket Connection Failed**: Check CORS settings
   ```python
   CORS(app, origins=["*"])
   ```

### Testing Commands

```bash
# Test basic functionality
python test_live_api_integration.py

# Check health endpoint
curl http://localhost:5000/api/live/health

# View example code
curl http://localhost:5000/api/live/example

# Check active sessions
curl http://localhost:5000/api/live/sessions
```

## 📝 Development Notes

### Architecture
- **Service Layer**: `LiveAPIService` handles all Live API communication
- **WebSocket Handler**: `LiveAPIWebSocketHandler` manages real-time events
- **Flask Routes**: REST API for HTTP-based interactions
- **Audio Processing**: Librosa for format conversion
- **Session Management**: In-memory storage (upgrade to Redis for production)

### Next Steps (Future Enhancements)
- Function calling integration
- Code execution capabilities
- Screen sharing support
- File upload handling
- Redis session storage
- Audio response streaming optimization
- Error recovery mechanisms

## 🎉 Success!

You now have a fully functional Live API integration that supports:
- Real-time text communication
- Audio input/output streaming  
- Video frame processing
- WebSocket real-time events
- Multiple session types
- Voice customization

The implementation uses the official Google GenAI SDK and follows Live API best practices for production-ready multimodal AI communication! 