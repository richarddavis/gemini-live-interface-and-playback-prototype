import google.generativeai as genai
import os
import requests
from io import BytesIO
from .base import LLMProvider
from flask import current_app

class GeminiProvider(LLMProvider):
    MODEL_NAME = "gemini-1.5-flash-latest"

    def _configure_client(self, api_key):
        # Ensure GOOGLE_API_KEY is set for the genai library
        # The SDK prefers the environment variable, but we can set it if needed.
        # However, the most straightforward way is to ensure the user sets it in their env.
        # For this implementation, we assume the API key passed is for GOOGLE_API_KEY
        # and configure it directly for the call if it's not already in the environment.
        if not os.getenv("GOOGLE_API_KEY") and api_key:
             genai.configure(api_key=api_key)
        elif not os.getenv("GOOGLE_API_KEY") and not api_key:
            raise ValueError("GOOGLE_API_KEY not set and no API key provided to GeminiProvider.")
        # If os.getenv("GOOGLE_API_KEY") is already set, the SDK will use it automatically.
        # If api_key is also provided, genai.configure(api_key=api_key) would override it for this instance if called.
        # For simplicity, we'll rely on the environment variable or the direct configuration at the start.
        # If an api_key is explicitly passed to this method, we should use it.
        if api_key:
            genai.configure(api_key=api_key) # This ensures the passed key is used.

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
        self._configure_client(api_key)
        model = genai.GenerativeModel(self.MODEL_NAME)

        # Convert our message history to Gemini's format
        try:
            gemini_messages = self._prepare_gemini_messages(messages)
            
            current_app.logger.debug(f"Sending to Gemini: {len(gemini_messages)} messages")
            response = model.generate_content(
                gemini_messages,
                generation_config=genai.GenerationConfig(
                    temperature=kwargs.get('temperature', 0.9)  # Default to 0.9 if not provided
                )
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
        self._configure_client(api_key)
        model = genai.GenerativeModel(self.MODEL_NAME)
        
        try:
            # Convert our message history to Gemini's format
            gemini_messages = self._prepare_gemini_messages(messages)

            stream = model.generate_content(
                gemini_messages,
                stream=True,
                generation_config=genai.GenerationConfig(
                    temperature=kwargs.get('temperature', 0.9)
                )
            )
            
            for chunk in stream:
                # If the chunk has text, yield it
                if hasattr(chunk, 'text') and chunk.text:
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