import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

export function useSocketIO(socketUrl) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionConfig, setSessionConfig] = useState(null);
  const socketRef = useRef(null);
  const messageHandlersRef = useRef({});

  // Connect to the Socket.IO server
  useEffect(() => {
    if (!socketUrl) return;

    // Create the socket connection
    socketRef.current = io(socketUrl, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      autoConnect: true,
      transports: ['websocket']
    });

    // Set up event handlers
    socketRef.current.on('connect', () => {
      console.log('Socket.IO connected');
      setIsConnected(true);
      setError(null);
    });

    socketRef.current.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
      setIsConnected(false);
      setIsSessionActive(false);
      setSessionConfig(null);
    });

    socketRef.current.on('connect_error', (err) => {
      console.error('Socket.IO connection error:', err);
      setError(`Connection error: ${err.message}`);
      setIsConnected(false);
      setIsSessionActive(false);
    });

    socketRef.current.on('error', (data) => {
      console.error('Socket.IO error:', data);
      setError(data.message || 'Unknown socket error');
    });

    // Event for connection status
    socketRef.current.on('status', (data) => {
      console.log('Socket.IO status:', data);
    });

    // Return cleanup function
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      setIsSessionActive(false);
      setSessionConfig(null);
    };
  }, [socketUrl]);

  // Initialize a Live API session
  const initializeSession = useCallback((sessionData) => {
    if (!socketRef.current || !isConnected) {
      setError('Socket is not connected');
      return false;
    }

    // Register event handlers for Live API session
    socketRef.current.on('connected', (data) => {
      console.log('Live API session connected:', data);
      setIsSessionActive(true);
      setSessionConfig(data.config);
      
      // Call the onStart handler if it exists
      if (messageHandlersRef.current.onStart) {
        messageHandlersRef.current.onStart(data);
      }
    });

    socketRef.current.on('text_chunk', (data) => {
      if (messageHandlersRef.current.onTextChunk) {
        messageHandlersRef.current.onTextChunk(data.chunk);
      }
    });

    socketRef.current.on('audio_chunk', (data) => {
      if (messageHandlersRef.current.onAudioChunk) {
        messageHandlersRef.current.onAudioChunk(data.chunk, data.mime_type);
      }
    });

    socketRef.current.on('transcript', (data) => {
      if (messageHandlersRef.current.onTranscript) {
        messageHandlersRef.current.onTranscript(data.text);
      }
    });

    socketRef.current.on('turn_complete', (data) => {
      if (messageHandlersRef.current.onComplete) {
        messageHandlersRef.current.onComplete(data);
      }
    });

    socketRef.current.on('session_ended', (data) => {
      console.log('Live API session ended:', data);
      setIsSessionActive(false);
      setSessionConfig(null);
      
      if (messageHandlersRef.current.onEnd) {
        messageHandlersRef.current.onEnd(data);
      }
    });

    // Send initialization request
    console.log('Initializing Live API session:', sessionData);
    socketRef.current.emit('initialize_live_session', sessionData);
    
    return true;
  }, [isConnected]);

  // Send a text message to the Live API
  const sendText = useCallback((text) => {
    if (!socketRef.current || !isSessionActive) {
      setError('No active session');
      return false;
    }

    socketRef.current.emit('send_text', {
      sid: socketRef.current.id,
      text
    });
    
    return true;
  }, [isSessionActive]);

  // Send audio data to the Live API
  const sendAudio = useCallback((audioData, endOfSpeech = false) => {
    if (!socketRef.current || !isSessionActive) {
      setError('No active session');
      return false;
    }

    socketRef.current.emit('send_audio', {
      sid: socketRef.current.id,
      audio_data: audioData,
      end_of_speech: endOfSpeech
    });
    
    return true;
  }, [isSessionActive]);

  // Send media (image or video) to the Live API
  const sendMedia = useCallback((url, mediaType, text = '') => {
    if (!socketRef.current || !isSessionActive) {
      setError('No active session');
      return false;
    }

    socketRef.current.emit('send_media', {
      sid: socketRef.current.id,
      url,
      media_type: mediaType,
      text
    });
    
    return true;
  }, [isSessionActive]);

  // End the Live API session
  const endSession = useCallback(() => {
    if (!socketRef.current || !isSessionActive) {
      return false;
    }

    socketRef.current.emit('end_session', {
      sid: socketRef.current.id
    });
    
    return true;
  }, [isSessionActive]);

  // Set message handlers
  const setHandlers = useCallback((handlers) => {
    messageHandlersRef.current = handlers;
  }, []);

  return {
    isConnected,
    error,
    isSessionActive,
    sessionConfig,
    initializeSession,
    sendText,
    sendAudio,
    sendMedia,
    endSession,
    setHandlers
  };
} 