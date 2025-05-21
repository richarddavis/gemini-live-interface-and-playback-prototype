import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001'; // Ensure this points to your backend

function LiveInteraction({ apiKey }) { // Add apiKey prop
  const videoRef = useRef(null);
  const socketRef = useRef(null);
  const [geminiTextResponse, setGeminiTextResponse] = useState('');
  const [error, setError] = useState(null);
  const [isSessionStarted, setIsSessionStarted] = useState(false);

  useEffect(() => {
    console.log('LiveInteraction useEffect: Starting setup...');
    let mediaStream;
    let socket;

    const setupLiveInteraction = async () => {
      console.log('LiveInteraction setupLiveInteraction: Attempting to start media stream...');
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          console.log('LiveInteraction setupLiveInteraction: Media stream started successfully.');
        }
      } catch (err) {
        console.error('LiveInteraction setupLiveInteraction: Error accessing media devices:', err);
        setError('Error accessing media devices: ' + err.message);
        // Propagate the error or handle it such that the component doesn't proceed
        return; // Stop execution if media stream fails
      }

      console.log('LiveInteraction setupLiveInteraction: Initializing Socket.IO...');
      // Initialize and connect Socket.IO
      const socketURL = SOCKET_URL.endsWith('/api') 
        ? SOCKET_URL.replace('/api', '') 
        : SOCKET_URL;
      
      console.log('Connecting to Socket.IO at:', socketURL);
      
      socket = io(`${socketURL}/live`, {
        reconnectionAttempts: 3,
        path: '/socket.io', // Explicit path
        transports: ['polling', 'websocket'],
        // Set autoConnect to false so we can control reconnection behavior
        autoConnect: true,
        // Disable automatic reconnection when we manually disconnect
        reconnection: true
      });
      socketRef.current = socket; // Store the socket instance in the ref

      socket.on('connect', () => {
        console.log('Socket connected to /live namespace');
        setError(null);
        // Once connected, if API key is available, try to start Gemini session
        if (apiKey) {
          socket.emit('start_gemini_session', { apiKey });
        } else {
          setError('API Key not provided. Cannot start Gemini session.');
          console.error('API Key not provided.');
        }
      });

      socket.on('gemini_session_started', (data) => {
        console.log('Gemini session started:', data.message);
        setIsSessionStarted(true);
        setError(null); // Clear previous errors
        setGeminiTextResponse(''); // Clear previous responses
      });

      socket.on('gemini_text_response', (data) => {
        console.log('Gemini text response:', data.text);
        setGeminiTextResponse(prevText => prevText + data.text);
      });

      socket.on('gemini_audio_response', (data) => {
        console.log('Gemini audio response received');
        // Placeholder for handling audio playback
      });

      socket.on('gemini_error', (data) => {
        console.error('Gemini error:', data.error);
        setError(`Gemini Error: ${data.error}`);
        setIsSessionStarted(false);
        // Optionally disconnect socket on Gemini error if it's non-recoverable
        if (socketRef.current) {
            socketRef.current.disconnect();
        }
      });

      socket.on('disconnect', (reason) => {
        console.log('Socket disconnected from /live:', reason);
        setIsSessionStarted(false);
        // Note: Socket.IO client will attempt to reconnect by default
      });

      socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        setError(`Connection Error: ${err.message}. Ensure backend is running.`);
        setIsSessionStarted(false);
        // Optionally disconnect socket on connection error
         if (socketRef.current) {
            socketRef.current.disconnect();
        }
      });
       console.log('LiveInteraction setupLiveInteraction: Socket.IO listeners set.');

    };

    setupLiveInteraction(); // Call the async setup function

    return () => {
      console.log('LiveInteraction useEffect cleanup: Running cleanup...');
      // Stop the media stream
      if (mediaStream) {
        console.log('LiveInteraction cleanup: Stopping media stream tracks.');
        mediaStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (err) {
            console.error('Error stopping media track:', err);
          }
        });
      }
      
      // Disconnect and clean up the socket when the component unmounts
      if (socketRef.current) {
        console.log('LiveInteraction cleanup: Disconnecting and cleaning up socket...');
        try {
          // Disable reconnection attempts before disconnecting
          if (socketRef.current.io) {
            socketRef.current.io.reconnection(false);
            socketRef.current.io.opts.reconnection = false;
          }
          
          // Remove all event listeners
          socketRef.current.removeAllListeners();
          
          // Close and cleanup
          socketRef.current.disconnect();
          
          // Don't try to close it again if it's already closed
          if (socketRef.current.connected) {
            socketRef.current.close();
          }
        } catch (err) {
          console.error('Error during socket cleanup:', err);
        } finally {
          socketRef.current = null; // Nullify the ref
        }
      }
      setIsSessionStarted(false);
    };
  // The effect should re-run if apiKey changes, prompting a new connection
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]); // Dependency array includes apiKey

  // TODO: Add functions to send audio and text to the backend
  // const sendAudioChunk = (chunk) => {
  //   if (socketRef.current && socketRef.current.connected && isSessionStarted) {
  //     socketRef.current.emit('client_audio_input', { audio: chunk });
  //   }
  // };

  // const sendTextInput = (text) => {
  //   if (socketRef.current && socketRef.current.connected && isSessionStarted) {
  //     socketRef.current.emit('client_text_input', { text: text, end_of_turn: true });
  //     setGeminiTextResponse(''); // Optionally clear local response on new input
  //   }
  // };

  return (
    <div className="live-interaction-container">
      <h2>Live Interaction</h2>
      <video ref={videoRef} autoPlay playsInline muted className="user-video-feed"></video>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {!isSessionStarted && !error && <p>Connecting to Gemini...</p>}
      {isSessionStarted && <p>Gemini session active.</p>}
      <div className="gemini-text-output">
        <p><strong>Gemini:</strong> {geminiTextResponse}</p>
      </div>
      {/* TODO: Add input field for text and button to send */}
      {/* TODO: Add controls for microphone (start/stop sending audio) */}
    </div>
  );
}

export default LiveInteraction; 