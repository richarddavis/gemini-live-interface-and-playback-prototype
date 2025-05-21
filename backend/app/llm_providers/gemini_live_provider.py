import google.genai as genai
import asyncio
import os
import base64
from google.genai.types import (
    Content, 
    Part, 
    LiveConnectConfig, 
    Modality, 
    SpeechConfig,
    VoiceConfig,
    PrebuiltVoiceConfig
)
from flask import current_app
from .base import LLMProvider
import json
import numpy as np
import io
import requests
import logging
from flask_socketio import Namespace

logger = logging.getLogger(__name__)

class GeminiLiveProvider(Namespace):
    """
    Provider for Gemini Live API with support for:
    - Bidirectional WebSocket communication
    - Audio input and output
    - Video input
    - Text transcription
    - Voice selection
    """
    MODEL_NAME = "gemini-2.0-flash-live-preview-04-09"
    
    # Available voices for audio responses
    AVAILABLE_VOICES = [
        "Aoede", "Puck", "Charon", "Kore", 
        "Fenrir", "Leda", "Orus", "Zephyr"
    ]
    
    # Default voice
    DEFAULT_VOICE = "Puck"
    
    def __init__(self, namespace=None):
        super(GeminiLiveProvider, self).__init__(namespace)
        self.client = None
        self._configure_client()

    def _configure_client(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables.")
        self.client = genai.GenerativeModel(
            model_name="gemini-1.5-pro", # Or gemini-1.5-flash, etc.
        )
        genai.configure(api_key=api_key) # Configure API key for the genai module

    def _fetch_media_content(self, url, media_type):
        """Download media content from URL and return it in the format Gemini expects"""
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            
            # Return binary content with its mime type
            return {
                "mime_type": media_type,
                "data": response.content
            }
        except Exception as e:
            current_app.logger.error(f"Error fetching media from {url}: {str(e)}")
            raise

    def _convert_audio_format(self, audio_data, original_mime_type):
        """
        Convert audio to the format required by Gemini Live API:
        - 16kHz sample rate
        - 16-bit PCM
        - Little-endian
        - Mono channel
        
        Returns raw PCM audio data
        """
        try:
            # Real implementation would need proper audio conversion
            # For now, we'll just pass through and assume correct format
            return audio_data
        except Exception as e:
            current_app.logger.error(f"Error converting audio: {str(e)}")
            return None

    def _prepare_live_config(self, session_id):
        # Simplified configuration
        return LiveConnectConfig(
            model="gemini-1.5-pro", # Ensure this matches the model used for the client or is compatible
            speech_input_config=LiveConnectConfig.SpeechInputConfig(audio_encoding="linear16"),
        )

    async def handle_websocket_connection(self, sid, environ):
        current_app.logger.info(f"Gemini Live WebSocket connection opened for session: {sid}")
        live_config = self._prepare_live_config(sid)
        
        try:
            async with self.client.aio.live_connect(config=live_config) as session:
                current_app.logger.info(f"Gemini Live session started for {sid}. Session ID: {session.session_id}")
                self.emit('session_started', {'sessionId': session.session_id, 'sid': sid}, room=sid)

                while True:
                    # This part will be further developed to handle client messages (text, audio)
                    # For now, it just keeps the connection open and logs received messages from client
                    message = await asyncio.to_thread(self.socketio.receive, sid=sid, namespace=self.namespace)
                    if message is None: # Client disconnected
                        current_app.logger.info(f"Client {sid} disconnected or sent None message.")
                        break
                    
                    current_app.logger.info(f"Received message from client {sid}: {message}")

                    # Example: Sending text to Gemini (adapt based on actual client message structure)
                    if isinstance(message, dict) and 'text' in message:
                        await session.send_client_content(message['text'])
                        current_app.logger.info(f"Sent text to Gemini from {sid}: {message['text']}")
                    elif isinstance(message, dict) and 'audio_chunk' in message: # Assuming client sends audio this way
                        pass # Placeholder for audio handling

                    # Process responses from Gemini
                    async for response_chunk in session.responses:
                        if response_chunk.text:
                            current_app.logger.info(f"Received text from Gemini for {sid}: {response_chunk.text}")
                            self.emit('llm_response', {'text': response_chunk.text, 'sid': sid}, room=sid)

        except asyncio.CancelledError:
            current_app.logger.info(f"Gemini Live session for {sid} was cancelled.")
        except Exception as e:
            current_app.logger.error(f"Error in Gemini Live session for {sid}: {e}", exc_info=True)
            self.emit('error', {'error': str(e), 'sid': sid}, room=sid)
        finally:
            current_app.logger.info(f"Gemini Live WebSocket connection closed for session: {sid}")

    def on_connect(self, sid, environ):
        current_app.logger.info(f"Client connected to GeminiLiveProvider: {sid}")
        # It might be better to start the async task here or ensure it's started safely
        asyncio.create_task(self.handle_websocket_connection(sid, environ))

    def on_disconnect(self, sid):
        current_app.logger.info(f"Client disconnected from GeminiLiveProvider: {sid}")
        # Add any cleanup logic here if needed, e.g., explicitly closing the Gemini session if it's managed outside handle_websocket_connection

    def on_client_message(self, sid, data):
        # This is a standard SocketIO event handler. 
        # The actual message processing logic for Gemini is within handle_websocket_connection.
        # We might pass data from here to the running handle_websocket_connection task if needed,
        # but the current structure uses socketio.receive directly in the async loop.
        current_app.logger.info(f"GeminiLiveProvider received client_message from {sid}: {data}")
        # Example: If you want to bridge this to the async handler, you might use an asyncio.Queue
        # For now, this is just a log point.

    async def _get_live_response(self, messages, api_key, **kwargs):
        """Simple synchronous text response for compatibility"""
        client = self._configure_client(api_key)
        
        # Configure for text-only responses
        config = LiveConnectConfig(
            response_modalities=[Modality.TEXT],
        )
        
        try:
            # Process the last user message
            last_message = next((m for m in reversed(messages) if m.get('sender') == 'user'), None)
            
            if not last_message:
                return "No user message found to process."
            
            # Prepare the message parts
            parts = []
            if last_message.get('text'):
                parts.append(Part(text=last_message['text']))
            
            if last_message.get('media_url') and last_message.get('media_type'):
                media_content = self._fetch_media_content(
                    last_message['media_url'], 
                    last_message['media_type']
                )
                parts.append(Part(inline_data=media_content))
            
            # Connect to the API and get response
            async with client.aio.live.connect(
                model=self.MODEL_NAME,
                config=config,
            ) as session:
                await session.send_client_content(
                    turns=Content(role="user", parts=parts),
                    turn_complete=True
                )
                
                # Collect response
                full_response = []
                async for message in session.receive():
                    if message.text:
                        full_response.append(message.text)
                
                return "".join(full_response)
                
        except Exception as e:
            current_app.logger.error(f"Gemini Live API error: {str(e)}")
            return f"Error communicating with Gemini Live API: {str(e)}"
    
    def stream_response(self, messages, api_key, **kwargs):
        """Regular streaming API method (for compatibility)"""
        async def run_async():
            client = self._configure_client(api_key)
            
            config = LiveConnectConfig(
                response_modalities=[Modality.TEXT],
            )
            
            try:
                # Process the last user message
                last_message = next((m for m in reversed(messages) if m.get('sender') == 'user'), None)
                
                if not last_message:
                    yield "No user message found to process."
                    return
                
                # Prepare the message parts
                parts = []
                if last_message.get('text'):
                    parts.append(Part(text=last_message['text']))
                
                if last_message.get('media_url') and last_message.get('media_type'):
                    media_content = self._fetch_media_content(
                        last_message['media_url'], 
                        last_message['media_type']
                    )
                    parts.append(Part(inline_data=media_content))
                
                # Connect to the API and stream response
                async with client.aio.live.connect(
                    model=self.MODEL_NAME,
                    config=config,
                ) as session:
                    await session.send_client_content(
                        turns=Content(role="user", parts=parts),
                        turn_complete=True
                    )
                    
                    # Stream response chunks
                    async for message in session.receive():
                        if message.text:
                            yield message.text
                    
            except Exception as e:
                current_app.logger.error(f"Gemini Live API streaming error: {str(e)}")
                yield f"Error streaming from Gemini Live API: {str(e)}"
        
        # Use asyncio to run the async generator in a synchronous context
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            for chunk in asyncio.run(self._adapter(run_async())):
                yield chunk
        finally:
            loop.close()
            
    async def _adapter(self, async_gen):
        """Helper to convert async generator to sync generator"""
        async for item in async_gen:
            yield item 