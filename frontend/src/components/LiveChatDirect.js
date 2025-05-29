import React, { useState, useEffect, useRef, useCallback } from 'react';
import './LiveChatDirect.css';

/**
 * Direct Google Live API Integration Component
 * 
 * This component connects directly to Google's Live API WebSocket endpoint
 * using the same approach as their official console, but integrated into our app.
 */
const LiveChatDirect = () => {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  
  // Media state
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [videoStream, setVideoStream] = useState(null);
  const [audioRecorder, setAudioRecorder] = useState(null);
  
  // Messages and AI responses
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  
  // Configuration
  const [voiceName, setVoiceName] = useState('Puck');
  const [systemInstruction, setSystemInstruction] = useState('You are a helpful AI assistant. Respond naturally and conversationally.');
  
  // Refs
  const wsRef = useRef(null);
  const videoRef = useRef(null);
  const audioContextRef = useRef(null);
  const messagesEndRef = useRef(null);
  
  // API Configuration
  const API_KEY = process.env.REACT_APP_GOOGLE_AI_STUDIO_API_KEY || 'AIzaSyAof56iear1iUvaJB-3UhRZtHy2ehT3c8U';
  const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
  
  // Voice options
  const voiceOptions = [
    { value: 'Puck', label: 'Puck (Young Male)' },
    { value: 'Charon', label: 'Charon (Middle-aged Male)' },
    { value: 'Kore', label: 'Kore (Young Female)' },
    { value: 'Fenrir', label: 'Fenrir (Young Male)' },
    { value: 'Aoede', label: 'Aoede (Young Female)' }
  ];

  const addMessage = useCallback((type, content, timestamp = new Date()) => {
    setMessages(prev => [...prev, { type, content, timestamp }]);
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // WebSocket connection management
  const connectToLiveAPI = useCallback(async () => {
    if (isConnecting || isConnected) return;
    
    setIsConnecting(true);
    setConnectionStatus('Connecting...');
    addMessage('system', 'Connecting to Google Live API...');
    
    try {
      const ws = new WebSocket(WS_URL);
      
      ws.onopen = () => {
        console.log('✅ Connected to Google Live API');
        setIsConnected(true);
        setIsConnecting(false);
        setConnectionStatus('Connected');
        addMessage('system', '✅ Connected to Google Live API');
        
        // Send setup message
        const setupMessage = {
          setup: {
            model: 'models/gemini-2.0-flash-live-001',
            generationConfig: {
              responseModalities: 'audio',
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voiceName
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{ text: systemInstruction }]
            }
          }
        };
        
        ws.send(JSON.stringify(setupMessage));
        console.log('📤 Sent setup message:', setupMessage);
      };
      
      ws.onmessage = async (event) => {
        try {
          const data = event.data instanceof Blob ? 
            JSON.parse(await event.data.text()) : 
            JSON.parse(event.data);
          
          console.log('📥 Received message:', data);
          
          if (data.setupComplete) {
            addMessage('system', '🎉 Live API setup complete! You can now start streaming.');
          } else if (data.serverContent && data.serverContent.modelTurn) {
            const parts = data.serverContent.modelTurn.parts;
            
            // Handle text responses
            const textParts = parts.filter(part => part.text);
            if (textParts.length > 0) {
              const textContent = textParts.map(part => part.text).join('');
              addMessage('ai', textContent);
            }
            
            // Handle audio responses
            const audioParts = parts.filter(part => 
              part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')
            );
            
            audioParts.forEach(audioPart => {
              if (audioPart.inlineData && audioPart.inlineData.data) {
                playAudioResponse(audioPart.inlineData.data);
              }
            });
          } else if (data.serverContent && data.serverContent.interrupted) {
            addMessage('system', '⚠️ AI was interrupted');
          } else if (data.serverContent && data.serverContent.turnComplete) {
            console.log('✅ Turn complete');
          }
        } catch (error) {
          console.error('Error processing message:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setConnectionStatus('Error');
        addMessage('system', '❌ Connection error occurred');
      };
      
      ws.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.reason || 'No reason provided');
        setIsConnected(false);
        setIsConnecting(false);
        setConnectionStatus('Disconnected');
        addMessage('system', `🔌 Disconnected: ${event.reason || 'Connection closed'}`);
        wsRef.current = null;
      };
      
      wsRef.current = ws;
      
    } catch (error) {
      console.error('❌ Connection failed:', error);
      setIsConnecting(false);
      setConnectionStatus('Failed');
      addMessage('system', `❌ Connection failed: ${error.message}`);
    }
  }, [isConnecting, isConnected, voiceName, systemInstruction, addMessage, API_KEY, WS_URL]);

  // Disconnect from Live API
  const disconnectFromLiveAPI = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setConnectionStatus('Disconnected');
    addMessage('system', '🔌 Disconnected from Live API');
  }, [addMessage]);

  // Audio playback for AI responses
  const playAudioResponse = useCallback((base64AudioData) => {
    try {
      // Convert base64 to ArrayBuffer
      const binaryString = atob(base64AudioData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Create audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 24000
        });
      }
      
      // Decode and play audio
      audioContextRef.current.decodeAudioData(bytes.buffer)
        .then(audioBuffer => {
          const source = audioContextRef.current.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContextRef.current.destination);
          source.start();
        })
        .catch(error => console.error('Audio playback error:', error));
        
    } catch (error) {
      console.error('Failed to play audio response:', error);
    }
  }, []);

  // Camera management
  const toggleCamera = useCallback(async () => {
    if (!isCameraOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 640 }, 
            height: { ideal: 480 },
            frameRate: { ideal: 15 }
          } 
        });
        setVideoStream(stream);
        setIsCameraOn(true);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        
        addMessage('system', '📹 Camera started');
        
        // Start sending video frames
        startVideoStreaming(stream);
        
      } catch (error) {
        console.error('Camera access failed:', error);
        addMessage('system', `❌ Camera access failed: ${error.message}`);
      }
    } else {
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        setVideoStream(null);
      }
      setIsCameraOn(false);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      addMessage('system', '📹 Camera stopped');
    }
  }, [isCameraOn, videoStream, addMessage]);

  // Video streaming
  const startVideoStreaming = useCallback((stream) => {
    if (!wsRef.current || !isConnected) return;
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const sendFrame = () => {
      if (!isCameraOn || !isConnected) return;
      
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      ctx.drawImage(video, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            
            const message = {
              realtimeInput: {
                mediaChunks: [{
                  mimeType: 'image/jpeg',
                  data: base64
                }]
              }
            };
            
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify(message));
            }
          };
          reader.readAsDataURL(blob);
        }
        
        // Send next frame
        setTimeout(sendFrame, 1000 / 2); // 2 FPS
      }, 'image/jpeg', 0.6);
    };
    
    video.onloadedmetadata = () => {
      sendFrame();
    };
  }, [isCameraOn, isConnected]);

  // Microphone management (simplified for now)
  const toggleMicrophone = useCallback(async () => {
    if (!isMicOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true
          } 
        });
        
        setIsMicOn(true);
        addMessage('system', '🎤 Microphone started');
        
        // TODO: Implement audio worklet streaming like Google's implementation
        // For now, just indicate mic is on
        
      } catch (error) {
        console.error('Microphone access failed:', error);
        addMessage('system', `❌ Microphone access failed: ${error.message}`);
      }
    } else {
      setIsMicOn(false);
      addMessage('system', '🎤 Microphone stopped');
    }
  }, [isMicOn, addMessage]);

  // Send text message
  const sendTextMessage = useCallback(() => {
    if (!currentMessage.trim() || !isConnected) return;
    
    const message = {
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text: currentMessage }]
        }],
        turnComplete: true
      }
    };
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      addMessage('user', currentMessage);
      setCurrentMessage('');
    }
  }, [currentMessage, isConnected, addMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [videoStream]);

  return (
    <div className="live-chat-direct">
      <div className="live-chat-header">
        <h2>🚀 Direct Live API Integration</h2>
        <div className={`connection-status ${connectionStatus.toLowerCase()}`}>
          <div className="status-indicator"></div>
          <span>{connectionStatus}</span>
        </div>
      </div>

      <div className="live-chat-content">
        {/* Configuration Panel */}
        <div className="config-panel">
          <div className="config-row">
            <label>Voice:</label>
            <select 
              value={voiceName} 
              onChange={(e) => setVoiceName(e.target.value)}
              disabled={isConnected}
            >
              {voiceOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          <div className="config-row">
            <label>System Instruction:</label>
            <textarea
              value={systemInstruction}
              onChange={(e) => setSystemInstruction(e.target.value)}
              disabled={isConnected}
              rows={2}
              placeholder="Enter system instruction for the AI..."
            />
          </div>
        </div>

        {/* Connection Controls */}
        <div className="connection-controls">
          {!isConnected ? (
            <button 
              onClick={connectToLiveAPI}
              disabled={isConnecting}
              className="connect-btn"
            >
              {isConnecting ? '🔄 Connecting...' : '🚀 Connect to Live API'}
            </button>
          ) : (
            <button onClick={disconnectFromLiveAPI} className="disconnect-btn">
              🔌 Disconnect
            </button>
          )}
        </div>

        {/* Media Controls */}
        {isConnected && (
          <div className="media-controls">
            <button 
              onClick={toggleCamera}
              className={`media-btn ${isCameraOn ? 'active' : ''}`}
            >
              📹 Camera {isCameraOn ? 'ON' : 'OFF'}
            </button>
            
            <button 
              onClick={toggleMicrophone}
              className={`media-btn ${isMicOn ? 'active' : ''}`}
            >
              🎤 Microphone {isMicOn ? 'ON' : 'OFF'}
            </button>
          </div>
        )}

        {/* Video Preview */}
        {isCameraOn && (
          <div className="video-container">
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline
              className="video-preview"
            />
          </div>
        )}

        {/* Messages Area */}
        <div className="messages-container">
          {messages.map((message, index) => (
            <div key={index} className={`message message-${message.type}`}>
              <div className="message-content">{message.content}</div>
              <div className="message-timestamp">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Text Input */}
        {isConnected && (
          <div className="text-input-container">
            <input
              type="text"
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendTextMessage()}
              placeholder="Type a message to the AI..."
              className="text-input"
            />
            <button 
              onClick={sendTextMessage} 
              disabled={!currentMessage.trim()}
              className="send-btn"
            >
              📤 Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveChatDirect; 