"""
Flask Routes for Live API Integration
====================================

These routes show how to integrate Google AI Studio Live API
into your existing Flask application for camera/microphone streaming.
"""

import asyncio
import json
import logging
from flask import Blueprint, request, jsonify, Response
from flask_socketio import emit, disconnect
from app.services.live_api_service import LiveAPIService, LiveAPIConfig

logger = logging.getLogger(__name__)

# Create blueprint for Live API routes
live_api_bp = Blueprint('live_api', __name__, url_prefix='/api/live')

# Store active sessions (in production, use Redis or similar)
active_sessions = {}

@live_api_bp.route('/start-session', methods=['POST'])
def start_live_session():
    """
    Start a new Live API session for camera/microphone streaming
    
    POST /api/live/start-session
    {
        "session_type": "camera",  // "camera", "microphone", "text"
        "voice_name": "Aoede",     // optional
        "language": "en-US",       // optional
        "system_instruction": "..."  // optional
    }
    """
    try:
        data = request.get_json() or {}
        session_type = data.get('session_type', 'camera')
        
        # Configure session based on type
        if session_type == 'camera':
            config = LiveAPIConfig(
                response_modalities=[Modality.AUDIO],
                enable_camera=True,
                enable_microphone=True,
                voice_name=data.get('voice_name', 'Aoede'),
                language_code=data.get('language', 'en-US'),
                system_instruction=data.get('system_instruction', 
                    "You can see the user through their camera and hear them through their microphone. "
                    "Respond naturally and helpfully to what you observe.")
            )
        elif session_type == 'microphone':
            config = LiveAPIConfig(
                response_modalities=[Modality.AUDIO],
                enable_camera=False,
                enable_microphone=True,
                voice_name=data.get('voice_name', 'Aoede'),
                language_code=data.get('language', 'en-US'),
                system_instruction=data.get('system_instruction',
                    "You can hear the user through their microphone. Respond naturally to what they say.")
            )
        else:  # text
            config = LiveAPIConfig(
                response_modalities=[Modality.TEXT],
                enable_camera=False,
                enable_microphone=False,
                system_instruction=data.get('system_instruction', "You are a helpful assistant.")
            )
        
        # Create session ID
        session_id = f"session_{len(active_sessions) + 1}"
        
        # Store session config (actual session will be created when WebSocket connects)
        active_sessions[session_id] = {
            'config': config,
            'status': 'created',
            'session': None
        }
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'config': {
                'session_type': session_type,
                'voice_name': config.voice_name,
                'language': config.language_code,
                'camera_enabled': config.enable_camera,
                'microphone_enabled': config.enable_microphone
            }
        })
        
    except Exception as e:
        logger.error(f"Error starting Live API session: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@live_api_bp.route('/session/<session_id>/status', methods=['GET'])
def get_session_status(session_id):
    """Get status of a Live API session"""
    session_info = active_sessions.get(session_id)
    if not session_info:
        return jsonify({'success': False, 'error': 'Session not found'}), 404
    
    return jsonify({
        'success': True,
        'session_id': session_id,
        'status': session_info['status'],
        'config': {
            'camera_enabled': session_info['config'].enable_camera,
            'microphone_enabled': session_info['config'].enable_microphone,
            'voice_name': session_info['config'].voice_name
        }
    })

@live_api_bp.route('/session/<session_id>/end', methods=['POST'])
def end_live_session(session_id):
    """End a Live API session"""
    try:
        session_info = active_sessions.get(session_id)
        if not session_info:
            return jsonify({'success': False, 'error': 'Session not found'}), 404
        
        # Close the session if it's active
        if session_info.get('session'):
            # In a real implementation, you'd properly close the async session
            # This is a simplified example
            session_info['status'] = 'ended'
        
        # Remove from active sessions
        del active_sessions[session_id]
        
        return jsonify({'success': True, 'session_id': session_id})
        
    except Exception as e:
        logger.error(f"Error ending Live API session: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# WebSocket events for real-time communication
def init_socketio_events(socketio):
    """Initialize SocketIO events for Live API"""
    
    @socketio.on('join_live_session')
    def handle_join_session(data):
        """Client joins a Live API session"""
        session_id = data.get('session_id')
        session_info = active_sessions.get(session_id)
        
        if not session_info:
            emit('error', {'message': 'Session not found'})
            return
        
        # In a real implementation, you'd start the actual Live API session here
        # and handle the async communication properly
        emit('session_joined', {
            'session_id': session_id,
            'config': {
                'camera_enabled': session_info['config'].enable_camera,
                'microphone_enabled': session_info['config'].enable_microphone
            }
        })
    
    @socketio.on('send_audio')
    def handle_audio_data(data):
        """Handle audio data from client microphone"""
        session_id = data.get('session_id')
        audio_data = data.get('audio_data')  # Base64 encoded audio
        
        # In real implementation:
        # 1. Decode base64 audio data
        # 2. Send to Live API session
        # 3. Emit responses back to client
        
        emit('audio_received', {'status': 'processing'})
    
    @socketio.on('send_video_frame') 
    def handle_video_frame(data):
        """Handle video frame from client camera"""
        session_id = data.get('session_id')
        frame_data = data.get('frame_data')  # Base64 encoded image
        
        # In real implementation:
        # 1. Decode base64 image data
        # 2. Send to Live API session
        # 3. Emit responses back to client
        
        emit('frame_received', {'status': 'processing'})
    
    @socketio.on('send_text')
    def handle_text_message(data):
        """Handle text message from client"""
        session_id = data.get('session_id')
        message = data.get('message')
        
        # In real implementation:
        # 1. Send text to Live API session
        # 2. Emit response back to client
        
        emit('text_response', {
            'message': f"Echo: {message}",
            'session_id': session_id
        })

# Example frontend JavaScript integration
FRONTEND_EXAMPLE = """
// Frontend JavaScript Example
// ===========================

class LiveAPIClient {
    constructor() {
        this.socket = io();
        this.sessionId = null;
        this.mediaStream = null;
    }
    
    async startCameraSession() {
        // 1. Start session
        const response = await fetch('/api/live/start-session', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                session_type: 'camera',
                voice_name: 'Aoede',
                language: 'en-US'
            })
        });
        
        const result = await response.json();
        if (result.success) {
            this.sessionId = result.session_id;
            
            // 2. Join session via WebSocket
            this.socket.emit('join_live_session', {
                session_id: this.sessionId
            });
            
            // 3. Start camera and microphone
            await this.startMedia();
        }
    }
    
    async startMedia() {
        // Get camera and microphone access
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        // Display video
        const videoElement = document.getElementById('video');
        videoElement.srcObject = this.mediaStream;
        
        // Start sending video frames
        this.startVideoCapture();
        
        // Start sending audio
        this.startAudioCapture();
    }
    
    startVideoCapture() {
        const video = document.getElementById('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        setInterval(() => {
            if (video.videoWidth > 0) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0);
                
                // Convert to base64 and send
                const frameData = canvas.toDataURL('image/jpeg', 0.8);
                this.socket.emit('send_video_frame', {
                    session_id: this.sessionId,
                    frame_data: frameData
                });
            }
        }, 1000); // Send frame every second
    }
    
    startAudioCapture() {
        // Implement audio capture using Web Audio API
        // Send audio chunks to Live API
    }
}

// Usage
const liveClient = new LiveAPIClient();
document.getElementById('start-button').onclick = () => {
    liveClient.startCameraSession();
};
"""

@live_api_bp.route('/example')
def get_frontend_example():
    """Get frontend integration example"""
    return Response(FRONTEND_EXAMPLE, mimetype='text/plain') 