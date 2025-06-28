try:
    import google.generativeai as genai  # type: ignore
except ImportError as exc:  # pragma: no cover
    # Provide a clearer error message if the runtime environment is missing the
    # optional dependency.  This will also silence static analyzers that expect
    # the symbol to exist later in the file.
    raise RuntimeError(
        "google-generativeai package is required for GeminiProvider. "
        "Install with `pip install google-generativeai`"
    ) from exc
import os
import requests
from io import BytesIO
from .base import LLMProvider
from flask import current_app, Flask  # noqa: F401
import logging as _logging

# ---------------------------------------------------------------------------
# Simple in-process cache so we upload each media asset to Gemini **once**
# and then reuse the resulting `file.uri` in all subsequent requests. The
# Gemini Files API keeps the object for 48 h which is more than enough for a
# single worker process lifetime.
# ---------------------------------------------------------------------------
_GEMINI_FILE_CACHE: dict[tuple[str, str], str] = {}

# ---------------------------------------------------------------------------
# Runtime-configurable model selection
# Priority order (highest first):
#   1) Explicit environment variable GEMINI_DEFAULT_MODEL
#   2) Legacy fallback (gemini-1.5-flash-latest) when ENABLE_LEGACY_MODEL=true
#   3) Recommended default: gemini-2.5-flash
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Helper class: google-genai's Files API expects a file-like object that has
# both a `name` attribute (used for filename inference) and, in some versions,
# a `content_type` attribute.  The standard `BytesIO` lacks these, so we wrap
# it into a tiny subclass that sets them.
# ---------------------------------------------------------------------------

class NamedBytesIO(BytesIO):
    """BytesIO subclass carrying filename & content_type metadata."""

    def __init__(self, data: bytes, mime_type: str):
        super().__init__(data)
        # Filename is not relevant – any non-empty string works.
        self.name = "media_asset"
        # Some client versions look for `content_type`; set it for safety.
        self.content_type = mime_type

class GeminiProvider(LLMProvider):
    # Determine which model to use at import time. Fast and keeps the value
    # constant for the lifetime of the worker process (avoids re-evaluation in
    # every request loop).

    _env_model = os.getenv("GEMINI_DEFAULT_MODEL")
    _legacy_enabled = os.getenv("ENABLE_LEGACY_MODEL", "false").lower() in {"1", "true", "yes"}

    if _env_model:
        MODEL_NAME = _env_model  # Explicit override via environment
    elif _legacy_enabled:
        MODEL_NAME = "gemini-1.5-flash-latest"  # Regression-test legacy model
    else:
        MODEL_NAME = "gemini-2.5-flash"  # Recommended default for 2025+

    # ---------------------------------------------------------------------------
    # Emit a startup log so Docker users immediately see which model is active.
    # This runs once when the module is imported (i.e. when the Flask app starts
    # inside the backend container).  The message is printed **and** sent via the
    # standard logging facility so it will always appear in `docker-compose logs`.
    # ---------------------------------------------------------------------------

    _logger = _logging.getLogger(__name__)
    # Ensure at least INFO level for this message in case the root logger is not
    # configured yet.  (Flask/Gunicorn will usually configure logging later.)
    if not _logger.handlers:
        _logging.basicConfig(level=_logging.INFO)

    _msg = f"GeminiProvider active — using model: {MODEL_NAME}"

    # Plain print guarantees the message even before logging is configured.
    print(_msg)

    # And via logging for normal operation.
    _logger.info(_msg)

    def _configure_client(self, api_key, for_live=False):
        # The google-genai package has changed, and genai.configure() is no longer available
        # Instead, we need to create a client instance with the API key
        if not api_key and not os.getenv("REACT_APP_GEMINI_API_KEY"):
            raise ValueError("REACT_APP_GEMINI_API_KEY not set and no API key provided to GeminiProvider.")
        
        # Use the API key from the parameter or environment
        client_api_key = api_key or os.getenv("REACT_APP_GEMINI_API_KEY")
        
        # For Live API, the public preview is now served via API version v1beta.
        # Note: We keep the "for_live" flag so call sites can explicitly request
        # the websocket-compatible client if needed, but we switch to v1beta to
        # unlock new capabilities (thinking, native-audio, etc.).
        if for_live:
            return genai.Client(api_key=client_api_key, http_options={"api_version": "v1beta"})
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
                        bio = NamedBytesIO(resp.content, mime_type)
                        uploaded_file = client.files.upload(
                            file=bio,
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