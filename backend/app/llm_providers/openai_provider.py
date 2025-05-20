import openai
from .base import LLMProvider

class OpenAIProvider(LLMProvider):
    def get_response(self, messages, api_key, **kwargs):
        # Create a client instance with the API key instead of setting it globally
        client = openai.OpenAI(api_key=api_key)
        model = kwargs.get('model', 'gpt-4o')
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=kwargs.get('temperature', 0.7),
            max_tokens=kwargs.get('max_tokens', 2048),
        )
        return response.choices[0].message.content.strip()

    def stream_response(self, messages, api_key, **kwargs):
        client = openai.OpenAI(api_key=api_key)
        model = kwargs.get('model', 'gpt-4o')
        stream = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=kwargs.get('temperature', 0.7),
            max_tokens=kwargs.get('max_tokens', 2048),
            stream=True,
        )
        for chunk in stream:
            if hasattr(chunk.choices[0].delta, 'content') and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content 