import React, { useState, useEffect, useRef } from 'react';
import GeminiLiveAPI from '../utils/gemini-live-api';
import './LiveChat.css';

const LiveChat = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [modelName, setModelName] = useState('models/gemini-2.0-flash-live-001');
  const [systemInstructions, setSystemInstructions] = useState('You are a helpful AI assistant. Respond concisely and clearly.');
  const [responseModalities, setResponseModalities] = useState(['TEXT']);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const geminiApiRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Get access token from backend
  const getAccessToken = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
      const response = await fetch(`${apiUrl}/token`);
      const data = await response.json();
      if (data.token) {
        return data.token;
      } else {
        throw new Error(data.error || 'Failed to get access token');
      }
    } catch (error) {
      console.error('Error getting access token:', error);
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Error getting access token: ${error.message}`,
        type: 'text',
        timestamp: Date.now()
      }]);
      return null;
    }
  };

  // Function to play audio data
  const playAudio = (base64AudioData) => {
    if (!audioRef.current) return;

    try {
      // Convert base64 to ArrayBuffer
      const binaryString = window.atob(base64AudioData);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create audio blob and play
      const audioBlob = new Blob([bytes.buffer], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);

      audioRef.current.src = audioUrl;
      audioRef.current.play();
      setIsPlayingAudio(true);

      audioRef.current.onended = () => {
        setIsPlayingAudio(false);
        URL.revokeObjectURL(audioUrl);
      };
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  // Connect to the Gemini Live API
  const connectToGemini = async () => {
    if (isConnecting || isConnected) return;

    setIsConnecting(true);
    setMessages(prev => [...prev, {
      role: 'system',
      content: 'Connecting to Gemini Live API via proxy...',
      type: 'text',
      timestamp: Date.now()
    }]);

    // Create a new GeminiLiveAPI instance - no token needed for proxy
    const geminiApi = new GeminiLiveAPI(
      process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:8080',
      modelName
    );

    // Configure the API
    geminiApi.systemInstructions = systemInstructions;
    geminiApi.responseModalities = responseModalities;

    // Set the response callback
    geminiApi.onReceiveResponse = (message) => {
      console.log('Received message:', message);
      
      if (message.type === 'SETUP_COMPLETE') {
        setIsConnected(true);
        setIsConnecting(false);
        setMessages(prev => [...prev, {
          role: 'system',
          content: 'Connected to Gemini Live API successfully!',
          type: 'text',
          timestamp: Date.now()
        }]);
      } else if (message.type === 'TEXT') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: message.data,
          type: 'text',
          timestamp: Date.now()
        }]);
      } else if (message.type === 'AUDIO') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Audio response received',
          type: 'audio',
          audioData: message.data,
          timestamp: Date.now()
        }]);
        
        // Auto-play audio if it's in the response modalities
        if (responseModalities.includes('AUDIO')) {
          playAudio(message.data);
        }
      }
    };

    // Set the connection started callback
    geminiApi.onConnectionStarted = () => {
      console.log('WebSocket connection established');
    };

    // Set the error callback
    geminiApi.onErrorMessage = (error) => {
      console.error('Gemini API Error:', error);
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Error: ${error}`,
        type: 'text',
        timestamp: Date.now()
      }]);
      setIsConnected(false);
      setIsConnecting(false);
    };

    geminiApiRef.current = geminiApi;
    // Connect without token - proxy handles authentication
    geminiApi.connect(null);
  };

  // Disconnect from Gemini
  const disconnectFromGemini = () => {
    if (geminiApiRef.current) {
      geminiApiRef.current.disconnect();
      geminiApiRef.current = null;
    }
    setIsConnected(false);
    setMessages(prev => [...prev, {
      role: 'system',
      content: 'Disconnected from Gemini Live API',
      type: 'text',
      timestamp: Date.now()
    }]);
  };

  // Start recording audio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const reader = new FileReader();
        
        reader.onloadend = () => {
          const base64Audio = reader.result.split(',')[1]; // Remove data URL prefix
          if (geminiApiRef.current && isConnected) {
            geminiApiRef.current.sendAudioMessage(base64Audio);
            setMessages(prev => [...prev, {
              role: 'user',
              content: 'Audio message sent',
              type: 'audio',
              timestamp: Date.now()
            }]);
          }
        };
        
        reader.readAsDataURL(audioBlob);
        
        // Clean up
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Recording error: ${error.message}`,
        type: 'text',
        timestamp: Date.now()
      }]);
    }
  };

  // Stop recording audio
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Send text message
  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !isConnected || !geminiApiRef.current) return;

    const userMessage = {
      role: 'user',
      content: inputText,
      type: 'text',
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    geminiApiRef.current.sendTextMessage(inputText);
    setInputText('');
  };

  // Replay audio message
  const replayAudio = (audioData) => {
    playAudio(audioData);
  };

  return (
    <div className="live-chat">
      <div className="live-chat-header">
        <h2>Gemini Live Chat</h2>
        <div className="connection-controls">
          {!isConnected && !isConnecting && (
            <button onClick={connectToGemini} className="connect-btn">
              Connect
            </button>
          )}
          {isConnecting && (
            <button disabled className="connecting-btn">
              Connecting...
            </button>
          )}
          {isConnected && (
            <button onClick={disconnectFromGemini} className="disconnect-btn">
              Disconnect
            </button>
          )}
          <span className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="settings-panel">
        <div className="setting-group">
          <label>Model:</label>
          <select
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            disabled={isConnected}
          >
            <option value="models/gemini-2.0-flash-live-001">Gemini 2.0 Flash Live Preview</option>
            <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
            <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
            <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
          </select>
        </div>
        <div className="setting-group">
          <label>Response Modalities:</label>
          <div className="modality-options">
            <label>
              <input
                type="checkbox"
                checked={responseModalities.includes('TEXT')}
                onChange={(e) => {
                  if (e.target.checked) {
                    setResponseModalities(prev => [...prev, 'TEXT']);
                  } else {
                    setResponseModalities(prev => prev.filter(m => m !== 'TEXT'));
                  }
                }}
                disabled={isConnected}
              />
              Text
            </label>
            <label>
              <input
                type="checkbox"
                checked={responseModalities.includes('AUDIO')}
                onChange={(e) => {
                  if (e.target.checked) {
                    setResponseModalities(prev => [...prev, 'AUDIO']);
                  } else {
                    setResponseModalities(prev => prev.filter(m => m !== 'AUDIO'));
                  }
                }}
                disabled={isConnected}
              />
              Audio
            </label>
          </div>
        </div>
        <div className="setting-group">
          <label>System Instructions:</label>
          <textarea
            value={systemInstructions}
            onChange={(e) => setSystemInstructions(e.target.value)}
            disabled={isConnected}
            rows="2"
          />
        </div>
      </div>

      <div className="messages-container">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <div className="message-content">
              {message.type === 'audio' && message.audioData ? (
                <div className="audio-message">
                  <span>{message.content}</span>
                  <button 
                    onClick={() => replayAudio(message.audioData)}
                    className="replay-btn"
                    disabled={isPlayingAudio}
                  >
                    {isPlayingAudio ? 'Playing...' : 'Replay'}
                  </button>
                </div>
              ) : (
                <span>{message.content}</span>
              )}
            </div>
            <div className="message-timestamp">
              {new Date(message.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        <form onSubmit={sendMessage} className="text-input-form">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your message..."
            disabled={!isConnected}
          />
          <button type="submit" disabled={!isConnected || !inputText.trim()}>
            Send
          </button>
        </form>
        <div className="audio-controls">
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!isConnected}
            className={`audio-btn ${isRecording ? 'recording' : ''}`}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
        </div>
      </div>

      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
};

export default LiveChat; 