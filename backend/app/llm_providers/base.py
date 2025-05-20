from abc import ABC, abstractmethod

class LLMProvider(ABC):
    @abstractmethod
    def get_response(self, messages, api_key, **kwargs):
        """
        messages: list of dicts, e.g. [{"role": "user", "content": "Hi"}, ...]
        api_key: str
        kwargs: any additional provider-specific params
        Returns: string (the model's response)
        """
        pass 