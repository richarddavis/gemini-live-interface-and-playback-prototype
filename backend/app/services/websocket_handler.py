"""
WebSocket Handler for Live API Integration
=========================================

This module provides WebSocket handlers for real-time communication
between the frontend and Google Gemini Live API.
"""

import json
import logging
import os
import asyncio
from typing import Dict, Any, Optional
from flask_socketio import emit, disconnect
from ..services.live_api_service import LiveAPIService, LiveSessionConfig

logger = logging.getLogger(__name__)

class LiveAPIWebSocketHandler:
    """Handles WebSocket connections for Live API communication."""
    
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, Any]] = {}
        self.live_service: Optional[LiveAPIService] = None
    
    def get_live_service(self) -> LiveAPIService:
        """Get or create Live API service instance."""
        if not self.live_service:
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise ValueError(
                    "GEMINI_API_KEY environment variable is required. "
                    "Get it from https://aistudio.google.com/app/apikey"
                )
            self.live_service = LiveAPIService(api_key)
        return self.live_service
    
    def handle_connect(self, auth):
        """Handle new WebSocket connection."""
        try:
            logger.info(f"New WebSocket connection from {auth}")
            emit('connected', {'status': 'connected', 'message': 'WebSocket connection established'})
        except Exception as e:
            logger.error(f"Error handling WebSocket connection: {e}")
            emit('error', {'error': str(e)})
    
    def handle_disconnect(self):
        """Handle WebSocket disconnection."""
        try:
            # Clean up any active sessions for this connection
            # In a real implementation, you'd track sessions by connection ID
            logger.info("WebSocket connection closed")
        except Exception as e:
            logger.error(f"Error handling WebSocket disconnection: {e}")
    
    def handle_start_session(self, data):
        """Handle session start request."""
        try:
            # Create session configuration
            session_config = LiveSessionConfig(
                session_type=data.get('session_type', 'multimodal'),
                voice_name=data.get('voice_name', 'Aoede'),
                language_code=data.get('language_code', 'en-US'),
                system_instruction=data.get('system_instruction'),
                enable_camera=data.get('enable_camera', True),
                enable_microphone=data.get('enable_microphone', True),
                model=data.get('model', 'gemini-2.0-flash-live-001')
            )
            
            # Create session
            live_service = self.get_live_service()
            
            # Run async function
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                session_id = loop.run_until_complete(
                    live_service.create_session(session_config)
                )
                
                # Connect to session
                success = loop.run_until_complete(
                    live_service.start_session(session_id)
                )
                
                if success:
                    emit('session_started', {
                        'success': True,
                        'session_id': session_id,
                        'config': {
                            'session_type': session_config.session_type,
                            'voice_name': session_config.voice_name,
                            'language_code': session_config.language_code,
                            'enable_camera': session_config.enable_camera,
                            'enable_microphone': session_config.enable_microphone,
                            'model': session_config.model
                        }
                    })
                    
                    # Start response listener for this session
                    self._start_response_listener(session_id)
                else:
                    emit('session_error', {
                        'success': False,
                        'error': 'Failed to connect to Live API'
                    })
                    
            finally:
                loop.close()
                
        except Exception as e:
            logger.error(f"Error starting Live API session: {e}")
            emit('session_error', {'success': False, 'error': str(e)})
    
    def handle_send_text(self, data):
        """Handle text message sending."""
        try:
            session_id = data.get('session_id')
            message = data.get('message')
            
            if not session_id or not message:
                emit('text_error', {'error': 'session_id and message are required'})
                return
            
            live_service = self.get_live_service()
            
            # Send text and emit response
            async def send_and_emit():
                async for chunk in live_service.send_text_message(session_id, message):
                    emit('text_response', {
                        'session_id': session_id,
                        'text': chunk,
                        'type': 'partial'
                    })
                
                # Emit completion
                emit('text_response', {
                    'session_id': session_id,
                    'type': 'complete'
                })
            
            # Run async function
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(send_and_emit())
            finally:
                loop.close()
                
        except Exception as e:
            logger.error(f"Error sending text message: {e}")
            emit('text_error', {'error': str(e)})
    
    def handle_send_audio(self, data):
        """Handle audio data sending."""
        try:
            session_id = data.get('session_id')
            audio_data = data.get('audio_data')  # Base64 encoded
            mime_type = data.get('mime_type', 'audio/pcm;rate=16000')
            
            if not session_id or not audio_data:
                emit('audio_error', {'error': 'session_id and audio_data are required'})
                return
            
            # Decode base64 audio data
            import base64
            audio_bytes = base64.b64decode(audio_data)
            
            live_service = self.get_live_service()
            
            # Send audio
            async def send_audio():
                return await live_service.send_audio_data(session_id, audio_bytes, mime_type)
            
            # Run async function
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                success = loop.run_until_complete(send_audio())
                emit('audio_sent', {
                    'session_id': session_id,
                    'success': success
                })
            finally:
                loop.close()
                
        except Exception as e:
            logger.error(f"Error sending audio data: {e}")
            emit('audio_error', {'error': str(e)})
    
    def handle_send_video(self, data):
        """Handle video frame sending."""
        try:
            session_id = data.get('session_id')
            frame_data = data.get('frame_data')  # Base64 encoded
            mime_type = data.get('mime_type', 'image/jpeg')
            
            if not session_id or not frame_data:
                emit('video_error', {'error': 'session_id and frame_data are required'})
                return
            
            # Decode base64 frame data
            import base64
            frame_bytes = base64.b64decode(frame_data)
            
            live_service = self.get_live_service()
            
            # Send video frame
            async def send_frame():
                return await live_service.send_video_frame(session_id, frame_bytes, mime_type)
            
            # Run async function
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                success = loop.run_until_complete(send_frame())
                emit('video_sent', {
                    'session_id': session_id,
                    'success': success
                })
            finally:
                loop.close()
                
        except Exception as e:
            logger.error(f"Error sending video frame: {e}")
            emit('video_error', {'error': str(e)})
    
    def handle_end_session(self, data):
        """Handle session end request."""
        try:
            session_id = data.get('session_id')
            
            if not session_id:
                emit('session_error', {'error': 'session_id is required'})
                return
            
            live_service = self.get_live_service()
            
            # End session
            async def end_session():
                return await live_service.end_session(session_id)
            
            # Run async function
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                success = loop.run_until_complete(end_session())
                emit('session_ended', {
                    'session_id': session_id,
                    'success': success
                })
            finally:
                loop.close()
                
        except Exception as e:
            logger.error(f"Error ending session: {e}")
            emit('session_error', {'error': str(e)})
    
    def _start_response_listener(self, session_id: str):
        """Start listening for responses from Live API."""
        # Note: This is a simplified approach. In production, you'd want
        # to handle this with proper async/threading to avoid blocking
        try:
            live_service = self.get_live_service()
            
            # Start audio response listener in a separate thread
            import threading
            
            def listen_for_audio():
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    async def audio_listener():
                        async for audio_chunk in live_service.receive_audio_stream(session_id):
                            # Encode audio data as base64 for transmission
                            import base64
                            audio_b64 = base64.b64encode(audio_chunk).decode('utf-8')
                            emit('audio_response', {
                                'session_id': session_id,
                                'audio_data': audio_b64,
                                'mime_type': 'audio/pcm;rate=24000'
                            })
                    
                    loop.run_until_complete(audio_listener())
                except Exception as e:
                    logger.error(f"Error in audio listener: {e}")
                finally:
                    loop.close()
            
            # Start listener thread
            thread = threading.Thread(target=listen_for_audio, daemon=True)
            thread.start()
            
        except Exception as e:
            logger.error(f"Error starting response listener: {e}")

# Global handler instance
live_ws_handler = LiveAPIWebSocketHandler()

# WebSocket event handlers
def register_websocket_handlers(socketio):
    """Register WebSocket event handlers with SocketIO."""
    
    @socketio.on('connect')
    def handle_connect(auth):
        live_ws_handler.handle_connect(auth)
    
    @socketio.on('disconnect')
    def handle_disconnect():
        live_ws_handler.handle_disconnect()
    
    @socketio.on('start_session')
    def handle_start_session(data):
        live_ws_handler.handle_start_session(data)
    
    @socketio.on('send_text')
    def handle_send_text(data):
        live_ws_handler.handle_send_text(data)
    
    @socketio.on('send_audio')
    def handle_send_audio(data):
        live_ws_handler.handle_send_audio(data)
    
    @socketio.on('send_video')
    def handle_send_video(data):
        live_ws_handler.handle_send_video(data)
    
    @socketio.on('end_session')
    def handle_end_session(data):
        live_ws_handler.handle_end_session(data) 