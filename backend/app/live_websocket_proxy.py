import asyncio
import json
import os
from typing import Optional, Dict, Any
import logging

import websockets
from websockets.legacy.protocol import WebSocketCommonProtocol
from websockets.legacy.server import WebSocketServerProtocol
from google.auth.transport.requests import Request
from google.oauth2.service_account import Credentials

# Import modern configuration
from gemini_live_config import GeminiLiveConfig, GeminiLiveModels

# Modern Gemini Live API endpoint
HOST = GeminiLiveConfig.API_HOST
SERVICE_URL = GeminiLiveConfig.WEBSOCKET_URL

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEBUG = os.getenv("DEBUG", "false").lower() == "true"

class GeminiLiveProxy:
    """Modern Gemini Live API WebSocket proxy with session management."""
    
    def __init__(self):
        self.credentials = self._load_credentials()
        self.active_sessions: Dict[str, Dict[str, Any]] = {}
    
    def _load_credentials(self) -> Optional[Credentials]:
        """Load Google Cloud credentials from service account key."""
        key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if not key_path or not os.path.exists(key_path):
            logger.error(f"Service account key not found at: {key_path}")
            return None
        
        try:
            credentials = Credentials.from_service_account_file(
                key_path,
                scopes=[
                    "https://www.googleapis.com/auth/cloud-platform",
                    "https://www.googleapis.com/auth/generative-language"
                ]
            )
            return credentials
        except Exception as e:
            logger.error(f"Failed to load credentials: {e}")
            return None
    
    def _get_access_token(self) -> Optional[str]:
        """Get a fresh access token."""
        if not self.credentials:
            return None
        
        try:
            request = Request()
            self.credentials.refresh(request)
            return self.credentials.token
        except Exception as e:
            logger.error(f"Failed to get access token: {e}")
            return None

    async def proxy_message_with_processing(
        self, 
        source_ws: WebSocketCommonProtocol, 
        target_ws: WebSocketCommonProtocol,
        direction: str
    ) -> None:
        """
        Enhanced message forwarding with processing and error handling.
        
        Args:
            source_ws: Source WebSocket connection
            target_ws: Target WebSocket connection  
            direction: Direction of message flow ('client_to_server' or 'server_to_client')
        """
        try:
            async for message in source_ws:
                try:
                    if isinstance(message, str):
                        data = json.loads(message)
                    else:
                        # Handle binary messages (for audio data)
                        data = message
                    
                    if DEBUG:
                        logger.info(f"Proxying {direction}: {type(data)}")
                        if isinstance(data, dict):
                            logger.info(f"Message type: {data.get('type', 'unknown')}")
                    
                    # Enhanced message processing for setup phase
                    if direction == "client_to_server" and isinstance(data, dict):
                        original_data = data.copy()
                        data = self._enhance_client_message(data)
                        
                        if DEBUG:
                            if original_data != data:
                                logger.info(f"Message enhanced from: {original_data}")
                                logger.info(f"Message enhanced to: {data}")
                    
                    # Forward the message
                    if isinstance(data, dict):
                        if DEBUG and direction == "client_to_server":
                            logger.info(f"Sending to Gemini: {data}")
                        await target_ws.send(json.dumps(data))
                    else:
                        await target_ws.send(data)
                    
                    # Log responses from Gemini
                    if DEBUG and direction == "server_to_client" and isinstance(data, dict):
                        logger.info(f"Received from Gemini: {data}")
                        
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON in {direction}: {e}")
                except Exception as e:
                    logger.error(f"Error processing {direction} message: {e}")
                    break
        
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Connection closed in {direction}")
        except Exception as e:
            logger.error(f"Error in {direction} proxy: {e}")
        finally:
            try:
                await target_ws.close()
            except:
                pass

    def _enhance_client_message(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Enhance client messages with modern Gemini Live API features.
        
        Args:
            data: Original client message
            
        Returns:
            Enhanced message with modern features
        """
        # Handle both message formats:
        # 1. {"setup": {...}} - wrapped format
        # 2. {"type": "setup", ...} - flat format
        
        if data.get("type") == "setup":
            # Convert flat format to wrapped format
            setup_data = {k: v for k, v in data.items() if k != "type"}
            data = {"setup": setup_data}
        
        # Add default configuration if setup message
        if "setup" in data:
            setup_data = data["setup"]
            
            # Use modern model if not specified
            if "model" not in setup_data:
                setup_data["model"] = GeminiLiveModels.get_default_model()
            
            # Validate the model
            if not GeminiLiveConfig.validate_model(setup_data["model"]):
                logger.warning(f"Unknown model: {setup_data['model']}, using default")
                setup_data["model"] = GeminiLiveModels.get_default_model()
            
            # Handle legacy field names
            if "systemInstructions" in setup_data and "system_instruction" not in setup_data:
                setup_data["system_instruction"] = {
                    "parts": [{"text": setup_data.pop("systemInstructions")}]
                }
                
            if "responseModalities" in setup_data:
                # Convert to proper generation config format
                modalities = setup_data.pop("responseModalities")
                if "generation_config" not in setup_data:
                    setup_data["generation_config"] = {}
                setup_data["generation_config"]["response_modalities"] = modalities
            
            # Use configuration for defaults if not specified, but don't override client values
            if "generation_config" not in setup_data:
                # Use TEXT-only configuration if no AUDIO modality requested
                client_modalities = setup_data.get("responseModalities", ["TEXT"])
                if "AUDIO" in client_modalities:
                    default_setup = GeminiLiveConfig.get_default_setup_message()
                else:
                    # Use minimal configuration for TEXT-only
                    default_setup = {
                        "setup": {
                            "generation_config": {
                                "response_modalities": ["TEXT"],
                                "max_output_tokens": 8192,
                                "temperature": 0.7,
                                "top_p": 0.95,
                                "top_k": 40
                            },
                            "system_instruction": GeminiLiveConfig.DEFAULT_SYSTEM_INSTRUCTION
                        }
                    }
                setup_data.update(default_setup["setup"])
            else:
                # Merge only missing values from defaults based on modalities
                client_modalities = setup_data["generation_config"].get("response_modalities", ["TEXT"])
                if "AUDIO" in client_modalities:
                    default_setup = GeminiLiveConfig.get_default_setup_message()
                else:
                    default_setup = {
                        "setup": {
                            "generation_config": {
                                "max_output_tokens": 8192,
                                "temperature": 0.7,
                                "top_p": 0.95,
                                "top_k": 40
                            },
                            "system_instruction": GeminiLiveConfig.DEFAULT_SYSTEM_INSTRUCTION
                        }
                    }
                
                default_gen_config = default_setup["setup"].get("generation_config", {})
                for key, value in default_gen_config.items():
                    if key not in setup_data["generation_config"]:
                        setup_data["generation_config"][key] = value
                        
                # Don't add default system_instruction if client provided systemInstructions
                if "system_instruction" not in setup_data:
                    if "system_instruction" in default_setup["setup"]:
                        setup_data["system_instruction"] = default_setup["setup"]["system_instruction"]
            
            # Only add voice configuration if AUDIO modality is requested
            if "generation_config" in setup_data:
                modalities = setup_data["generation_config"].get("response_modalities", ["TEXT"])
                if "AUDIO" in modalities:
                    # Ensure voice is valid
                    voice_config = setup_data.get("generation_config", {}).get("speech_config", {}).get("voice_config", {})
                    if voice_config:
                        voice_name = voice_config.get("prebuilt_voice_config", {}).get("voice_name", "Aoede")
                        if not GeminiLiveConfig.validate_voice(voice_name):
                            logger.warning(f"Unknown voice: {voice_name}, using Aoede")
                            voice_config["prebuilt_voice_config"]["voice_name"] = "Aoede"
        
        return data

    async def create_live_session(
        self, 
        client_websocket: WebSocketCommonProtocol, 
        session_config: Dict[str, Any]
    ) -> None:
        """
        Create a modern Gemini Live API session with enhanced features.
        
        Args:
            client_websocket: Client WebSocket connection
            session_config: Configuration for the session
        """
        access_token = self._get_access_token()
        if not access_token:
            await client_websocket.close(code=1008, reason="Authentication failed")
            return

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}",
            # Add modern headers
            "x-goog-user-project": session_config.get("project_id", ""),
            "x-goog-api-key": session_config.get("api_key", "")
        }

        try:
            logger.info(f"Connecting to Gemini Live API: {SERVICE_URL}")
            
            async with websockets.connect(
                SERVICE_URL, 
                additional_headers=headers,
                ping_interval=30,  # Keep connection alive
                ping_timeout=10,
                close_timeout=10
            ) as server_websocket:
                
                logger.info("Successfully connected to Gemini Live API")
                
                # Create bidirectional proxy tasks
                client_to_server_task = asyncio.create_task(
                    self.proxy_message_with_processing(
                        client_websocket, 
                        server_websocket, 
                        "client_to_server"
                    )
                )
                
                server_to_client_task = asyncio.create_task(
                    self.proxy_message_with_processing(
                        server_websocket, 
                        client_websocket, 
                        "server_to_client"
                    )
                )
                
                # Wait for either task to complete
                done, pending = await asyncio.wait(
                    [client_to_server_task, server_to_client_task],
                    return_when=asyncio.FIRST_COMPLETED
                )
                
                # Cancel remaining tasks
                for task in pending:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
                
                logger.info("Session ended")
                
        except Exception as e:
            logger.error(f"Failed to connect to Gemini Live API: {e}")
            await client_websocket.close(code=1011, reason=f"Server error: {str(e)}")

    async def handle_client_connection(self, client_websocket: WebSocketServerProtocol) -> None:
        """
        Handle new client connection with modern authentication and session management.
        
        Args:
            client_websocket: Client WebSocket connection
        """
        client_address = client_websocket.remote_address
        logger.info(f"New client connection from {client_address}")
        
        try:
            # Default session configuration - proxy handles auth with Google
            session_config = {
                "model": "models/gemini-2.0-flash-live-001",
                "project_id": "",
                "api_key": ""
            }
            
            logger.info(f"Starting live session with model: {session_config['model']}")
            
            # Create the live session with proxy authentication
            await self.create_live_session(client_websocket, session_config)
            
        except Exception as e:
            logger.error(f"Error handling client connection: {e}")
            await client_websocket.close(code=1011, reason="Server error")

async def main() -> None:
    """Start the modern Gemini Live API WebSocket proxy server."""
    proxy = GeminiLiveProxy()
    
    if not proxy.credentials:
        logger.error("Failed to load credentials. Server cannot start.")
        return
    
    logger.info("Starting Gemini Live API WebSocket Proxy Server...")
    logger.info(f"Server will listen on 0.0.0.0:8080")
    logger.info(f"Debug mode: {DEBUG}")
    
    try:
        async with websockets.serve(
            proxy.handle_client_connection, 
            "0.0.0.0", 
            8080,
            ping_interval=30,
            ping_timeout=10,
            max_size=10**7,  # 10MB for audio data
            max_queue=32
        ):
            logger.info("Gemini Live API Proxy Server is running...")
            # Run forever
            await asyncio.Future()
    except Exception as e:
        logger.error(f"Failed to start server: {e}")

if __name__ == "__main__":
    asyncio.run(main()) 