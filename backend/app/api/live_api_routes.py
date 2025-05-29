"""
Flask Routes for Live API Integration
====================================

These routes provide real-time audio/video streaming capabilities
using the Google Gemini Live API and GenAI SDK.
"""

import json
import logging
import os
import asyncio
import base64
from flask import Blueprint, request, jsonify, Response, stream_template
from typing import Dict, Any

from ..services.live_api_service import LiveAPIService, LiveSessionConfig

logger = logging.getLogger(__name__)

# Create blueprint for Live API routes
live_api_bp = Blueprint('live_api', __name__, url_prefix='/live')

# Initialize the Live API service
def get_live_api_service() -> LiveAPIService:
    """Get Live API service instance with API key."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError(
            "GEMINI_API_KEY environment variable is required. "
            "Get it from https://aistudio.google.com/app/apikey"
        )
    return LiveAPIService(api_key)

def run_async(coro):
    """Helper to run async functions in Flask context."""
    try:
        # Try to get existing event loop
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If loop is running, create a new thread
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, coro)
                return future.result()
        else:
            return loop.run_until_complete(coro)
    except RuntimeError:
        # No event loop in current thread
        return asyncio.run(coro)

@live_api_bp.route('/text-conversation', methods=['POST'])
def text_conversation():
    """Start a simple text conversation with the Live API."""
    try:
        data = request.get_json()
        message = data.get('message', 'Hello!')
        
        service = get_live_api_service()
        
        # Create async function to handle the conversation
        async def handle_conversation():
            try:
                # Use the simple conversation method
                response_text = await service.create_simple_text_conversation(
                    message=message,
                    voice=data.get('voice', 'Puck'),
                    model=data.get('model', 'gemini-2.0-flash-live-001')
                )
                
                return {
                    "success": True,
                    "message": message,
                    "response": response_text,
                }
            except Exception as e:
                logger.error(f"Error in conversation: {e}")
                return {
                    "success": False,
                    "error": str(e)
                }
        
        # Run the async conversation
        result = run_async(handle_conversation())
        
        if result.get("success"):
            return jsonify(result)
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"Error in text conversation: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@live_api_bp.route('/audio-conversation', methods=['POST'])
def audio_conversation():
    """
    Have an audio conversation with Live API
    
    POST /api/live/audio-conversation
    Content-Type: application/json
    {
        "audio_data": "base64_encoded_audio_data",
        "voice_name": "Aoede",           // optional
        "language": "en-US",             // optional
        "system_instruction": "...",     // optional
        "model": "gemini-2.0-flash-live-001"  // optional
    }
    """
    try:
        data = request.get_json() or {}
        audio_data_b64 = data.get('audio_data')
        
        if not audio_data_b64:
            return jsonify({'success': False, 'error': 'Audio data is required'}), 400
        
        # Decode base64 audio data
        try:
            audio_data = base64.b64decode(audio_data_b64)
        except Exception as e:
            return jsonify({'success': False, 'error': 'Invalid base64 audio data'}), 400
        
        # Create session configuration
        session_config = LiveSessionConfig(
            session_type="audio",
            voice_name=data.get('voice_name', 'Aoede'),
            language_code=data.get('language', 'en-US'),
            system_instruction=data.get('system_instruction'),
            model=data.get('model', 'gemini-2.0-flash-live-001')
        )
        
        live_service = get_live_api_service()
        
        def generate():
            try:
                async def get_response():
                    audio_chunks = []
                    async for audio_chunk in live_service.audio_conversation(audio_data, session_config):
                        if audio_chunk:
                            # Convert audio bytes to base64 for JSON response
                            audio_b64 = base64.b64encode(audio_chunk).decode('utf-8')
                            yield f"data: {json.dumps({'audio': audio_b64})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                
                for chunk in run_async(get_response()):
                    yield chunk
                    
            except Exception as e:
                logger.error(f"Error in audio conversation: {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        return Response(generate(), mimetype='text/plain')
        
    except Exception as e:
        logger.error(f"Error in audio conversation endpoint: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@live_api_bp.route('/text-to-audio', methods=['POST'])
def text_to_audio():
    """
    Send text and receive audio response
    
    POST /api/live/text-to-audio
    {
        "message": "Hello, how are you?",
        "voice_name": "Aoede",           // optional
        "language": "en-US",             // optional
        "system_instruction": "...",     // optional
        "model": "gemini-2.0-flash-live-001"  // optional
    }
    """
    try:
        data = request.get_json() or {}
        message = data.get('message')
        
        if not message:
            return jsonify({'success': False, 'error': 'Message is required'}), 400
        
        # Create session configuration for audio response
        session_config = LiveSessionConfig(
            session_type="audio",
            voice_name=data.get('voice_name', 'Aoede'),
            language_code=data.get('language', 'en-US'),
            system_instruction=data.get('system_instruction'),
            model=data.get('model', 'gemini-2.0-flash-live-001')
        )
        session_config.response_modalities = ["AUDIO"]
        
        live_service = get_live_api_service()
        
        def generate():
            try:
                async def get_response():
                    async for audio_chunk in live_service.text_to_audio(message, session_config):
                        if audio_chunk:
                            # Convert audio bytes to base64 for JSON response
                            audio_b64 = base64.b64encode(audio_chunk).decode('utf-8')
                            yield f"data: {json.dumps({'audio': audio_b64})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                
                for chunk in run_async(get_response()):
                    yield chunk
                    
            except Exception as e:
                logger.error(f"Error in text-to-audio: {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        return Response(generate(), mimetype='text/plain')
        
    except Exception as e:
        logger.error(f"Error in text-to-audio endpoint: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@live_api_bp.route('/audio-to-text', methods=['POST'])
def audio_to_text():
    """
    Send audio and receive text response
    
    POST /api/live/audio-to-text
    {
        "audio_data": "base64_encoded_audio_data",
        "voice_name": "Aoede",           // optional
        "language": "en-US",             // optional
        "system_instruction": "...",     // optional
        "model": "gemini-2.0-flash-live-001"  // optional
    }
    """
    try:
        data = request.get_json() or {}
        audio_data_b64 = data.get('audio_data')
        
        if not audio_data_b64:
            return jsonify({'success': False, 'error': 'Audio data is required'}), 400
        
        # Decode base64 audio data
        try:
            audio_data = base64.b64decode(audio_data_b64)
        except Exception as e:
            return jsonify({'success': False, 'error': 'Invalid base64 audio data'}), 400
        
        # Create session configuration for text response
        session_config = LiveSessionConfig(
            session_type="text",
            voice_name=data.get('voice_name', 'Aoede'),
            language_code=data.get('language', 'en-US'),
            system_instruction=data.get('system_instruction'),
            model=data.get('model', 'gemini-2.0-flash-live-001')
        )
        
        live_service = get_live_api_service()
        
        def generate():
            try:
                async def get_response():
                    async for text_chunk in live_service.audio_to_text(audio_data, session_config):
                        yield f"data: {json.dumps({'text': text_chunk})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                
                for chunk in run_async(get_response()):
                    yield chunk
                    
            except Exception as e:
                logger.error(f"Error in audio-to-text: {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        return Response(generate(), mimetype='text/plain')
        
    except Exception as e:
        logger.error(f"Error in audio-to-text endpoint: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@live_api_bp.route('/multimodal-conversation', methods=['POST'])
def multimodal_conversation():
    """
    Have a multimodal conversation (text, audio, image)
    
    POST /api/live/multimodal-conversation
    {
        "text": "What do you see in this image?",     // optional
        "audio_data": "base64_encoded_audio_data",  // optional
        "image_data": "base64_encoded_image_data",  // optional
        "response_type": "text",                    // "text" or "audio"
        "voice_name": "Aoede",                      // optional
        "language": "en-US",                        // optional
        "system_instruction": "...",                // optional
        "model": "gemini-2.0-flash-live-001"       // optional
    }
    """
    try:
        data = request.get_json() or {}
        text = data.get('text')
        audio_data_b64 = data.get('audio_data')
        image_data_b64 = data.get('image_data')
        response_type = data.get('response_type', 'text')
        
        if not any([text, audio_data_b64, image_data_b64]):
            return jsonify({'success': False, 'error': 'At least one input (text, audio, or image) is required'}), 400
        
        # Decode data if provided
        audio_data = None
        image_data = None
        
        if audio_data_b64:
            try:
                audio_data = base64.b64decode(audio_data_b64)
            except Exception as e:
                return jsonify({'success': False, 'error': 'Invalid base64 audio data'}), 400
        
        if image_data_b64:
            try:
                image_data = base64.b64decode(image_data_b64)
            except Exception as e:
                return jsonify({'success': False, 'error': 'Invalid base64 image data'}), 400
        
        # Create session configuration
        session_config = LiveSessionConfig(
            session_type="multimodal",
            voice_name=data.get('voice_name', 'Aoede'),
            language_code=data.get('language', 'en-US'),
            system_instruction=data.get('system_instruction'),
            model=data.get('model', 'gemini-2.0-flash-live-001')
        )
        
        if response_type == "audio":
            session_config.response_modalities = ["AUDIO"]
        else:
            session_config.response_modalities = ["TEXT"]
        
        live_service = get_live_api_service()
        
        def generate():
            try:
                async def get_response():
                    async for response_chunk in live_service.multimodal_conversation(
                        text=text, 
                        audio_data=audio_data, 
                        image_data=image_data, 
                        session_config=session_config
                    ):
                        if isinstance(response_chunk, str):
                            yield f"data: {json.dumps({'text': response_chunk})}\n\n"
                        elif isinstance(response_chunk, bytes):
                            # Convert audio bytes to base64
                            audio_b64 = base64.b64encode(response_chunk).decode('utf-8')
                            yield f"data: {json.dumps({'audio': audio_b64})}\n\n"
                    yield f"data: {json.dumps({'done': True})}\n\n"
                
                for chunk in run_async(get_response()):
                    yield chunk
                    
            except Exception as e:
                logger.error(f"Error in multimodal conversation: {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        return Response(generate(), mimetype='text/plain')
        
    except Exception as e:
        logger.error(f"Error in multimodal conversation endpoint: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@live_api_bp.route('/process-audio', methods=['POST'])
def process_audio():
    """
    Process audio to the format required by Live API
    
    POST /api/live/process-audio
    Content-Type: multipart/form-data with audio file
    or
    Content-Type: application/json
    {
        "audio_data": "base64_encoded_audio_data",
        "input_format": "wav"  // optional
    }
    """
    try:
        live_service = get_live_api_service()
        
        if request.content_type and 'multipart/form-data' in request.content_type:
            # Handle file upload
            if 'audio' not in request.files:
                return jsonify({'success': False, 'error': 'Audio file is required'}), 400
            
            audio_file = request.files['audio']
            if audio_file.filename == '':
                return jsonify({'success': False, 'error': 'No audio file selected'}), 400
            
            audio_data = audio_file.read()
            input_format = audio_file.filename.split('.')[-1] if '.' in audio_file.filename else 'wav'
        
        else:
            # Handle JSON data
            data = request.get_json() or {}
            audio_data_b64 = data.get('audio_data')
            
            if not audio_data_b64:
                return jsonify({'success': False, 'error': 'Audio data is required'}), 400
            
            try:
                audio_data = base64.b64decode(audio_data_b64)
            except Exception as e:
                return jsonify({'success': False, 'error': 'Invalid base64 audio data'}), 400
            
            input_format = data.get('input_format', 'wav')
        
        # Process the audio
        processed_audio = live_service.process_audio_for_live_api(audio_data, input_format)
        
        # Return processed audio as base64
        processed_b64 = base64.b64encode(processed_audio).decode('utf-8')
        
        return jsonify({
            'success': True,
            'processed_audio': processed_b64,
            'format': '16-bit PCM, 16kHz, mono',
            'size_bytes': len(processed_audio)
        })
        
    except Exception as e:
        logger.error(f"Error processing audio: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@live_api_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for Live API service."""
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        return jsonify({
            "success": True,
            "service": "Live API",
            "status": "healthy",
            "api_key_configured": bool(api_key),
            "supported_models": ["gemini-2.0-flash-live-001"],
            "available_voices": ["Aoede", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Zephyr"]
        })
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({
            "success": False,
            "service": "Live API",
            "status": "unhealthy",
            "error": str(e)
        }), 500

@live_api_bp.route('/example', methods=['GET'])
def example_usage():
    """Return example usage for the Live API endpoints."""
    examples = {
        "text_conversation": {
            "url": "/api/live/text-conversation",
            "method": "POST",
            "body": {
                "message": "Hello! Can you see me?"
            }
        },
        "create_session": {
            "url": "/api/live/create-session",
            "method": "POST",
            "body": {
                "session_type": "multimodal",
                "voice": "Puck",
                "model": "gemini-2.0-flash-live-001"
            }
        },
        "connect_session": {
            "url": "/api/live/session/{session_id}/connect",
            "method": "POST",
            "body": {}
        },
        "send_message": {
            "url": "/api/live/session/{session_id}/send-message",
            "method": "POST",
            "body": {
                "message": "Hello!"
            }
        },
        "send_audio": {
            "url": "/api/live/session/{session_id}/send-audio",
            "method": "POST",
            "body": {
                "audio_data": "base64_encoded_audio_data"
            }
        },
        "send_video": {
            "url": "/api/live/session/{session_id}/send-video",
            "method": "POST",
            "body": {
                "video_data": "base64_encoded_image_data"
            }
        }
    }
    
    return jsonify({
        "success": True,
        "service": "Live API",
        "examples": examples,
        "documentation": "See https://ai.google.dev/gemini-api/docs/live for more details"
    })

@live_api_bp.route('/test-connection', methods=['POST'])
def test_connection():
    """Test basic Live API connection."""
    try:
        data = request.get_json() or {}
        message = data.get('message', 'Hello!')
        
        async def test_live_api():
            try:
                api_key = os.getenv("GEMINI_API_KEY")
                from google import genai
                client = genai.Client(api_key=api_key)
                
                config = {
                    "response_modalities": ["TEXT"]
                }
                
                async with client.aio.live.connect(
                    model="gemini-2.0-flash-live-001",
                    config=config
                ) as session:
                    
                    await session.send_client_content(
                        turns={"role": "user", "parts": [{"text": message}]},
                        turn_complete=True
                    )
                    
                    responses = []
                    async for response in session.receive():
                        if response.text is not None:
                            responses.append(response.text)
                        if response.server_content and response.server_content.turn_complete:
                            break
                    
                    return ''.join(responses)
                    
            except Exception as e:
                logger.error(f"Error in Live API test: {e}")
                return f"Error: {e}"
        
        result = run_async(test_live_api())
        
        return jsonify({
            "success": True,
            "message": message,
            "response": result
        })
        
    except Exception as e:
        logger.error(f"Error in test connection: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# Error handlers
@live_api_bp.errorhandler(Exception)
def handle_live_api_error(error):
    """Handle Live API errors"""
    logger.error(f"Live API error: {error}")
    return jsonify({
        'success': False,
        'error': str(error),
        'service': 'Live API'
    }), 500 