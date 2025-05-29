"""
Flask Routes for Live API Integration
====================================

These routes show how to integrate Google AI Studio Live API
into your existing Flask application for camera/microphone streaming.
"""

import json
import logging
from flask import Blueprint
from flask import request, jsonify, Response

logger = logging.getLogger(__name__)

# Create blueprint for Live API routes
live_api_bp = Blueprint('live_api', __name__, url_prefix='/live')

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
        
        # Create session configuration
        config = {
            'session_type': session_type,
            'voice_name': data.get('voice_name', 'Aoede'),
            'language_code': data.get('language', 'en-US'),
            'system_instruction': data.get('system_instruction', 
                "You can see the user through their camera and hear them through their microphone. "
                "Respond naturally and helpfully to what you observe."),
            'enable_camera': session_type in ['camera'],
            'enable_microphone': session_type in ['camera', 'microphone'],
            'response_modalities': ['AUDIO'] if session_type != 'text' else ['TEXT']
        }
        
        # Create session ID
        session_id = f"session_{len(active_sessions) + 1}_{hash(str(data))}"
        
        # Store session config
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
                'voice_name': config['voice_name'],
                'language': config['language_code'],
                'camera_enabled': config['enable_camera'],
                'microphone_enabled': config['enable_microphone']
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
            'camera_enabled': session_info['config']['enable_camera'],
            'microphone_enabled': session_info['config']['enable_microphone'],
            'voice_name': session_info['config']['voice_name']
        }
    })

@live_api_bp.route('/session/<session_id>/end', methods=['POST'])
def end_live_session(session_id):
    """End a Live API session"""
    try:
        session_info = active_sessions.get(session_id)
        if not session_info:
            return jsonify({'success': False, 'error': 'Session not found'}), 404
        
        # Mark session as ended
        session_info['status'] = 'ended'
        
        # Remove from active sessions
        del active_sessions[session_id]
        
        return jsonify({'success': True, 'session_id': session_id})
        
    except Exception as e:
        logger.error(f"Error ending Live API session: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@live_api_bp.route('/sessions', methods=['GET'])
def list_sessions():
    """List all active sessions"""
    return jsonify({
        'success': True,
        'sessions': [
            {
                'session_id': sid,
                'status': info['status'],
                'config': info['config']
            }
            for sid, info in active_sessions.items()
        ]
    })

@live_api_bp.route('/health', methods=['GET'])
def live_api_health():
    """Health check for Live API service"""
    return jsonify({
        'success': True,
        'service': 'Live API',
        'status': 'healthy',
        'active_sessions': len(active_sessions)
    })

@live_api_bp.route('/send-message', methods=['POST'])
def send_message():
    """
    Send a message through the Live API session
    
    POST /api/live/send-message
    {
        "session_id": "session_123",
        "message": "Hello, how are you?"
    }
    """
    try:
        data = request.get_json() or {}
        session_id = data.get('session_id')
        message = data.get('message', '')
        
        if not session_id or not message:
            return jsonify({'success': False, 'error': 'session_id and message are required'}), 400
            
        session_info = active_sessions.get(session_id)
        if not session_info:
            return jsonify({'success': False, 'error': 'Session not found'}), 404
        
        # TODO: Integrate with actual Google Live API here
        # For now, return a simulated response
        ai_response = f"🤖 I received your message: '{message}'. Live API integration working! Add Google Live API connection here."
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'response': ai_response,
            'message_received': message
        })
        
    except Exception as e:
        logger.error(f"Error sending message: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# Example frontend JavaScript integration
FRONTEND_EXAMPLE = """
// Frontend JavaScript Example for Live API Integration
// ===================================================

class LiveAPIClient {
    constructor() {
        this.sessionId = null;
        this.mediaStream = null;
        this.apiUrl = '/api/live';
    }
    
    async startCameraSession() {
        try {
            // 1. Start session
            const response = await fetch(`${this.apiUrl}/start-session`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    session_type: 'camera',
                    voice_name: 'Aoede',
                    language: 'en-US',
                    system_instruction: 'You are a helpful AI assistant that can see and hear.'
                })
            });
            
            const result = await response.json();
            if (result.success) {
                this.sessionId = result.session_id;
                console.log('Session started:', this.sessionId);
                
                // 2. Start camera and microphone
                await this.startMedia();
                
                return result;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error starting session:', error);
            throw error;
        }
    }
    
    async startMedia() {
        try {
            // Get camera and microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            // Display video in a video element
            const videoElement = document.getElementById('camera-feed');
            if (videoElement) {
                videoElement.srcObject = this.mediaStream;
            }
            
            console.log('Media stream started');
            return this.mediaStream;
            
        } catch (error) {
            console.error('Error accessing media:', error);
            throw error;
        }
    }
    
    async endSession() {
        if (this.sessionId) {
            try {
                const response = await fetch(`${this.apiUrl}/session/${this.sessionId}/end`, {
                    method: 'POST'
                });
                
                const result = await response.json();
                
                // Stop media streams
                if (this.mediaStream) {
                    this.mediaStream.getTracks().forEach(track => track.stop());
                    this.mediaStream = null;
                }
                
                this.sessionId = null;
                console.log('Session ended');
                return result;
                
            } catch (error) {
                console.error('Error ending session:', error);
                throw error;
            }
        }
    }
    
    async getSessionStatus() {
        if (this.sessionId) {
            const response = await fetch(`${this.apiUrl}/session/${this.sessionId}/status`);
            return await response.json();
        }
        return null;
    }
}

// Usage Example:
// const liveClient = new LiveAPIClient();
// 
// // Start session
// document.getElementById('start-btn').onclick = async () => {
//     try {
//         await liveClient.startCameraSession();
//         console.log('Live AI session active!');
//     } catch (error) {
//         console.error('Failed to start session:', error);
//     }
// };
// 
// // End session
// document.getElementById('end-btn').onclick = async () => {
//     await liveClient.endSession();
// };
"""

@live_api_bp.route('/example')
def get_frontend_example():
    """Get frontend integration example"""
    return Response(FRONTEND_EXAMPLE, mimetype='text/plain') 