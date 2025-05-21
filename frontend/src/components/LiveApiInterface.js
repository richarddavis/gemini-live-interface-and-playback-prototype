import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocketIO } from '../hooks/useSocketIO';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

// Available voices for Gemini Live API
const AVAILABLE_VOICES = [
  {id: 'Puck', name: 'Puck (male)'},
  {id: 'Charon', name: 'Charon (male)'},
  {id: 'Fenrir', name: 'Fenrir (male)'},
  {id: 'Orus', name: 'Orus (male)'},
  {id: 'Kore', name: 'Kore (female)'},
  {id: 'Aoede', name: 'Aoede (female)'},
  {id: 'Leda', name: 'Leda (female)'},
  {id: 'Zephyr', name: 'Zephyr (female)'}
];

const LiveApiInterface = ({ 
  apiKey, 
  activeChatSessionId,
  onComplete,
  socketUrl 
}) => {
  // State
  const [inputText, setInputText] = useState('');
  const [responseText, setResponseText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Puck');
  const [responseType, setResponseType] = useState('TEXT');
  const [audioChunks, setAudioChunks] = useState([]);
  
  // Refs
  const audioPlayerRef = useRef(null);
  const audioContextRef = useRef(null);
  const sessionRef = useRef(null);
  
  // Hooks
  const { 
    isConnected, 
    error: socketError, 
    isSessionActive, 
    initializeSession,
    sendText,
    sendAudio,
    endSession,
    setHandlers,
    sendMedia
  } = useSocketIO(socketUrl);
  
  const {
    isRecording,
    isProcessing,
    error: audioError,
    speechDetected,
    silenceDetected,
    startRecording,
    stopRecording
  } = useAudioRecorder();
  
  const handleStopRecording = useCallback(async () => {
    try {
      const audioData = await stopRecording();
      if (audioData) {
        // Send audio data to Live API
        sendAudio(audioData, true);
      }
    } catch (err) {
      console.error('Error stopping recording:', err);
    }
  }, [stopRecording, sendAudio]);
  
  // Helper to create WAV file from PCM data (remains a regular function if it doesn't depend on component state/props)
  const createWavFromPCM = (pcmData, sampleRate) => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmData.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    const offset = 44;
    for (let i = 0; i < pcmData.length; i++) {
      view.setInt16(offset + i * 2, pcmData[i], true);
    }
    
    return buffer;
  };
  
  // Helper to write string to DataView (remains a regular function)
  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  const playAudioResponse = useCallback(async () => {
    if (audioChunks.length === 0) return;
    
    try {
      // setIsPlayingAudio(true); // This state was commented out
      
      const audioData = audioChunks.map(chunk => {
        const binaryString = atob(chunk);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      });
      
      let totalLength = 0;
      audioData.forEach(chunk => {
        totalLength += chunk.length;
      });
      
      const combinedData = new Int16Array(totalLength / 2);
      let offset = 0;
      
      audioData.forEach(chunk => {
        const int16Chunk = new Int16Array(chunk.buffer);
        combinedData.set(int16Chunk, offset);
        offset += int16Chunk.length;
      });
      
      const wavBuffer = createWavFromPCM(combinedData, 24000);
      
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = url;
        await audioPlayerRef.current.play();
      }
      
      // setIsPlayingAudio(false); // This state was commented out
    } catch (err) {
      console.error('Error playing audio response:', err);
      // setIsPlayingAudio(false); // This state was commented out
    }
  }, [audioChunks, audioPlayerRef]); // createWavFromPCM is stable if not accessing state/props
  
  // Initialize AudioContext
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
  
  // Set up message handlers
  useEffect(() => {
    if (!isConnected) return;
    
    setHandlers({
      onStart: (data) => {
        console.log('Live API session started', data);
        // setIsActive(true);
      },
      onTextChunk: (chunk) => {
        setResponseText(prev => prev + chunk);
      },
      onAudioChunk: (chunk, mimeType) => {
        setAudioChunks(prev => [...prev, chunk]);
      },
      onTranscript: (text) => {
        setTranscript(text);
      },
      onComplete: (data) => {
        console.log('Live API turn complete', data);
        if (responseType === 'AUDIO' && audioChunks.length > 0) {
          playAudioResponse();
        }
        
        if (onComplete) {
          onComplete({
            text: responseType === 'AUDIO' ? transcript : responseText,
            audio: responseType === 'AUDIO' ? audioChunks : null
          });
        }
      },
      onEnd: () => {
        console.log('Live API session ended');
        resetState();
      }
    });
  }, [isConnected, responseType, audioChunks, responseText, transcript, onComplete, setHandlers, playAudioResponse]);
  
  // Monitor silence detection for auto-sending
  useEffect(() => {
    if (isRecording && silenceDetected && speechDetected) {
      handleStopRecording();
    }
  }, [isRecording, silenceDetected, speechDetected, handleStopRecording]);
  
  // Reset state
  const resetState = () => {
    setResponseText('');
    setTranscript('');
    setAudioChunks([]);
  };
  
  // Start Live API session
  const startSession = useCallback(() => {
    if (!apiKey || !activeChatSessionId) {
      alert('API key and active chat session are required');
      return;
    }
    
    resetState();
    
    // Initialize session
    const success = initializeSession({
      chat_session_id: activeChatSessionId,
      api_key: apiKey,
      response_type: responseType,
      voice_name: selectedVoice,
      language_code: 'en-US'
    });
    
    if (success) {
      console.log('Initialized Live API session');
      sessionRef.current = true;
    }
  }, [apiKey, activeChatSessionId, initializeSession, responseType, selectedVoice]);
  
  // End Live API session
  const stopSession = useCallback(() => {
    endSession();
    sessionRef.current = false;
  }, [endSession]);
  
  // Send text message
  const handleSendText = () => {
    if (!inputText.trim()) return;
    
    sendText(inputText);
    setInputText('');
  };
  
  // Handle voice recording
  const handleStartRecording = async () => {
    if (!isSessionActive) {
      alert('Start a Live API session first');
      return;
    }
    
    try {
      await startRecording();
    } catch (err) {
      console.error('Error starting recording:', err);
    }
  };
  
  // Handle media upload
  const handleMediaUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      // Check if file is an image or video
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        alert('Please upload an image or video file.');
        return;
      }
      
      // Create a URL for the file
      const fileUrl = URL.createObjectURL(file);
      
      // Send the file URL to the server via websocket
      if (isSessionActive) {
        sendMedia(fileUrl, file.type, inputText);
        
        // Clear the input field after sending
        setInputText('');
      } else {
        alert('Please start a Live API session first');
      }
    } catch (error) {
      console.error('Error uploading media:', error);
    }
  };
  
  // Prepare style for recording button based on state
  const getRecordButtonStyle = () => {
    if (speechDetected && isRecording) {
      return { backgroundColor: '#dc3545', animation: 'pulse 1s infinite' };
    }
    if (isRecording) {
      return { backgroundColor: '#fd7e14' };
    }
    return {};
  };
  
  return (
    <div className="live-api-interface">
      <div className="live-api-controls">
        <div className="live-api-settings">
          <div className="settings-row">
            <label>
              Response: 
              <select 
                value={responseType} 
                onChange={(e) => setResponseType(e.target.value)}
                disabled={isSessionActive}
              >
                <option value="TEXT">Text</option>
                <option value="AUDIO">Audio</option>
              </select>
            </label>
            
            {responseType === 'AUDIO' && (
              <label>
                Voice: 
                <select 
                  value={selectedVoice} 
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  disabled={isSessionActive}
                >
                  {AVAILABLE_VOICES.map(voice => (
                    <option key={voice.id} value={voice.id}>{voice.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          
          <div className="session-control-buttons">
            {!isSessionActive ? (
              <button 
                className="start-session-button"
                onClick={startSession}
                disabled={!isConnected || !apiKey || !activeChatSessionId}
              >
                Start Live Session
              </button>
            ) : (
              <button 
                className="stop-session-button"
                onClick={stopSession}
              >
                End Live Session
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="live-api-response">
        {responseType === 'TEXT' ? (
          <div className="text-response">
            {responseText ? responseText : (
              <div className="placeholder-text">AI response will appear here...</div>
            )}
          </div>
        ) : (
          <div className="audio-response">
            <audio ref={audioPlayerRef} controls={audioChunks.length > 0} />
            <div className="transcript">
              {transcript ? transcript : (
                <div className="placeholder-text">Transcript will appear here...</div>
              )}
            </div>
          </div>
        )}
      </div>
      
      <div className="live-api-input">
        <div className="text-input-row">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your message..."
            disabled={!isSessionActive || isRecording || isProcessing}
          />
          <button
            onClick={handleSendText}
            disabled={!isSessionActive || !inputText.trim() || isRecording || isProcessing}
          >
            Send
          </button>
        </div>
        
        <div className="voice-input-row">
          <button
            className={`voice-record-button ${isRecording ? 'recording' : ''} ${speechDetected ? 'speech-detected' : ''}`}
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            disabled={!isSessionActive || isProcessing}
            style={getRecordButtonStyle()}
          >
            {isRecording ? (speechDetected ? 'Listening...' : 'Recording...') : 'Hold to Speak'}
          </button>
          
          <label className="upload-media-button">
            Upload Media
            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleMediaUpload}
              disabled={!isSessionActive || isRecording || isProcessing}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>
      
      {(socketError || audioError) && (
        <div className="error-message">
          {socketError || audioError}
        </div>
      )}
      
      <div className="connection-status">
        {isConnected ? (
          <span className="status-connected">Connected</span>
        ) : (
          <span className="status-disconnected">Disconnected</span>
        )}
        {isSessionActive && (
          <span className="status-active-session">Live Session Active</span>
        )}
      </div>
    </div>
  );
};

export default LiveApiInterface; 