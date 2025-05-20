import { useState, useCallback } from 'react';

export function useChatApi(apiUrl) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchChatSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/chat_sessions`);
      if (!response.ok) throw new Error('Failed to fetch chat sessions');
      return await response.json();
    } catch (error) {
      setError(error.message);
      console.error("Error fetching chat sessions:", error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  const createChatSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/chat_sessions`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to create new chat session');
      return await response.json();
    } catch (error) {
      setError(error.message);
      console.error("Error creating chat session:", error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  const fetchSessionMessages = useCallback(async (sessionId) => {
    if (!sessionId) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/chat_sessions/${sessionId}/messages`);
      if (!response.ok) throw new Error('Failed to fetch messages for session');
      return await response.json();
    } catch (error) {
      setError(error.message);
      console.error(`Error fetching messages for session ${sessionId}:`, error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  const streamMessageToLLM = useCallback((sessionId, text, apiKey, provider, { onChunk, onComplete, onError }) => {
    if (!sessionId || !text || !apiKey) {
      const errMsg = 'Missing required parameters for sending message';
      setError(errMsg);
      if (onError) onError(new Error(errMsg));
      return;
    }
    
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({
      text,
      api_key: apiKey,
      provider,
    });
    const eventSourceUrl = `${apiUrl}/chat_sessions/${sessionId}/respond_llm_stream?${params.toString()}`;
    
    const es = new EventSource(eventSourceUrl);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.delta) {
          if (onChunk) onChunk(data.delta);
        } else if (data.done) {
          es.close();
          setIsLoading(false);
          if (onComplete) onComplete();
        } else if (data.error) {
          const err = new Error(data.error);
          setError(err.message);
          if (onError) onError(err);
          es.close();
          setIsLoading(false);
        }
      } catch (e) {
        const err = new Error('Failed to parse stream data: ' + e.message);
        setError(err.message);
        if (onError) onError(err);
        es.close();
        setIsLoading(false);
      }
    };

    es.onerror = (event) => {
      if (es.readyState === EventSource.CLOSED) {
        if (isLoading) {
            const errMsg = 'Streaming connection closed unexpectedly.';
            setError(errMsg);
            if (onError) onError(new Error(errMsg));
        }
      } else {
        const errMsg = 'Streaming connection error.';
        setError(errMsg);
        if (onError) onError(new Error(errMsg));
      }
      es.close();
      setIsLoading(false);
    };
    
    return es;

  }, [apiUrl, setIsLoading, setError]);

  return {
    isLoading,
    error,
    fetchChatSessions,
    createChatSession,
    fetchSessionMessages,
    streamMessageToLLM,
  };
} 