"""
Live API Service for Camera and Microphone Streaming
===================================================

This service uses Google AI Studio API for Live API capabilities
while maintaining the existing Vertex AI setup for other features.

Usage:
    from app.services.live_api_service import LiveAPIService
    
    live_service = LiveAPIService()
    session = await live_service.start_camera_session()
"""

import os
import asyncio
import logging
from typing import Optional, Dict, Any, AsyncGenerator
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class LiveAPIConfig:
    """Configuration for Live API sessions"""
    response_modalities: list = None
    system_instruction: Optional[str] = None
    enable_camera: bool = True
    enable_microphone: bool = True
    voice_name: str = "Aoede"
    language_code: str = "en-US"

class LiveAPIService:
    """Service for Google AI Studio Live API integration"""
    
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError(
                "GEMINI_API_KEY environment variable is required. "
                "Get it from https://aistudio.google.com/apikey"
            )
        
        # Initialize the client (lazy loading)
        self._client = None
    
    @property
    def client(self):
        """Lazy-loaded Google AI Studio client"""
        if self._client is None:
            try:
                from google import genai
                self._client = genai.Client(api_key=self.api_key)
                logger.info("Google AI Studio client initialized")
            except ImportError:
                raise ImportError("google-genai package is required for Live API")
        return self._client
    
    async def start_camera_session(self, config: LiveAPIConfig = None) -> "LiveSession":
        """
        Start a Live API session with camera and microphone support
        
        Args:
            config: Optional configuration for the session
            
        Returns:
            LiveSession: Active session for camera/microphone streaming
        """
        if config is None:
            config = LiveAPIConfig()
        
        try:
            from google.genai.types import (
                LiveConnectConfig,
                Modality,
                SpeechConfig,
                VoiceConfig,
                PrebuiltVoiceConfig,
            )
            
            # Configure for camera and microphone
            live_config = LiveConnectConfig(
                response_modalities=config.response_modalities or [Modality.AUDIO],
                system_instruction=config.system_instruction or 
                    "You are a helpful assistant that can see through the user's camera and hear through their microphone. "
                    "Respond naturally to what you see and hear.",
                speech_config=SpeechConfig(
                    voice_config=VoiceConfig(
                        prebuilt_voice_config=PrebuiltVoiceConfig(
                            voice_name=config.voice_name
                        )
                    ),
                    language_code=config.language_code,
                ) if Modality.AUDIO in (config.response_modalities or []) else None,
                # Enable audio input transcription
                input_audio_transcription={} if config.enable_microphone else None,
            )
            
            # Connect to Live API
            session = await self.client.aio.live.connect(
                model="gemini-2.0-flash-live-001",  # Google AI Studio model
                config=live_config
            )
            
            logger.info("Live API session started with camera and microphone support")
            return LiveSession(session, config)
            
        except Exception as e:
            logger.error(f"Failed to start Live API session: {e}")
            raise

    async def start_text_session(self, system_instruction: str = None) -> "LiveSession":
        """
        Start a text-only Live API session (for testing)
        
        Args:
            system_instruction: Optional system instruction
            
        Returns:
            LiveSession: Active session for text communication
        """
        config = LiveAPIConfig(
            response_modalities=[Modality.TEXT],
            system_instruction=system_instruction,
            enable_camera=False,
            enable_microphone=False
        )
        
        from google.genai.types import LiveConnectConfig, Modality
        
        live_config = LiveConnectConfig(
            response_modalities=[Modality.TEXT],
            system_instruction=system_instruction or "You are a helpful assistant."
        )
        
        session = await self.client.aio.live.connect(
            model="gemini-2.0-flash-live-001",
            config=live_config
        )
        
        return LiveSession(session, config)

class LiveSession:
    """Wrapper for Live API session with helper methods"""
    
    def __init__(self, session, config: LiveAPIConfig):
        self.session = session
        self.config = config
        self.is_active = True
    
    async def send_audio(self, audio_bytes: bytes, sample_rate: int = 16000):
        """Send audio data (from microphone)"""
        if not self.config.enable_microphone:
            raise ValueError("Microphone is not enabled for this session")
        
        from google.genai.types import Blob
        
        await self.session.send_realtime_input(
            audio=Blob(
                data=audio_bytes, 
                mime_type=f"audio/pcm;rate={sample_rate}"
            )
        )
    
    async def send_video_frame(self, frame_bytes: bytes, mime_type: str = "image/jpeg"):
        """Send video frame (from camera)"""
        if not self.config.enable_camera:
            raise ValueError("Camera is not enabled for this session")
        
        from google.genai.types import Blob
        
        await self.session.send_realtime_input(
            video=Blob(data=frame_bytes, mime_type=mime_type)
        )
    
    async def send_text(self, text: str):
        """Send text message"""
        from google.genai.types import Content, Part
        
        await self.session.send_client_content(
            turns=Content(role="user", parts=[Part(text=text)]),
            turn_complete=True
        )
    
    async def receive_responses(self) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Receive responses from the Live API
        
        Yields:
            Dict with response data including text, audio, transcriptions
        """
        try:
            async for message in self.session.receive():
                response_data = {}
                
                # Text response
                if message.text:
                    response_data["text"] = message.text
                
                # Audio response
                if hasattr(message, 'data') and message.data:
                    response_data["audio"] = message.data
                
                # Transcriptions
                if message.server_content:
                    if message.server_content.input_transcription:
                        response_data["input_transcription"] = message.server_content.input_transcription.text
                    
                    if message.server_content.output_transcription:
                        response_data["output_transcription"] = message.server_content.output_transcription.text
                    
                    # Check for interruptions
                    if message.server_content.interrupted:
                        response_data["interrupted"] = True
                
                # Function calls (if using function calling)
                if hasattr(message, 'tool_call') and message.tool_call:
                    response_data["tool_calls"] = []
                    for fc in message.tool_call.function_calls:
                        response_data["tool_calls"].append({
                            "id": fc.id,
                            "name": fc.name,
                            "args": fc.args
                        })
                
                if response_data:  # Only yield if we have data
                    yield response_data
                    
        except Exception as e:
            logger.error(f"Error receiving Live API responses: {e}")
            self.is_active = False
            raise
    
    async def close(self):
        """Close the Live API session"""
        if self.is_active:
            try:
                await self.session.close()
                self.is_active = False
                logger.info("Live API session closed")
            except Exception as e:
                logger.error(f"Error closing Live API session: {e}")
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

# Example usage functions
async def example_camera_streaming():
    """Example: Start camera and microphone streaming session"""
    service = LiveAPIService()
    
    config = LiveAPIConfig(
        response_modalities=[Modality.AUDIO],  # Respond with voice
        system_instruction="You can see the user through their camera and hear them through their microphone. Respond naturally to what you observe.",
        enable_camera=True,
        enable_microphone=True,
        voice_name="Kore",  # Choose voice
        language_code="en-US"
    )
    
    async with await service.start_camera_session(config) as session:
        # Send initial greeting
        await session.send_text("Hello! I can see and hear you now. How can I help?")
        
        # Listen for responses
        async for response in session.receive_responses():
            if response.get("text"):
                print(f"Text response: {response['text']}")
            
            if response.get("audio"):
                print("Received audio response (play this to user)")
                # In real app: play audio_data through speakers
            
            if response.get("input_transcription"):
                print(f"User said: {response['input_transcription']}")

async def example_text_only():
    """Example: Simple text communication for testing"""
    service = LiveAPIService()
    
    async with await service.start_text_session("You are a helpful assistant.") as session:
        await session.send_text("Hello! Can you help me test the Live API?")
        
        async for response in session.receive_responses():
            if response.get("text"):
                print(f"Assistant: {response['text']}")
                break  # Exit after first response

if __name__ == "__main__":
    # Test the service
    import asyncio
    asyncio.run(example_text_only()) 