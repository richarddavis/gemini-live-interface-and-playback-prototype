import React, { useState, useEffect, useRef, useCallback } from 'react';
import './LiveChatEnhanced.css';

const LiveChatEnhanced = () => {
  // Live API session
  const [sessionId, setSessionId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  // Media state
  const [hasCamera, setHasCamera] = useState(false);
  const [hasMicrophone, setHasMicrophone] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [mediaStream, setMediaStream] = useState(null);

  // Messages and responses
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');

  // Configuration
  const [config, setConfig] = useState({
    voice_name: 'Aoede',
    system_instruction: 'You are a helpful AI assistant that can see through the user\'s camera and hear through their microphone. Respond naturally and conversationally.'
  });

  // Refs for media elements and cleanup
  const videoRef = useRef(null);
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const frameIntervalRef = useRef(null);

  // Refs for cleanup (to avoid stale closures)
  const sessionIdRef = useRef(null);
  const mediaStreamRef = useRef(null);

  // API URL and backend configuration
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

  // Define addMessage first (before any functions that use it)
  const addMessage = useCallback((message) => {
    setMessages(prev => [...prev, {
      ...message,
      timestamp: Date.now(),
      id: `msg-${Date.now()}-${Math.random()}`
    }]);
  }, []);

  // Media stream cleanup function
  const stopMediaStreams = useCallback(() => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }

    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [mediaStream]);

  // Stop session function using backend
  const stopSession = useCallback(async () => {
    if (!sessionId) return;

    try {
      console.log('Stopping session:', sessionId);
      
      // Stop media streams first
      stopMediaStreams();
      
      // Call backend to end session using the correct endpoint format
      await fetch(`${API_URL}/live/session/${sessionId}/end`, {
        method: 'POST'
      });

      addMessage({
        type: 'system',
        content: '📴 Live AI session ended.'
      });
    } catch (error) {
      console.error('Error stopping session:', error);
      addMessage({
        type: 'error',
        content: `Error stopping session: ${error.message}`
      });
    } finally {
      setSessionId(null);
      setIsConnected(false);
    }
  }, [sessionId, API_URL, addMessage, stopMediaStreams]);

  // Update refs when values change
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    mediaStreamRef.current = mediaStream;
  }, [mediaStream]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Check media availability and setup cleanup
  useEffect(() => {
    const checkMediaAvailability = async () => {
      try {
        // Check camera
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        setHasCamera(true);
        videoStream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.log('Camera not available:', error);
        setHasCamera(false);
      }

      try {
        // Check microphone
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasMicrophone(true);
        audioStream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.log('Microphone not available:', error);
        setHasMicrophone(false);
      }
    };

    checkMediaAvailability();
    
    // Cleanup on unmount only (not when stopSession changes)
    return () => {
      // Use refs to get current values and clean up manually
      // This prevents the dependency cycle that was causing immediate session end
      const currentSessionId = sessionIdRef.current;
      const currentMediaStream = mediaStreamRef.current;
      
      if (currentSessionId) {
        stopSession();
      }
      
      if (currentMediaStream) {
        currentMediaStream.getTracks().forEach(track => track.stop());
      }
      
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
      
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only runs on mount/unmount

  // Real Live API session creation using backend
  const startSession = async () => {
    setIsConnecting(true);
    setConnectionError(null);

    try {
      // Configure session parameters
      const sessionConfig = {
        session_type: cameraEnabled && microphoneEnabled ? 'multimodal' : 
                     cameraEnabled ? 'camera' : 
                     microphoneEnabled ? 'audio' : 'text',
        voice_name: config.voice_name,
        system_instruction: config.system_instruction
      };

      // Create session via backend
      const response = await fetch(`${API_URL}/live/start-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sessionConfig)
      });

      if (response.ok) {
        const sessionData = await response.json();
        setSessionId(sessionData.session_id);
        setIsConnected(true);
        
        addMessage({
          type: 'system',
          content: '✅ Connected to Live AI! You can now communicate via text, voice, or camera.'
        });

        // Start media streams if camera/microphone are enabled
        if (cameraEnabled || microphoneEnabled) {
          await startMediaStreams();
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to start session:', error);
      setConnectionError(error.message);
      addMessage({
        type: 'error',
        content: `Failed to start session: ${error.message}`
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const startMediaStreams = async () => {
    try {
      const constraints = {
        video: cameraEnabled && hasCamera,
        audio: microphoneEnabled && hasMicrophone
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setMediaStream(stream);

      // Display video
      if (videoRef.current && cameraEnabled) {
        videoRef.current.srcObject = stream;
      }

      // Start sending video frames to Live API
      if (cameraEnabled) {
        startVideoFrameCapture();
      }

      // Start audio streaming to Live API
      if (microphoneEnabled) {
        startAudioCapture(stream);
      }

      addMessage({
        type: 'system',
        content: `🎥 Media streaming started: ${cameraEnabled ? 'Camera ' : ''}${microphoneEnabled ? 'Microphone' : ''}`
      });

    } catch (error) {
      console.error('Error starting media streams:', error);
      addMessage({
        type: 'error',
        content: `Media access error: ${error.message}`
      });
    }
  };

  const startVideoFrameCapture = () => {
    if (!videoRef.current || !cameraEnabled) return;

    // Send a frame every 2 seconds to Live API
    frameIntervalRef.current = setInterval(() => {
      captureAndSendFrame();
    }, 2000);
  };

  const captureAndSendFrame = () => {
    if (!videoRef.current || !cameraEnabled) return;

    try {
      // Create canvas and capture frame
      const canvas = document.createElement('canvas');
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      
      // Convert to base64
      canvas.toDataURL('image/jpeg', 0.8);
      
      // TODO: Send frame to backend for Live API processing
      // This would need to be implemented in the backend
      
    } catch (error) {
      console.error('Error capturing frame:', error);
    }
  };

  const startAudioCapture = (stream) => {
    try {
      // Create audio-only stream to avoid conflicts with video tracks
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.warn('No audio tracks available in stream');
        return;
      }

      // Create a new stream with only audio tracks
      const audioOnlyStream = new MediaStream(audioTracks);

      // List of audio MIME types to try, in order of preference
      const audioMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4',
        'audio/mpeg',
        'audio/wav'
      ];

      // Find the first supported MIME type
      let supportedMimeType = null;
      for (const mimeType of audioMimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          supportedMimeType = mimeType;
          break;
        }
      }

      if (!supportedMimeType) {
        console.warn('No supported audio MIME type found, using default');
        supportedMimeType = undefined;
      }

      // Create MediaRecorder with audio-only stream
      const mediaRecorder = new MediaRecorder(audioOnlyStream, 
        supportedMimeType ? { mimeType: supportedMimeType } : {}
      );

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // 100ms chunks for real-time

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          // TODO: Send audio data to backend for Live API processing
          // This would need to be implemented in the backend
        }
      };

      mediaRecorder.onerror = (error) => {
        console.error('MediaRecorder error:', error);
        addMessage({
          type: 'error',
          content: `Audio recording error: ${error.error || error.message}`
        });
      };

      addMessage({
        type: 'system',
        content: `🎤 Audio capture started using codec: ${supportedMimeType || 'default'}`
      });

    } catch (error) {
      console.error('Error starting audio capture:', error);
      addMessage({
        type: 'error',
        content: `Failed to start audio recording: ${error.message}. Your browser may not support audio recording.`
      });
    }
  };

  // Send message function using backend
  const sendMessage = async () => {
    if (!currentMessage.trim() || !sessionId) return;

    const userMessage = currentMessage.trim();
    setCurrentMessage('');

    // Add user message to chat
    addMessage({
      type: 'user',
      content: userMessage
    });

    try {
      // Send message to backend for processing
      const response = await fetch(`${API_URL}/live/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: userMessage
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Add AI response to chat
        if (data.response) {
          addMessage({
            type: 'assistant',
            content: data.response
          });
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
      
    } catch (error) {
      console.error('Error sending message:', error);
      addMessage({
        type: 'error',
        content: `Failed to send message: ${error.message}`
      });
    }
  };

  const toggleCamera = async () => {
    if (!hasCamera) return;

    const newState = !cameraEnabled;
    setCameraEnabled(newState);

    if (isConnected) {
      if (newState) {
        // Start camera if session is active
        await startMediaStreams();
      } else {
        // Stop camera but keep microphone if active
        if (mediaStream) {
          const videoTracks = mediaStream.getVideoTracks();
          videoTracks.forEach(track => track.stop());
        }
        if (frameIntervalRef.current) {
          clearInterval(frameIntervalRef.current);
          frameIntervalRef.current = null;
        }
      }
    }
  };

  const toggleMicrophone = async () => {
    if (!hasMicrophone) return;

    const newState = !microphoneEnabled;
    setMicrophoneEnabled(newState);

    if (isConnected) {
      if (newState) {
        // Start microphone if session is active
        await startMediaStreams();
      } else {
        // Stop microphone but keep camera if active
        if (mediaStream) {
          const audioTracks = mediaStream.getAudioTracks();
          audioTracks.forEach(track => track.stop());
        }
        if (mediaRecorderRef.current) {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current = null;
        }
      }
    }
  };

  return (
    <div className="live-chat-enhanced">
      <div className="live-chat-header">
        <h2>🤖 Live AI Chat</h2>
        <div className="connection-status">
          {isConnected ? (
            <span className="status-connected">🟢 Connected</span>
          ) : (
            <span className="status-disconnected">🔴 Disconnected</span>
          )}
        </div>
      </div>

      {/* Media Controls */}
      <div className="media-controls">
        <div className="media-section">
          <h3>📷 Camera & 🎤 Microphone</h3>
          <div className="control-buttons">
            <button
              className={`media-btn ${cameraEnabled ? 'active' : ''}`}
              onClick={toggleCamera}
              disabled={!hasCamera || isConnecting}
              title={hasCamera ? 'Toggle camera' : 'Camera not available'}
            >
              📷 {cameraEnabled ? 'Camera ON' : 'Camera OFF'}
            </button>
            
            <button
              className={`media-btn ${microphoneEnabled ? 'active' : ''}`}
              onClick={toggleMicrophone}
              disabled={!hasMicrophone || isConnecting}
              title={hasMicrophone ? 'Toggle microphone' : 'Microphone not available'}
            >
              🎤 {microphoneEnabled ? 'Mic ON' : 'Mic OFF'}
            </button>
          </div>
        </div>

        {/* Video Display */}
        {cameraEnabled && (
          <div className="video-section">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="camera-feed"
              style={{ width: '300px', height: '200px', backgroundColor: '#000' }}
            />
            <p className="video-caption">Your camera feed (AI can see this)</p>
          </div>
        )}
      </div>

      {/* Session Controls */}
      <div className="session-controls">
        {!isConnected ? (
          <button
            className="start-session-btn"
            onClick={startSession}
            disabled={isConnecting}
          >
            {isConnecting ? '🔄 Connecting...' : '🚀 Start Live AI Session'}
          </button>
        ) : (
          <button
            className="stop-session-btn"
            onClick={stopSession}
          >
            ⏹ End Session
          </button>
        )}
      </div>

      {/* Connection Error */}
      {connectionError && (
        <div className="connection-error">
          ❌ {connectionError}
        </div>
      )}

      {/* Messages */}
      <div className="messages-container">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.type}`}>
            <div className="message-content">
              {message.type === 'system' && '🔧 '}
              {message.type === 'user' && '👤 '}
              {message.type === 'assistant' && '🤖 '}
              {message.type === 'error' && '❌ '}
              {message.content}
            </div>
            <div className="message-time">
              {new Date(message.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Text Input */}
      {isConnected && (
        <div className="text-input-section">
          <MessageInputForm 
            onSend={sendMessage} 
            disabled={false}
            currentMessage={currentMessage}
            setCurrentMessage={setCurrentMessage}
          />
        </div>
      )}

      {/* Configuration */}
      <div className="config-section">
        <details>
          <summary>⚙️ Configuration</summary>
          <div className="config-options">
            <div className="config-group">
              <label>Voice:</label>
              <select
                value={config.voice_name}
                onChange={(e) => setConfig(prev => ({ ...prev, voice_name: e.target.value }))}
                disabled={isConnected}
              >
                <option value="Aoede">Aoede (Female)</option>
                <option value="Charon">Charon (Male)</option>
                <option value="Kore">Kore (Female)</option>
                <option value="Fenrir">Fenrir (Male)</option>
              </select>
            </div>
            
            <div className="config-group">
              <label>System Instruction:</label>
              <textarea
                value={config.system_instruction}
                onChange={(e) => setConfig(prev => ({ ...prev, system_instruction: e.target.value }))}
                disabled={isConnected}
                rows={3}
              />
            </div>
          </div>
        </details>
      </div>
    </div>
  );
};

// Simple message input component
const MessageInputForm = ({ onSend, disabled, currentMessage, setCurrentMessage }) => {
  return (
    <div className="message-input-form">
      <input
        type="text"
        value={currentMessage}
        onChange={(e) => setCurrentMessage(e.target.value)}
        placeholder="Type your message..."
        disabled={disabled}
        onKeyPress={(e) => e.key === 'Enter' && onSend()}
      />
      <button onClick={onSend} disabled={disabled || !currentMessage.trim()}>
        Send
      </button>
    </div>
  );
};

export default LiveChatEnhanced; 