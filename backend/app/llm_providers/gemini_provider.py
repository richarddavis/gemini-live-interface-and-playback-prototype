from .base import LLMProvider

class GeminiProvider(LLMProvider):
    def get_response(self, messages, api_key, **kwargs):
        # TODO: Implement Gemini API call
        return "[Gemini integration not implemented yet]" 