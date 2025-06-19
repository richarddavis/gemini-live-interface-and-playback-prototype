from google import genai
import os
import requests
from io import BytesIO
from .base import LLMProvider
from flask import current_app

# ---------------------------------------------------------------------------
# Simple in-process cache so we upload each media asset to Gemini **once**
# and then reuse the resulting `file.uri` in all subsequent requests. The
# Gemini Files API keeps the object for 48 h which is more than enough for a
# single worker process lifetime.
# ---------------------------------------------------------------------------
_GEMINI_FILE_CACHE: dict[tuple[str, str], str] = {}

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

    def _prepare_gemini_messages(self, messages, context_limit=20):
        """Convert our internal message dicts to Gemini's expected format.

        Changes vs. previous implementation:
        • Always reference media by URI instead of downloading bytes locally. This
          lets Gemini handle its own preprocessing & implicit caching.
        • Keep context trimming (last `context_limit` messages) to avoid huge
          payloads, but drop the older 'recent_media_limit' heuristic – URIs are
          cheap to repeat.
        """

        trimmed_msgs = messages[-context_limit:] if context_limit else messages

        gemini_messages = []

        for msg in trimmed_msgs:
            parts = []

            if msg.get("text"):
                parts.append({"text": msg["text"]})

            # ----------------------------------------------------------------
            # Attach media if present. To avoid the `INVALID_ARGUMENT` errors
            # we saw when passing signed GCS HTTP URLs directly, we now upload
            # the blob to Gemini's Files API once and reuse the returned
            # `file.uri`.
            # ----------------------------------------------------------------
            if msg.get("media_url") and msg.get("media_type"):
                media_url = msg["media_url"]
                mime_type = msg["media_type"]

                cache_key = (media_url, mime_type)
                if cache_key in _GEMINI_FILE_CACHE:
                    file_uri = _GEMINI_FILE_CACHE[cache_key]
                else:
                    # Download the asset and push to Files API
                    try:
                        resp = requests.get(media_url, timeout=15)
                        resp.raise_for_status()

                        client = self._configure_client(None)  # use default key logic
                        uploaded_file = client.files.upload(
                            file=BytesIO(resp.content),
                            config={"mime_type": mime_type}
                        )
                        file_uri = uploaded_file.uri
                        _GEMINI_FILE_CACHE[cache_key] = file_uri
                    except Exception as e:
                        current_app.logger.error(
                            f"Failed to cache media for Gemini (url={media_url}): {e}"
                        )
                        # Fall back: omit media to avoid breaking entire request
                        file_uri = None

                if file_uri:
                    parts.append({
                        "file_data": {
                            "file_uri": file_uri,
                            "mime_type": mime_type
                        }
                    })

            if parts:
                gemini_messages.append({
                    "role": "user" if msg["sender"] == "user" else "model",
                    "parts": parts
                })

        return gemini_messages

    def get_response(self, messages, api_key, **kwargs):
        # Apply optimised preparation
        gemini_messages = self._prepare_gemini_messages(messages)
        # Get a configured client
        client = self._configure_client(api_key)
        try:
            current_app.logger.debug(f"Sending to Gemini: {len(gemini_messages)} messages (context limited)")
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
        # Apply optimised preparation
        gemini_messages = self._prepare_gemini_messages(messages)
        # Get a configured client
        client = self._configure_client(api_key)
        
        try:
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