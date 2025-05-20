import openai
from .base import LLMProvider

class OpenAIProvider(LLMProvider):
    def get_response(self, messages, api_key, **kwargs):
        # Create a client instance with the API key instead of setting it globally
        client = openai.OpenAI(api_key=api_key)
        model = kwargs.get('model', 'gpt-4o')
        
        # Convert messages to handle multimodal content
        api_messages = []
        for msg in messages:
            role = msg.get('role')
            content_items = []
            
            # Check if there's text content
            if msg.get('content'):
                if msg.get('media_url') and msg.get('media_type'):
                    # This is a multimodal message with both text and image
                    # For data URLs, we can pass them directly
                    content_items = [
                        {"type": "text", "text": msg.get('content')},
                        {"type": "image_url", "image_url": {"url": msg.get('media_url')}}
                    ]
                else:
                    # Text-only message
                    content_items = msg.get('content')
            elif msg.get('media_url') and msg.get('media_type'):
                # Image-only message
                # For data URLs, we can pass them directly
                content_items = [
                    {"type": "image_url", "image_url": {"url": msg.get('media_url')}}
                ]
            
            if isinstance(content_items, list):
                api_messages.append({"role": role, "content": content_items})
            else:
                api_messages.append({"role": role, "content": content_items})
        
        response = client.chat.completions.create(
            model=model,
            messages=api_messages,
            temperature=kwargs.get('temperature', 0.7),
            max_tokens=kwargs.get('max_tokens', 2048),
        )
        return response.choices[0].message.content.strip()

    def stream_response(self, messages, api_key, **kwargs):
        print("[DEBUG] OpenAIProvider.stream_response called")
        client = openai.OpenAI(api_key=api_key)
        model = kwargs.get('model', 'gpt-4o')
        
        # Convert messages to handle multimodal content
        api_messages = []
        for msg in messages:
            role = msg.get('role')
            content_items = []
            
            # Check if there's text content
            if msg.get('content'):
                if msg.get('media_url') and msg.get('media_type'):
                    # This is a multimodal message with both text and image
                    # For data URLs, we can pass them directly
                    print(f"[DEBUG] Message has text and image: {msg.get('content')[:50]}... and {msg.get('media_url')[:50]}...")
                    content_items = [
                        {"type": "text", "text": msg.get('content')},
                        {"type": "image_url", "image_url": {"url": msg.get('media_url')}}
                    ]
                else:
                    # Text-only message
                    print(f"[DEBUG] Text-only message: {msg.get('content')[:50]}...")
                    content_items = msg.get('content')
            elif msg.get('media_url') and msg.get('media_type'):
                # Image-only message
                # For data URLs, we can pass them directly
                print(f"[DEBUG] Image-only message: {msg.get('media_url')[:50]}...")
                content_items = [
                    {"type": "image_url", "image_url": {"url": msg.get('media_url')}}
                ]
            else:
                print(f"[DEBUG] Message has no content or media: {msg}")
                continue  # Skip this message
            
            if isinstance(content_items, list):
                api_messages.append({"role": role, "content": content_items})
            else:
                api_messages.append({"role": role, "content": content_items})
        
        print(f"[DEBUG] Final API message count: {len(api_messages)}")
        try:
            print(f"[DEBUG] Creating completion with model: {model}")
            stream = client.chat.completions.create(
                model=model,
                messages=api_messages,
                temperature=kwargs.get('temperature', 0.7),
                max_tokens=kwargs.get('max_tokens', 2048),
                stream=True,
            )
            
            for chunk in stream:
                if hasattr(chunk.choices[0].delta, 'content') and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            print(f"[DEBUG] OpenAI API error: {str(e)}")
            import traceback
            traceback.print_exc()
            raise 