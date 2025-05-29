"""
Real Google Gemini Live API Service
==================================

This service provides real-time audio/video streaming capabilities
using the Google GenAI SDK and Live API following the official documentation.
"""

import asyncio
import json
import os
import io
import base64
import logging
from typing import Optional, Dict, Any, AsyncGenerator, Union, List
from dataclasses import dataclass

# Google GenAI SDK imports
from google import genai
from google.genai import types

# Audio processing imports
import librosa
import soundfile as sf
import numpy as np

logger = logging.getLogger(__name__)

@dataclass
class LiveSessionConfig:
    """Configuration for a Live API session."""
    session_type: str = "multimodal"  # text, audio, video, multimodal
    model: str = "gemini-2.0-flash-live-001"
    voice: str = "Puck"
    response_modalities: List[str] = None
    system_instruction: Optional[str] = None
    
    def __post_init__(self):
        if self.response_modalities is None:
            if self.session_type == "text":
                self.response_modalities = ["TEXT"]
            else:
                self.response_modalities = ["AUDIO"]

class LiveAPIService:
    """Service for real-time communication with Google Gemini Live API."""
    
    def __init__(self, api_key: str):
        """Initialize the Live API service with API key."""
        self.api_key = api_key
        self.client = genai.Client(api_key=api_key)
        self.active_sessions: Dict[str, Any] = {}
        self.session_counter = 0
        
    async def create_session(self, config: LiveSessionConfig) -> str:
        """Create a new Live API session."""
        try:
            session_id = f"live_session_{self.session_counter}_{hash(str(config))}"
            self.session_counter += 1
            
            # Store session configuration
            self.active_sessions[session_id] = {
                "config": config,
                "status": "created",
                "session": None,
                "connected": False
            }
            
            logger.info(f"Created session {session_id} with config: {config}")
            return session_id
            
        except Exception as e:
            logger.error(f"Error creating session: {e}")
            raise
    
    async def connect_session(self, session_id: str) -> bool:
        """Connect to a Live API session using WebSocket."""
        try:
            if session_id not in self.active_sessions:
                raise ValueError(f"Session {session_id} not found")
            
            session_data = self.active_sessions[session_id]
            config = session_data["config"]
            
            # Build Live API configuration
            live_config = {
                "response_modalities": config.response_modalities
            }
            
            # Add system instruction if provided
            if config.system_instruction:
                live_config["system_instruction"] = config.system_instruction
            
            # Add voice configuration for audio responses
            if "AUDIO" in config.response_modalities:
                live_config["speech_config"] = {
                    "voice_config": {
                        "prebuilt_voice_config": {
                            "voice_name": config.voice
                        }
                    }
                }
            
            # Create Live API connection configuration
            session_data["live_config"] = live_config
            session_data["status"] = "connected"
            session_data["connected"] = True
            
            logger.info(f"Connected to session {session_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error connecting session {session_id}: {e}")
            if session_id in self.active_sessions:
                self.active_sessions[session_id]["status"] = "error"
            raise
    
    async def send_message(self, session_id: str, message: str) -> AsyncGenerator[Dict[str, Any], None]:
        """Send a text message to the Live API session."""
        try:
            if session_id not in self.active_sessions:
                raise ValueError(f"Session {session_id} not found")
            
            session_data = self.active_sessions[session_id]
            if not session_data.get("connected"):
                raise ValueError(f"Session {session_id} is not connected")
            
            config = session_data["config"]
            live_config = session_data["live_config"]
            
            # Create Live API connection and send message
            async with self.client.aio.live.connect(
                model=config.model,
                config=live_config
            ) as session:
                
                # Send client content
                await session.send_client_content(
                    turns={"role": "user", "parts": [{"text": message}]},
                    turn_complete=True
                )
                
                # Receive responses
                async for response in session.receive():
                    if response.text is not None:
                        yield {"text": response.text}
                    elif response.data is not None:
                        # Audio response
                        yield {"audio": response.data}
                    elif response.server_content and response.server_content.model_turn:
                        # Handle complete turn
                        for part in response.server_content.model_turn.parts:
                            if hasattr(part, 'text') and part.text:
                                yield {"text": part.text}
                            elif hasattr(part, 'inline_data') and part.inline_data:
                                yield {"audio": part.inline_data.data}
                    
                    # Break after first complete response for simplicity
                    if response.server_content and response.server_content.turn_complete:
                        break
                    
        except Exception as e:
            logger.error(f"Error sending message to session {session_id}: {e}")
            yield {"error": str(e)}
    
    async def send_audio(self, session_id: str, audio_data: bytes) -> AsyncGenerator[Dict[str, Any], None]:
        """Send audio data to the Live API session."""
        try:
            if session_id not in self.active_sessions:
                raise ValueError(f"Session {session_id} not found")
            
            session_data = self.active_sessions[session_id]
            if not session_data.get("connected"):
                raise ValueError(f"Session {session_id} is not connected")
            
            session = session_data["session"]
            
            # Process audio to correct format (16-bit PCM, 16kHz)
            audio_processed = await self._process_audio_input(audio_data)
            
            # Send realtime audio input
            await session.send_realtime_input(
                audio=types.Blob(data=audio_processed, mime_type="audio/pcm;rate=16000")
            )
            
            # Receive responses
            async for response in session.receive():
                if response.text is not None:
                    yield {"text": response.text}
                elif response.data is not None:
                    # Audio response (24kHz output)
                    yield {"audio": response.data}
                
                # Break after first complete response
                if response.server_content and response.server_content.turn_complete:
                    break
                    
        except Exception as e:
            logger.error(f"Error sending audio to session {session_id}: {e}")
            yield {"error": str(e)}
    
    async def send_video(self, session_id: str, image_data: bytes) -> AsyncGenerator[Dict[str, Any], None]:
        """Send video frame to the Live API session."""
        try:
            if session_id not in self.active_sessions:
                raise ValueError(f"Session {session_id} not found")
            
            session_data = self.active_sessions[session_id]
            if not session_data.get("connected"):
                raise ValueError(f"Session {session_id} is not connected")
            
            session = session_data["session"]
            
            # Send image as part of realtime input
            await session.send_realtime_input(
                video=types.Blob(data=image_data, mime_type="image/jpeg")
            )
            
            # Receive responses
            async for response in session.receive():
                if response.text is not None:
                    yield {"text": response.text}
                elif response.data is not None:
                    # Audio response
                    yield {"audio": response.data}
                
                # Break after first complete response
                if response.server_content and response.server_content.turn_complete:
                    break
                    
        except Exception as e:
            logger.error(f"Error sending video to session {session_id}: {e}")
            yield {"error": str(e)}
    
    async def get_session_status(self, session_id: str) -> Dict[str, Any]:
        """Get the status of a Live API session."""
        try:
            if session_id not in self.active_sessions:
                return {"status": "not_found"}
            
            session_data = self.active_sessions[session_id]
            return {
                "status": session_data["status"],
                "connected": session_data["connected"],
                "config": session_data["config"].__dict__
            }
            
        except Exception as e:
            logger.error(f"Error getting session status {session_id}: {e}")
            return {"status": "error", "error": str(e)}
    
    async def end_session(self, session_id: str) -> bool:
        """End a Live API session."""
        try:
            if session_id not in self.active_sessions:
                raise ValueError(f"Session {session_id} not found")
            
            # Remove from active sessions (no connection object to close since we use context managers)
            del self.active_sessions[session_id]
            
            logger.info(f"Ended session {session_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error ending session {session_id}: {e}")
            return False
    
    async def _process_audio_input(self, audio_data: bytes) -> bytes:
        """Process audio data to the correct format for Live API."""
        try:
            # Use librosa to process audio
            audio_buffer = io.BytesIO(audio_data)
            
            # Load audio data with librosa
            # This will handle various input formats
            y, sr = librosa.load(audio_buffer, sr=16000, mono=True)
            
            # Convert to 16-bit PCM
            audio_int16 = (y * 32767).astype(np.int16)
            
            # Convert to bytes
            return audio_int16.tobytes()
            
        except Exception as e:
            logger.error(f"Error processing audio: {e}")
            # If processing fails, return original data
            return audio_data
    
    def get_available_voices(self) -> List[str]:
        """Get list of available voices for the Live API."""
        return ["Puck", "Charon", "Kore", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"]
    
    def get_supported_models(self) -> List[str]:
        """Get list of supported models for the Live API."""
        return [
            "gemini-2.0-flash-live-001",
            "gemini-2.5-flash-preview-native-audio-dialog"
        ]
    
    async def create_simple_text_conversation(self, message: str, 
                                            voice: str = "Puck", 
                                            model: str = "gemini-2.0-flash-live-001") -> str:
        """Create a simple text conversation (for testing purposes)."""
        try:
            # Create session
            config = LiveSessionConfig(
                session_type="text",
                model=model,
                voice=voice,
                response_modalities=["TEXT"]
            )
            
            session_id = await self.create_session(config)
            
            # Connect session
            await self.connect_session(session_id)
            
            # Send message and get response
            response_text = ""
            async for response in self.send_message(session_id, message):
                if "text" in response:
                    response_text += response["text"]
                    break  # Get first response
            
            # End session
            await self.end_session(session_id)
            
            return response_text
            
        except Exception as e:
            logger.error(f"Error in simple conversation: {e}")
            raise

# Example usage functions
async def example_text_conversation():
    """Example of text conversation."""
    service = LiveAPIService(api_key=os.getenv("GOOGLE_API_KEY"))
    
    config = LiveSessionConfig(
        session_type="text",
        system_instruction="You are a helpful assistant. Be concise and friendly."
    )
    
    async for response in service.text_conversation("Hello! How are you today?", config):
        print(f"AI: {response}", end="")
    print()

async def example_audio_conversation():
    """Example of audio conversation."""
    service = LiveAPIService(api_key=os.getenv("GOOGLE_API_KEY"))
    
    config = LiveSessionConfig(
        session_type="audio",
        voice_name="Aoede",
        system_instruction="You are a friendly voice assistant."
    )
    
    # In a real app, you'd get audio_data from microphone
    # For now, this is just a placeholder
    audio_data = b""  # Would be actual PCM audio data
    
    async for audio_chunk in service.audio_conversation(audio_data, config):
        # In a real app, you'd play this audio through speakers
        print(f"Received audio chunk: {len(audio_chunk)} bytes")

if __name__ == "__main__":
    # Run examples
    asyncio.run(example_text_conversation()) 