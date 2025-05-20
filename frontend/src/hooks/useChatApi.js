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

  const sendMessageToLLM = useCallback(async (sessionId, text, apiKey, provider) => {
    if (!sessionId || !text || !apiKey) {
      setError('Missing required parameters for sending message');
      return null;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/chat_sessions/${sessionId}/respond_llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, api_key: apiKey, provider }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response from LLM provider');
      }
      return await response.json();
    } catch (error) {
      setError(error.message);
      console.error("Error sending message to LLM:", error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  return {
    isLoading,
    error,
    fetchChatSessions,
    createChatSession,
    fetchSessionMessages,
    sendMessageToLLM,
  };
} 