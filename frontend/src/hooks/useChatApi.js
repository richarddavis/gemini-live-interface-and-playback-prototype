import { useState, useCallback } from 'react';

export function useChatApi(apiUrl) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper function to get authenticated headers
  const getAuthenticatedFetchOptions = useCallback((options = {}) => {
    return {
      ...options,
      credentials: 'include', // Include session cookies
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };
  }, []);

  const fetchChatSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/chat_sessions`, getAuthenticatedFetchOptions());
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required');
        }
        throw new Error('Failed to fetch chat sessions');
      }
      return await response.json();
    } catch (error) {
      setError(error.message);
      console.error("Error fetching chat sessions:", error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, getAuthenticatedFetchOptions]);

  const createChatSession = useCallback(async (provider = 'openai') => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/chat_sessions`, getAuthenticatedFetchOptions({ 
        method: 'POST',
        body: JSON.stringify({ provider })
      }));
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required to create chat session');
        }
        throw new Error('Failed to create new chat session');
      }
      return await response.json();
    } catch (error) {
      setError(error.message);
      console.error("Error creating chat session:", error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, getAuthenticatedFetchOptions]);

  const fetchSessionMessages = useCallback(async (sessionId) => {
    if (!sessionId) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/chat_sessions/${sessionId}/messages`, getAuthenticatedFetchOptions());
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required');
        }
        throw new Error('Failed to fetch messages for session');
      }
      return await response.json();
    } catch (error) {
      setError(error.message);
      console.error(`Error fetching messages for session ${sessionId}:`, error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, getAuthenticatedFetchOptions]);

  const uploadFile = useCallback(async (file) => {
    if (!file) return null;
    
    setIsLoading(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('file', file);
    
    console.log('Uploading file:', file.name, 'type:', file.type);
    
    try {
      console.log('Upload request to:', `${apiUrl}/uploads`);
      const response = await fetch(`${apiUrl}/uploads`, {
        method: 'POST',
        credentials: 'include', // Include session cookies
        body: formData,
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required to upload files');
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload file');
      }
      
      const data = await response.json();
      console.log('Upload response:', data);
      return data;
    } catch (error) {
      console.error("Error uploading file:", error);
      setError(error.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  const streamMessageToLLM = useCallback((sessionId, messageObj, apiKey, provider, { onChunk, onComplete, onError }) => {
    if (!sessionId || (!apiKey && provider !== 'gemini')) {
      const errMsg = 'Missing required parameters for sending message';
      setError(errMsg);
      if (onError) onError(new Error(errMsg));
      return;
    }
    
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({ provider });
    if (apiKey) params.append('api_key', apiKey);
    
    // messageObj is expected to be { text, media_url, media_type }
    if (messageObj.text) params.append('text', messageObj.text);
    if (messageObj.media_url) params.append('media_url', messageObj.media_url);
    if (messageObj.media_type) params.append('media_type', messageObj.media_type);
    
    console.log('Streaming message data:', messageObj);
    
    const eventSourceUrl = `${apiUrl}/chat_sessions/${sessionId}/respond_llm_stream?${params.toString()}`;
    console.log('Event source URL:', eventSourceUrl);
    
    // EventSource automatically includes credentials if same-origin
    const es = new EventSource(eventSourceUrl, {
      withCredentials: true // Ensure credentials are included for cross-origin requests
    });

    // Set a safety timeout in case the stream doesn't close properly
    const safetyTimeout = setTimeout(() => {
      console.log('Safety timeout reached, forcing stream close');
      es.close();
      setIsLoading(false);
      if (onComplete) onComplete();
    }, 60000); // 60 seconds timeout
    
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Stream message received:', data);
        
        if (data.delta) {
          if (onChunk) onChunk(data.delta);
        } else if (data.done) {
          console.log('Stream completed successfully');
          clearTimeout(safetyTimeout);
          es.close();
          setIsLoading(false);
          if (onComplete) {
            // Small delay to ensure UI updates correctly
            setTimeout(() => {
              onComplete();
            }, 100);
          }
        } else if (data.error) {
          console.error('Stream error:', data.error);
          clearTimeout(safetyTimeout);
          const err = new Error(data.error);
          setError(err.message);
          if (onError) onError(err);
          es.close();
          setIsLoading(false);
        }
      } catch (e) {
        console.error('Error parsing stream data:', e);
        clearTimeout(safetyTimeout);
        const err = new Error('Failed to parse stream data: ' + e.message);
        setError(err.message);
        if (onError) onError(err);
        es.close();
        setIsLoading(false);
      }
    };

    es.onerror = (event) => {
      console.error('EventSource error:', event);
      clearTimeout(safetyTimeout);
      
      if (es.readyState === EventSource.CLOSED) {
        if (isLoading) {
            // Sometimes when images are involved, the stream might close 
            // successfully but without sending the final 'done' event
            console.log('Stream closed, treating as complete');
            setIsLoading(false);
            if (onComplete) onComplete();
        }
      } else {
        const errMsg = 'Streaming connection error.';
        setError(errMsg);
        if (onError) onError(new Error(errMsg));
        es.close();
        setIsLoading(false);
      }
    };
    
    return es;

  }, [apiUrl, setIsLoading, setError, isLoading]);

  return {
    isLoading,
    error,
    fetchChatSessions,
    createChatSession,
    fetchSessionMessages,
    uploadFile,
    streamMessageToLLM,
  };
} 