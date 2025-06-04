# Google Gemini Live API - Direct Connection

## Architecture Overview

This application uses a **direct connection** architecture for Google Gemini Live API:

```
Frontend ↔ WebSocket ↔ Google Gemini Live API
   ↓
Backend (Analytics Only)
```

### Why Direct Connection?

1. **Simpler Architecture**: No complex backend proxy needed
2. **Better Performance**: Direct WebSocket connection to Google
3. **Easier Debugging**: Frontend-only Live API logic
4. **Cost Efficient**: Backend only logs analytics, not processing
5. **Google's Intended Design**: Live API is designed for direct client connections

## Setup Instructions

### 1. Get Google AI Studio API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create a new project or select existing
3. Generate an API key with Gemini Live API access
4. Copy the API key

### 2. Configure Environment

Create `.env` file in the root directory:

```bash
# Frontend Environment Variables
REACT_APP_GEMINI_API_KEY=your_api_key_here
REACT_APP_API_URL=http://localhost:8080

# Backend Environment Variables (for analytics)
DATABASE_URL=postgresql://user:password@localhost:5432/webapp
FLASK_ENV=development
```

### 3. Run the Application

```bash
# Start backend (for analytics)
cd backend
docker-compose up

# Start frontend (in new terminal)
cd frontend
npm install
npm start
```

## Features

### ✅ Working Features

- **Direct WebSocket Connection** to Google Gemini Live API
- **Real-time Voice Chat** with multiple voice options (Puck, Aoede, Kore, etc.)
- **Video Stream Support** with camera integration
- **Text Messages** alongside voice/video
- **Session Analytics** logged to backend
- **Clean Modern UI** with responsive design
- **Error Handling** with helpful messages

### 🎛️ Configuration Options

- **Voice Selection**: Choose from 5 different voices
- **Response Mode**: Text or Audio responses
- **System Instructions**: Customize AI behavior
- **Media Controls**: Toggle camera/microphone

## Usage

1. **Open Live Mode**: Click "Toggle Live Mode" in the chat header
2. **Connect**: Click "Connect to Gemini" button
3. **Configure**: Select voice, response mode, and system instructions
4. **Chat**: 
   - Type text messages and press Enter
   - Enable camera for video input
   - Enable microphone for voice input
5. **Disconnect**: Click "Disconnect" when finished

## Backend Analytics

The simplified backend provides these analytics endpoints:

- `POST /api/analytics/log-session-start` - Log when sessions start
- `POST /api/analytics/log-session-end` - Log session completion
- `POST /api/analytics/log-interaction` - Log user interactions
- `GET /api/analytics/stats` - Get usage statistics
- `GET /api/analytics/health` - Health check

## Technical Implementation

### Frontend (`GeminiLiveDirect.js`)

- **WebSocket Connection**: Direct to `wss://generativelanguage.googleapis.com/ws/...`
- **Media Handling**: WebRTC for camera/microphone access
- **Audio Processing**: Base64 encoding for real-time audio streaming
- **Video Processing**: Canvas-based frame capture and JPEG encoding
- **State Management**: React hooks for connection and session state

### Backend (`analytics_routes.py`)

- **Logging Only**: Simple endpoints for usage tracking
- **No Proxy Logic**: No complex WebSocket proxying
- **Database Storage**: Optional PostgreSQL for analytics
- **CORS Enabled**: Allows frontend connections

## Troubleshooting

### Common Issues

1. **"Please set REACT_APP_GEMINI_API_KEY"**
   - Solution: Add API key to `.env` file

2. **WebSocket Connection Failed**
   - Check API key validity
   - Ensure internet connection
   - Verify Google AI Studio project status

3. **Camera/Microphone Not Working**
   - Grant browser permissions
   - Use HTTPS or localhost
   - Check device availability

4. **Audio Not Playing**
   - Check browser audio permissions
   - Ensure speakers/headphones connected
   - Try refreshing the page

### Browser Requirements

- **Chrome**: Recommended (best WebRTC support)
- **Firefox**: Supported
- **Safari**: Limited support (WebRTC issues)
- **Mobile**: Partial support (depends on device)

## Development

### File Structure

```
frontend/src/components/
├── GeminiLiveDirect.js      # Main Live API component
├── GeminiLiveDirect.css     # Styling
└── [other components...]    # Regular chat components

backend/app/api/
├── analytics_routes.py      # Analytics endpoints
└── [other routes...]        # Regular API routes
```

### Adding Features

1. **New Analytics**: Add endpoints to `analytics_routes.py`
2. **UI Improvements**: Modify `GeminiLiveDirect.js` and CSS
3. **Audio Processing**: Enhance audio handling in component
4. **Error Handling**: Improve error messages and recovery

## Performance Notes

- **Frame Rate**: Video sent at 1 FPS to avoid overwhelming
- **Audio Chunks**: Sent every 1 second for real-time feel
- **Connection Management**: Automatic cleanup on disconnect
- **Memory Usage**: Efficient blob handling and cleanup

## Security Considerations

- **API Key**: Store securely, never commit to version control
- **HTTPS**: Required for camera/microphone in production
- **CORS**: Backend properly configured for frontend domain
- **Rate Limiting**: Consider implementing if needed

## Future Enhancements

- [ ] Voice Activity Detection (VAD)
- [ ] Improved audio quality (higher sample rates)
- [ ] Screen sharing support
- [ ] Session recording/playback
- [ ] Multi-user sessions
- [ ] Advanced analytics dashboard

## 🆕 2025 Gemini-Style UI Redesign

The Gemini Live Direct interface now features a complete Gemini-inspired UI overhaul:
- **Pill-shaped message input** with SVG icons and modern action buttons
- **Gemini-style sidebar** with active chat highlighting and provider/API key controls at the bottom
- **Start Live** button is now in the input area for intuitive access
- **Custom CSS** (no Bootstrap) for a clean, modern, and mobile-first look
- **Fully mobile-responsive** with touch-friendly controls and smooth animations

This redesign closely matches the look and feel of Google Gemini's official interface, providing a more intuitive and visually appealing user experience. 