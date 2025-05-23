"""
Modern Gemini Live API Configuration
Defines models, endpoints, and features for the current Gemini Live API.
"""

import os
from typing import Dict, List, Any
from dataclasses import dataclass, asdict

@dataclass
class VoiceConfig:
    """Voice configuration for audio output."""
    voice_name: str = "Aoede"  # Default voice
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "prebuilt_voice_config": {
                "voice_name": self.voice_name
            }
        }

@dataclass
class SpeechConfig:
    """Speech configuration for voice activity detection."""
    speech_start_timeout: str = "1s"
    speech_end_timeout: str = "2s"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "voice_activity_timeout": {
                "speech_start_timeout": self.speech_start_timeout,
                "speech_end_timeout": self.speech_end_timeout
            }
        }

@dataclass
class GenerationConfig:
    """Generation configuration for responses."""
    response_modalities: List[str] = None
    voice_config: VoiceConfig = None
    speech_config: SpeechConfig = None
    max_output_tokens: int = 8192
    temperature: float = 0.7
    top_p: float = 0.95
    top_k: int = 40
    
    def __post_init__(self):
        if self.response_modalities is None:
            self.response_modalities = ["TEXT", "AUDIO"]
        if self.voice_config is None:
            self.voice_config = VoiceConfig()
        if self.speech_config is None:
            self.speech_config = SpeechConfig()
    
    def to_dict(self) -> Dict[str, Any]:
        config = {
            "response_modalities": self.response_modalities,
            "max_output_tokens": self.max_output_tokens,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "top_k": self.top_k
        }
        
        if "AUDIO" in self.response_modalities:
            config["speech_config"] = {
                "voice_config": self.voice_config.to_dict()
            }
        
        return config

class GeminiLiveModels:
    """Available Gemini Live API models."""
    
    # Current primary models
    GEMINI_2_0_FLASH_LIVE = "models/gemini-2.0-flash-live-001"
    GEMINI_2_5_FLASH_PREVIEW_NATIVE_AUDIO = "models/gemini-2.5-flash-preview-native-audio-dialog" 
    GEMINI_2_5_FLASH_EXP_NATIVE_AUDIO_THINKING = "models/gemini-2.5-flash-exp-native-audio-thinking-dialog"
    
    # Additional available models
    GEMINI_2_0_FLASH_EXP = "models/gemini-2.0-flash-exp"
    GEMINI_2_5_FLASH_002 = "models/gemini-2.5-flash-002"
    
    @classmethod
    def get_default_model(cls) -> str:
        """Get the recommended default model."""
        return cls.GEMINI_2_0_FLASH_LIVE
    
    @classmethod
    def get_all_models(cls) -> List[str]:
        """Get all available models."""
        return [
            cls.GEMINI_2_0_FLASH_LIVE,
            cls.GEMINI_2_5_FLASH_PREVIEW_NATIVE_AUDIO,
            cls.GEMINI_2_5_FLASH_EXP_NATIVE_AUDIO_THINKING,
            cls.GEMINI_2_0_FLASH_EXP,
            cls.GEMINI_2_5_FLASH_002
        ]

class GeminiLiveConfig:
    """Configuration class for Gemini Live API."""
    
    # Official 2025 API endpoints confirmed from Google documentation
    API_HOST = "generativelanguage.googleapis.com"
    WEBSOCKET_URL = f"wss://{API_HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
    
    # Supported voices
    VOICES = [
        "Aoede", "Puck", "Charon", "Kore", 
        "Fenrir", "Leda", "Orus", "Zephyr"
    ]
    
    # Response modalities
    RESPONSE_MODALITIES = ["TEXT", "AUDIO"]
    
    # Default configuration
    DEFAULT_CONFIG = {
        "response_modalities": ["TEXT"],
        "speech_config": SpeechConfig().to_dict(),
        "realtime_input_config": {
            "automatic_activity_detection": {
                "disabled": False,
                "start_of_speech_sensitivity": "START_SENSITIVITY_HIGH",
                "end_of_speech_sensitivity": "END_SENSITIVITY_HIGH"
            }
        }
    }
    
    # Default system instruction
    DEFAULT_SYSTEM_INSTRUCTION = {
        "parts": [{
            "text": "You are a helpful AI assistant. Respond naturally and conversationally. "
                   "When speaking, use a friendly and engaging tone. Keep responses concise "
                   "but informative, and ask follow-up questions when appropriate to maintain engagement."
        }]
    }
    
    @classmethod
    def validate_model(cls, model: str) -> bool:
        """Validate if the model is supported."""
        return model in GeminiLiveModels.get_all_models()
    
    @classmethod
    def get_audio_config(cls, voice_name: str = "Aoede") -> Dict[str, Any]:
        """Get configuration for audio responses."""
        return {
            "response_modalities": ["AUDIO"],
            "speech_config": {
                "voice_config": VoiceConfig(voice_name).to_dict()
            }
        }
    
    @classmethod
    def get_text_config(cls) -> Dict[str, Any]:
        """Get configuration for text responses."""
        return {
            "response_modalities": ["TEXT"]
        }
    
    @classmethod
    def get_debug_info(cls) -> Dict[str, Any]:
        """Get debug information about the configuration."""
        return {
            "api_host": cls.API_HOST,
            "websocket_url": cls.WEBSOCKET_URL,
            "available_models": GeminiLiveModels.get_all_models(),
            "available_voices": cls.VOICES,
            "default_model": GeminiLiveModels.get_default_model()
        }

    @classmethod
    def get_default_setup_message(
        cls, 
        model: str = None,
        response_modalities: List[str] = None,
        voice_name: str = "Aoede",
        system_instruction: str = None
    ) -> Dict[str, Any]:
        """
        Generate a default setup message for session initialization.
        
        Args:
            model: Model to use (defaults to recommended model)
            response_modalities: List of response types (TEXT, AUDIO)
            voice_name: Voice to use for audio responses
            system_instruction: Custom system instruction
            
        Returns:
            Setup message dictionary
        """
        if model is None:
            model = GeminiLiveModels.get_default_model()
        
        if response_modalities is None:
            response_modalities = ["TEXT", "AUDIO"]
        
        # Create generation config
        voice_config = VoiceConfig(voice_name=voice_name)
        speech_config = SpeechConfig()
        generation_config = GenerationConfig(
            response_modalities=response_modalities,
            voice_config=voice_config,
            speech_config=speech_config
        )
        
        # System instruction
        if system_instruction:
            sys_instruction = {"parts": [{"text": system_instruction}]}
        else:
            sys_instruction = cls.DEFAULT_SYSTEM_INSTRUCTION
        
        setup_message = {
            "setup": {
                "model": model,
                "generation_config": generation_config.to_dict(),
                "system_instruction": sys_instruction
            }
        }
        
        # Add speech config for VAD
        if "AUDIO" in response_modalities:
            setup_message["setup"]["speech_config"] = speech_config.to_dict()
        
        return setup_message
    
    @classmethod
    def get_environment_config(cls) -> Dict[str, Any]:
        """Get configuration from environment variables."""
        return {
            "project_id": os.getenv("GOOGLE_CLOUD_PROJECT", ""),
            "credentials_path": os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
            "debug": os.getenv("DEBUG", "false").lower() == "true",
            "log_level": os.getenv("LOG_LEVEL", "INFO").upper()
        }
    
    @classmethod
    def validate_voice(cls, voice_name: str) -> bool:
        """Validate if a voice is supported."""
        return voice_name in cls.VOICES 