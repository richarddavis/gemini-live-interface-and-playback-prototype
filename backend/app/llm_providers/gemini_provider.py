from google import genai
import os
import requests
from io import BytesIO
from .base import LLMProvider
from flask import current_app

class GeminiProvider(LLMProvider):
    MODEL_NAME = "gemini-1.5-flash-latest"  # Regular model for non-live interactions

    def _configure_client(self, api_key, for_live=False):
        # The google-genai package has changed, and genai.configure() is no longer available
        # Instead, we need to create a client instance with the API key
        if not api_key and not os.getenv("REACT_APP_GEMINI_API_KEY"):
            raise ValueError("REACT_APP_GEMINI_API_KEY not set and no API key provided to GeminiProvider.")
        
        # Use the API key from the parameter or environment
        client_api_key = api_key or os.getenv("REACT_APP_GEMINI_API_KEY")
        
        # For Live API, we need to specify the alpha API version
        if for_live:
            # Return a configured client for live API
            return genai.Client(api_key=client_api_key, http_options={'api_version': 'v1alpha'})
        else:
            # Create a client for regular API
            # The error indicates there's no genai.GenerativeModel attribute
            # We need to use the client directly
            client = genai.Client(api_key=client_api_key)
            # The model should be accessed through the client
            return client

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

    def _prepare_gemini_messages(self, messages):
        """Convert our message format to Gemini's format, handling media properly"""
        gemini_messages = []
        
        for msg in messages:
            parts = []
            if msg.get('text'):
                parts.append({"text": msg['text']})
            
            # Handle media (image or video) by downloading the content
            if msg.get('media_url') and msg.get('media_type'):
                try:
                    media_content = self._fetch_media_content(msg['media_url'], msg['media_type'])
                    parts.append({
                        "inline_data": media_content
                    })
                except Exception as e:
                    current_app.logger.error(f"Failed to process media: {str(e)}")
                    # Continue without the media if there's an error
            
            if parts:  # Only add if there's text or media
                gemini_messages.append({
                    "role": "user" if msg['sender'] == 'user' else "model",
                    "parts": parts
                })
        
        return gemini_messages

    def get_response(self, messages, api_key, **kwargs):
        # Get a configured client
        client = self._configure_client(api_key)

        # Convert our message history to Gemini's format
        try:
            gemini_messages = self._prepare_gemini_messages(messages)
            
            current_app.logger.debug(f"Sending to Gemini: {len(gemini_messages)} messages")
            
            # According to the documentation, use only the required parameters
            # Additional parameters can be added via a generation_config dictionary if needed later
            response = client.models.generate_content(
                model=self.MODEL_NAME,
                contents=gemini_messages
            )
            
            # Handle response
            if hasattr(response, 'text'):
                # Simple access using .text property if available
                return response.text
            elif hasattr(response, 'candidates') and response.candidates:
                # More complex response structure
                if response.candidates[0].content and response.candidates[0].content.parts:
                    return response.candidates[0].content.parts[0].text
            
            # If we got here, something unexpected happened
            current_app.logger.error(f"Unexpected Gemini response structure: {response}")
            
            # Check for safety blocking
            if hasattr(response, 'prompt_feedback') and response.prompt_feedback:
                if hasattr(response.prompt_feedback, 'block_reason') and response.prompt_feedback.block_reason:
                    return f"Content blocked by Gemini: {response.prompt_feedback.block_reason}"
            
            return "Error: Received no valid response from Gemini."
            
        except Exception as e:
            current_app.logger.error(f"Gemini API error: {str(e)}")
            return f"Error communicating with Gemini: {str(e)}"

    def stream_response(self, messages, api_key, **kwargs):
        # Get a configured client
        client = self._configure_client(api_key)
        
        try:
            # Convert our message history to Gemini's format
            gemini_messages = self._prepare_gemini_messages(messages)

            # According to the documentation, generate_content_stream doesn't accept temperature
            # Call it with only the required parameters
            stream = client.models.generate_content_stream(
                model=self.MODEL_NAME,
                contents=gemini_messages
            )
            
            for chunk in stream:
                # If the chunk has text, yield it
                if hasattr(chunk, 'text'):
                    yield chunk.text
                # For older API versions or different response structures
                elif hasattr(chunk, 'parts') and chunk.parts:
                    yield chunk.parts[0].text
                # Handle zero-length chunks by ignoring them
                
                # Handle safety blocks
                elif hasattr(chunk, 'prompt_feedback') and chunk.prompt_feedback:
                    if hasattr(chunk.prompt_feedback, 'block_reason') and chunk.prompt_feedback.block_reason:
                        yield f"Content stream blocked by Gemini: {chunk.prompt_feedback.block_reason}"
                        break  # Stop streaming if blocked

        except Exception as e:
            current_app.logger.error(f"Gemini API streaming error: {str(e)}")
            yield f"Error streaming from Gemini: {str(e)}" 