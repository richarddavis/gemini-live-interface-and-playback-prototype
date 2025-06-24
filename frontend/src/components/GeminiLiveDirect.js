import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import './GeminiLiveDirect.css';
import IconButton from './IconButton';
import { interactionLogger } from '../services/interactionLogger';

/**
 * Direct Google Gemini Live API Integration
 * ==========================================
 * 
 * This component connects directly to Google's Live API WebSocket endpoint.
 * Architecture: Frontend ↔ WebSocket ↔ Google Gemini Live API
 * Backend is used only for analytics/logging.
 */
const GeminiLiveDirect = forwardRef(({ onExitLiveMode, onStatusChange, isModal = false, chatSessionId = null, apiKey }, ref) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState('user'); // 'user' or 'environment'
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('Aoede');
  const [responseMode, setResponseMode] = useState('AUDIO'); // 'TEXT' or 'AUDIO'
  const [messages, setMessages] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [sessionStartTime, setSessionStartTime] = useState(null);
  
  // Audio buffering state
  const [isReceivingAudio, setIsReceivingAudio] = useState(false);
  const audioBufferRef = useRef([]);
  const audioTimeoutRef = useRef(null);
  
  // Audio response queue management
  const audioResponseQueueRef = useRef([]);
  const currentResponseIdRef = useRef(null);
  const nextResponseIdRef = useRef(1);
  const isPlayingAudioRef = useRef(false);

  const wsRef = useRef(null);
  const videoRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const setupCompleteRef = useRef(false);
  const messagesEndRef = useRef(null);
  const cameraStreamRef = useRef(null); // Store camera stream separately
  const videoFrameIntervalRef = useRef(null); // For video frame capture interval
  const voiceMenuRef = useRef(null);
  const currentOutputAudioRef = useRef(null);
  const micInterruptDoneRef = useRef(false);

  // Available voices from Google's 2025 documentation
  const voices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'];

  // Backend base URL for auxiliary endpoints (token provisioning, analytics, etc.)
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

  // Helper: fetch an ephemeral token from backend and build WS url
  const fetchWsUrlWithToken = async () => {
    try {
      const res = await fetch(`${API_URL}/live/ephemeral_token`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`Token server responded ${res.status}`);
      }
      const { token } = await res.json();
      if (!token) {
        throw new Error('Invalid token payload');
      }
      return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`;
    } catch (err) {
      console.error('❌ Failed to obtain Live-API token:', err);
      throw err;
    }
  };

  // Helper to build the Live-API setup message using camelCase keys and stable model
  const buildSetupMessage = () => ({
    setup: {
      model: 'models/gemini-2.0-flash-live-001',
      generationConfig: {
        responseModalities: [responseMode],
        speechConfig:
          responseMode === 'AUDIO'
            ? {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: selectedVoice,
                  },
                },
              }
            : undefined,
      },
      systemInstruction: {
        parts: [
          {
            text:
              "You are a helpful AI assistant with multimodal capabilities. You can see video input when the user's camera is active, hear audio when their microphone is active, and respond with voice or text.\n\nImportant context about input types:\n- When you receive text via clientContent (when camera is active), you also have access to current video frames.\n- When you receive standard text messages (when camera is off), you won't have video context.\n- Audio input always gives you access to both audio and any active video streams.\n\nAlways acknowledge the type of input you're receiving and what you currently perceive (video, audio, text only).",
          },
        ],
      },
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
          endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
          prefixPaddingMs: 1000,
          silenceDurationMs: 600,
        },
        activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
        turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
      },
    },
  });

  // Auto-scroll to bottom when new messages are added
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Close voice menu when clicking outside
  useEffect(() => {
    if (!voiceMenuOpen) return;
    const handleClick = (e) => {
      if (voiceMenuRef.current && !voiceMenuRef.current.contains(e.target)) {
        setVoiceMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [voiceMenuOpen]);

  // Notify parent of status changes
  useEffect(() => {
    if (onStatusChange) {
      if (isConnecting) {
        onStatusChange('connecting');
      } else if (isConnected) {
        onStatusChange('connected');
      } else {
        onStatusChange('disconnected');
      }
    }
  }, [isConnecting, isConnected, onStatusChange]);

  // Initialize interaction logging
  useEffect(() => {
    // Enable replay mode to capture full media data for playback
    try {
      console.log('🎬 Setting replay mode to true...');
      interactionLogger.setReplayMode(true);
      console.log('🎬 Replay mode enabled - Current replayMode:', interactionLogger.replayMode);
      console.log('🎬 InteractionLogger instance:', interactionLogger);
      
      // Start interaction session when component mounts
      interactionLogger.startNewSession(chatSessionId);
    } catch (error) {
      console.warn('⚠️ Failed to initialize interaction logging:', error);
    }
    
    // Cleanup when component unmounts
    return () => {
      try {
        interactionLogger.endSession();
        // Reset replay mode when leaving live mode
        console.log('🎬 Resetting replay mode to false...');
        interactionLogger.setReplayMode(false);
        console.log('🎬 Replay mode disabled - Current replayMode:', interactionLogger.replayMode);
      } catch (error) {
        console.warn('⚠️ Failed to cleanup interaction logging:', error);
      }
    };
  }, [chatSessionId]);

  // Capture and send video frame to Gemini Live API
  const captureAndSendVideoFrame = useCallback(() => {
    if (!videoRef.current || !isConnected || !wsRef.current || !isCameraOn) {
      return;
    }

    // Skip this frame if the WebSocket has too much data queued (simple back-pressure)
    const BACKPRESSURE_LIMIT_BYTES = 500_000; // ~0.5 MB
    if (wsRef.current.bufferedAmount > BACKPRESSURE_LIMIT_BYTES) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(
          `📹 Skipped video frame due to back-pressure (bufferedAmount = ${wsRef.current.bufferedAmount} bytes)`
        );
      }
      return;
    }

    try {
      // Create a canvas to capture the current video frame
      const canvas = document.createElement('canvas');
      const video = videoRef.current;
      
      // Set canvas size to match video
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to base64 JPEG (smaller than PNG for real-time streaming)
      const dataURL = canvas.toDataURL('image/jpeg', 0.7); // 70% quality for smaller size
      const base64Data = dataURL.split(',')[1]; // Remove data:image/jpeg;base64, prefix
      
      // Send frame to Gemini Live API
      const videoMessage = {
        realtimeInput: {
          mediaChunks: [{
            mimeType: 'image/jpeg',
            data: base64Data
          }]
        }
      };
      
      wsRef.current.send(JSON.stringify(videoMessage));
      
      // Increase logging frequency for better replay quality
      // In replay mode, log more frames (30% instead of 5%)
      const logProbability = interactionLogger.replayMode ? 0.3 : 0.05;
      if (Math.random() < logProbability) {
        console.log(`📹 Sent video frame: ${canvas.width}x${canvas.height} (replay mode: ${interactionLogger.replayMode})`);
        // Log video frame with error handling and improved metadata
        try {
          interactionLogger.logVideoFrame(base64Data, {
            video_resolution: { width: canvas.width, height: canvas.height },
            camera_on: isCameraOn,
            is_connected: isConnected,
            frame_timestamp: Date.now(),
            capture_quality: 0.7,
            replay_mode: interactionLogger.replayMode
          });
        } catch (logError) {
          console.warn('⚠️ Failed to log video frame:', logError);
        }
      }
      
    } catch (error) {
      console.error('Video frame capture error:', error);
    }
  }, [isConnected, isCameraOn]);

  // Start video frame capture when camera is active
  const startVideoFrameCapture = useCallback(() => {
    if (videoFrameIntervalRef.current) {
      clearInterval(videoFrameIntervalRef.current);
    }
    
    // Capture at a fixed 2 FPS to minimize bandwidth and buffering issues
    const captureInterval = 500; // 500 ms per frame ≈ 2 FPS
    videoFrameIntervalRef.current = setInterval(captureAndSendVideoFrame, captureInterval);
    console.log(`📹 Started video frame capture at ${1000 / captureInterval} FPS (fixed rate)`);
  }, [captureAndSendVideoFrame]);

  // Stop video frame capture
  const stopVideoFrameCapture = useCallback(() => {
    if (videoFrameIntervalRef.current) {
      clearInterval(videoFrameIntervalRef.current);
      videoFrameIntervalRef.current = null;
      console.log('📹 Stopped video frame capture');
    }
  }, []);

  // Handle video element setup when camera is turned on
  useEffect(() => {
    if (isCameraOn && cameraStreamRef.current && videoRef.current) {
      console.log('Setting up video element with stream');
      const stream = cameraStreamRef.current;
      
      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
      
      console.log('Video element srcObject set');
      
      // Add event listeners for debugging
      videoRef.current.onloadstart = () => console.log('Video load start');
      videoRef.current.onloadedmetadata = () => {
        console.log('Video metadata loaded, starting playback');
        console.log('Video dimensions:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight);
        videoRef.current.play().catch(console.error);
      };
      videoRef.current.oncanplay = () => console.log('Video can start playing');
      videoRef.current.onplaying = () => {
        console.log('Video is playing');
        // Start sending frames to Gemini Live API when video starts playing and we're connected
        if (isConnected) {
          startVideoFrameCapture();
        }
      };
      videoRef.current.onerror = (e) => console.error('Video error:', e);
      
      // Force play attempt
      videoRef.current.play().then(() => {
        console.log('Video play() succeeded');
        // Also start frame capture here in case onplaying doesn't fire
        if (isConnected) {
          startVideoFrameCapture();
        }
      }).catch((playError) => {
        console.error('Video play() failed:', playError);
      });
    }
  }, [isCameraOn, isConnected, startVideoFrameCapture]);

  // Add message to chat
  const addMessage = useCallback((type, message) => {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Ensure unique IDs
      type,
      message,
      timestamp: new Date().toISOString()
    }]);
  }, []);

  // Log analytics events (simplified)
  const logAnalytics = useCallback(async (event, data = {}) => {
    try {
      // Use the correct API URL - API_URL already includes /api
      await fetch(`${API_URL}/analytics/log-interaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: event,
          data: {
            timestamp: new Date().toISOString(),
            voice: selectedVoice,
            response_mode: responseMode,
            ...data
          }
        })
      });
    } catch (error) {
      console.error('Analytics logging failed:', error);
    }
  }, [selectedVoice, responseMode]);

  // Updated disconnect with session completion logic
  const disconnect = useCallback(async () => {
    console.log('🎭 disconnect() called - checking session completion...');
    
    stopVideoFrameCapture(); // Stop sending video frames
    
    let sessionData = null;
    
    // Create session data if we have a session with activity (for both modal and mobile)
    if (sessionStartTime && (isConnected || messages.length > 0)) {
      try {
        // Calculate session duration
        const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
        
        // Get analytics data
        const analytics = await interactionLogger.getSessionAnalytics();
        
        // Prepare session data for the placeholder
        sessionData = {
          session_id: interactionLogger.getSessionId(),
          duration: duration,
          exchanges_count: messages.filter(msg => msg.type === 'gemini' || msg.type === 'user').length,
          has_audio: messages.some(msg => msg.type === 'audio_received'),
          has_video: isCameraOn,
          timestamp: new Date().toISOString(),
          voice_used: selectedVoice,
          response_mode: responseMode,
          analytics: analytics,
          platform: isModal ? 'desktop' : 'mobile'
        };
        
        console.log(`🎭 ${isModal ? 'Modal' : 'Mobile'} session completed with data:`, sessionData);
      } catch (error) {
        console.warn('⚠️ Error collecting session analytics:', error);
        // Still create basic session data
        sessionData = {
          session_id: interactionLogger.getSessionId(),
          duration: sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0,
          exchanges_count: messages.filter(msg => msg.type === 'gemini' || msg.type === 'user').length,
          has_audio: messages.some(msg => msg.type === 'audio_received'),
          has_video: isCameraOn,
          timestamp: new Date().toISOString(),
          voice_used: selectedVoice,
          response_mode: responseMode,
          platform: isModal ? 'desktop' : 'mobile'
        };
        
        console.log(`🎭 ${isModal ? 'Modal' : 'Mobile'} session completed with basic data:`, sessionData);
      }
    }
    
    // Perform normal disconnect logic
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    // Clean up audio buffering and queue
    if (audioTimeoutRef.current) {
      clearTimeout(audioTimeoutRef.current);
      audioTimeoutRef.current = null;
    }
    audioBufferRef.current = [];
    audioResponseQueueRef.current = [];
    isPlayingAudioRef.current = false;
    currentResponseIdRef.current = null;
    setIsReceivingAudio(false);
    
    setIsConnected(false);
    setIsMicOn(false);
    setIsCameraOn(false);
    setupCompleteRef.current = false;
    logAnalytics('session_end');
    
    // Pass session data to parent for both modal and mobile sessions
    if (onExitLiveMode) {
      if (sessionData) {
        console.log(`🎭 Calling onExitLiveMode with session data for ${isModal ? 'modal' : 'mobile'} session`);
        onExitLiveMode(sessionData);
      } else {
        console.log(`🎭 Calling onExitLiveMode without session data (casual exit)`);
        onExitLiveMode();
      }
    }
  }, [logAnalytics, stopVideoFrameCapture, isModal, sessionStartTime, messages, isCameraOn, selectedVoice, responseMode, onExitLiveMode]);

  // Update connectToGemini to track session start time
  const connectToGemini = useCallback(async () => {
    if (!selectedVoice || !responseMode) {
      addMessage('error', 'Voice and response mode are required. Please select a voice and response mode.');
      return;
    }

    setIsConnecting(true);
    setSessionStartTime(Date.now()); // Track when session starts
    setupCompleteRef.current = false;
    
    // Log connection attempt with error handling
    try {
      interactionLogger.logUserAction('connect_attempt', {
        voice: selectedVoice,
        response_mode: responseMode,
        auth_method: 'ephemeral_token'
      });
    } catch (logError) {
      console.warn('⚠️ Failed to log connection attempt:', logError);
    }

    try {
      // Obtain WS URL with fresh token (ephemeral, single-use)
      const dynamicWsUrl = await fetchWsUrlWithToken();

      const ws = new WebSocket(dynamicWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ Connected to Google Live API');
        
        // Log successful connection with error handling
        try {
          interactionLogger.logUserAction('connection_success', {
            voice: selectedVoice,
            response_mode: responseMode
          });
        } catch (logError) {
          console.warn('⚠️ Failed to log connection success:', logError);
        }
        
        // Send setup message using Google's official format
        const setupMessage = buildSetupMessage();

        console.log('📤 Setup message sent', setupMessage);
        ws.send(JSON.stringify(setupMessage));
        logAnalytics('session_start', { voice: selectedVoice, mode: responseMode });
      };

      ws.onmessage = async (event) => {
        try {
          // Handle different message types from Google Live API
          if (event.data instanceof ArrayBuffer) {
            // Binary audio data
            console.log('📥 Received binary audio data');
            await handleBinaryAudioData(event.data);
          } else if (event.data instanceof Blob) {
            // Blob data - could be JSON or binary audio
            console.log('📥 Received blob data');
            
            // First try to decode as text to see if it's JSON
            try {
              const text = await event.data.text();
              
              // Try to parse as JSON
              try {
                const message = JSON.parse(text);
                
                // Handle as JSON message
                if (message.setupComplete) {
                  setupCompleteRef.current = true;
                  setIsConnected(true);
                  setIsConnecting(false);
                  addMessage('system', '🎉 Connected successfully! You can now chat with Gemini.');
                  
                  // Log setup completion with error handling
                  try {
                    interactionLogger.logUserAction('setup_complete', {
                      voice: selectedVoice,
                      response_mode: responseMode
                    });
                  } catch (logError) {
                    console.warn('⚠️ Failed to log setup completion:', logError);
                  }
                } else if (message.serverContent) {
                  handleServerContent(message.serverContent);
                } else if (message.toolCall) {
                  handleToolCall(message.toolCall);
                } else if (message.error) {
                  console.error('❌ Server error:', message.error);
                  addMessage('error', `Server error: ${message.error.message || 'Unknown error'}`);
                } else if (message.usageMetadata) {
                  console.log('📊 Usage metadata:', message.usageMetadata);
                } else if (message.inputTranscription) {
                  addMessage('transcription', `📝 You said: ${message.inputTranscription.text || '[unknown]'}`);
                } else if (message.outputTranscription) {
                  addMessage('transcription', `🗣️ Model said: ${message.outputTranscription.text || '[unknown]'}`);
                } else if (message.goAway) {
                  console.warn('⚠️ Server sent goAway – connection will close soon.');
                } else if (message.sessionResumptionUpdate) {
                  console.log('🔄 Session resumption handle received:', message.sessionResumptionUpdate);
                }
              } catch (jsonError) {
                // Not JSON, treat as binary audio data
                const arrayBuffer = await event.data.arrayBuffer();
                await handleBinaryAudioData(arrayBuffer);
              }
            } catch (textError) {
              // Can't decode as text, definitely binary data
              const arrayBuffer = await event.data.arrayBuffer();
              await handleBinaryAudioData(arrayBuffer);
            }
          } else if (typeof event.data === 'string') {
            // JSON text message
            const message = JSON.parse(event.data);

            if (message.setupComplete) {
              setupCompleteRef.current = true;
              setIsConnected(true);
              setIsConnecting(false);
              addMessage('system', '🎉 Connected successfully! You can now chat with Gemini.');
              
              // Log setup completion with error handling
              try {
                interactionLogger.logUserAction('setup_complete', {
                  voice: selectedVoice,
                  response_mode: responseMode
                });
              } catch (logError) {
                console.warn('⚠️ Failed to log setup completion:', logError);
              }
            } else if (message.serverContent) {
              handleServerContent(message.serverContent);
            } else if (message.toolCall) {
              handleToolCall(message.toolCall);
            } else if (message.error) {
              console.error('❌ Server error:', message.error);
              addMessage('error', `Server error: ${message.error.message || 'Unknown error'}`);
            }
          } else {
            console.warn('⚠️ Unknown message type:', typeof event.data);
          }
        } catch (error) {
          console.error('❌ Error processing message:', error);
          addMessage('error', `Message processing failed: ${error.message}`);
        }
      };

      ws.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        setupCompleteRef.current = false;
        
        if (event.code !== 1000) {
          addMessage('error', `Connection closed: ${event.reason || 'Unknown reason'}`);
        }
        logAnalytics('session_end');
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setIsConnecting(false);
        addMessage('error', 'WebSocket connection failed');
      };

    } catch (error) {
      console.error('❌ Connection error:', error);
      setIsConnecting(false);
      addMessage('error', `Failed to connect: ${error.message}`);
    }
  }, [selectedVoice, responseMode, addMessage, logAnalytics]);

  // Handle binary audio data from Google Live API
  const handleBinaryAudioData = useCallback(async (arrayBuffer) => {
    try {
      console.log('🔍 Binary data received, size:', arrayBuffer.byteLength);
      
      // Check if this might not be audio data
      if (arrayBuffer.byteLength < 100) {
        console.warn('⚠️ Binary data too small to be audio, might be an error response');
        // Try to decode as text to see if it's an error message
        try {
          const text = new TextDecoder().decode(arrayBuffer);
          console.log('📄 Binary data as text:', text);
          addMessage('error', `Received small binary response: ${text}`);
          return;
        } catch (e) {
          console.log('🔍 Cannot decode binary data as text');
        }
      }

      // Initialize audio context for playback at 24kHz if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 24000 // Google's output sample rate
        });
      }
      
      const audioContext = audioContextRef.current;
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // First try to decode as standard audio format
      try {
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice());
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        
        source.onended = () => {
          console.log('🎵 Audio playback completed');
        };
        
        source.start(0);
        addMessage('system', `🔊 Playing audio response (${audioBuffer.duration.toFixed(2)}s)`);
        currentOutputAudioRef.current = source;
        return;
      } catch (decodeError) {
        console.log('🔍 Standard audio decode failed, trying PCM format...');
      }

      // If standard decode fails, try as raw PCM (assume 24kHz, 16-bit, mono, little-endian)
      try {
        const sampleRate = 24000;
        const numChannels = 1;
        const bytesPerSample = 2;
        const numSamples = arrayBuffer.byteLength / bytesPerSample;
        
        const audioBuffer = audioContext.createBuffer(numChannels, numSamples, sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        
        // Convert 16-bit PCM to float32 with proper endianness handling
        const dataView = new DataView(arrayBuffer);
        for (let i = 0; i < numSamples; i++) {
          // Read 16-bit little-endian signed integer
          const sample = dataView.getInt16(i * 2, true); // true = little-endian
          channelData[i] = sample / 32768.0; // Convert to [-1, 1] range
        }
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        
        source.onended = () => {
          console.log('🎵 PCM Audio playback completed');
        };
        
        source.start(0);
        addMessage('system', `🔊 Playing PCM audio response (${audioBuffer.duration.toFixed(2)}s)`);
        currentOutputAudioRef.current = source;
      } catch (pcmError) {
        console.error('❌ PCM processing also failed:', pcmError);
        console.log('🔍 Binary data info:', {
          byteLength: arrayBuffer.byteLength,
          firstBytes: new Uint8Array(arrayBuffer.slice(0, 16))
        });
        
        // Try to decode as text to see what we actually received
        try {
          const text = new TextDecoder().decode(arrayBuffer);
          addMessage('error', `Binary data decode failed. Content preview: ${text.substring(0, 100)}`);
        } catch (textError) {
          addMessage('error', `Audio decode failed: ${pcmError.message}. Data size: ${arrayBuffer.byteLength} bytes`);
        }
      }
    } catch (error) {
      console.error('❌ Binary audio processing failed:', error);
      addMessage('error', `Audio processing failed: ${error.message}`);
    }
  }, [addMessage]);

  // Play the next audio response from the queue
  const playNextAudioFromQueue = useCallback(async () => {
    if (isPlayingAudioRef.current || audioResponseQueueRef.current.length === 0) {
      return;
    }

    const nextResponse = audioResponseQueueRef.current.shift();
    isPlayingAudioRef.current = true;
    currentResponseIdRef.current = nextResponse.id;

    console.log(`🎵 Playing audio response ${nextResponse.id} (${nextResponse.chunks.length} chunks from queue)`);

    try {
      const audioContext = audioContextRef.current;
      
      // Concatenate all audio chunks for this response
      const totalLength = nextResponse.chunks.reduce((sum, buffer) => sum + buffer.byteLength, 0);
      const combinedBuffer = new ArrayBuffer(totalLength);
      const combinedView = new Uint8Array(combinedBuffer);
      
      let offset = 0;
      for (const buffer of nextResponse.chunks) {
        combinedView.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }
      
      // Process as PCM
      const sampleRate = 24000; // Google's output rate
      const numChannels = 1; // Mono
      const bytesPerSample = 2; // 16-bit PCM
      const numSamples = combinedBuffer.byteLength / bytesPerSample;
      
      const audioBuffer = audioContext.createBuffer(numChannels, numSamples, sampleRate);
      const channelData = audioBuffer.getChannelData(0);
      
      // Convert 16-bit PCM to float32 with proper endianness handling
      const dataView = new DataView(combinedBuffer);
      for (let i = 0; i < numSamples; i++) {
        // Read 16-bit little-endian signed integer
        const sample = dataView.getInt16(i * 2, true); // true = little-endian
        channelData[i] = sample / 32768.0; // Convert to [-1, 1] range
      }
      
      // Create source and play
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      source.onended = () => {
        console.log(`🎵 Audio response ${nextResponse.id} playback completed`);
        isPlayingAudioRef.current = false;
        currentResponseIdRef.current = null;
        currentOutputAudioRef.current = null;
        
        // Play next response in queue if any
        setTimeout(() => playNextAudioFromQueue(), 50);
      };
      
      source.start(0);
      
      addMessage('system', `🔊 Playing audio response ${nextResponse.id} (${audioBuffer.duration.toFixed(2)}s, ${nextResponse.chunks.length} chunks)`);
      
      currentOutputAudioRef.current = source;
    } catch (error) {
      console.error(`🚨 Audio response ${nextResponse.id} playback failed:`, error);
      addMessage('error', `Audio playback failed: ${error.message}`);
      isPlayingAudioRef.current = false;
      currentResponseIdRef.current = null;
      currentOutputAudioRef.current = null;
      
      // Try to play next response despite error
      setTimeout(() => playNextAudioFromQueue(), 50);
    }
  }, [addMessage]);

  // Stop current playback and clear queue (user interruption only)
  const stopCurrentOutputAudio = useCallback(() => {
    try {
      if (currentOutputAudioRef.current) {
        currentOutputAudioRef.current.stop(0);
        currentOutputAudioRef.current.disconnect();
        currentOutputAudioRef.current = null;
        console.log('🛑 Current audio playback stopped by user');
      }
      
      // Clear queue and reset state (user wants to interrupt)
      audioResponseQueueRef.current = [];
      isPlayingAudioRef.current = false;
      currentResponseIdRef.current = null;
      console.log('🛑 Audio queue cleared by user interruption');
    } catch (err) {
      console.warn('⚠️ Failed to stop output audio:', err);
    }
  }, []);

  // Handle audio response with queue-based management
  const handleAudioResponse = useCallback(async (inlineData) => {
    console.log('🎵 Audio chunk received:', {
      mimeType: inlineData.mimeType,
      dataLength: inlineData.data ? inlineData.data.length : 0
    });

    if (inlineData.mimeType?.includes('audio') && inlineData.data) {
      try {
        // Initialize audio context for playback at 24kHz (Google's output sample rate)
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 24000 // Match Google's output sample rate
          });
        }
        
        const audioContext = audioContextRef.current;
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        // Decode base64 audio data
        const audioData = atob(inlineData.data);
        const arrayBuffer = new ArrayBuffer(audioData.length);
        const uint8Array = new Uint8Array(arrayBuffer);
        
        for (let i = 0; i < audioData.length; i++) {
          uint8Array[i] = audioData.charCodeAt(i);
        }

        // Add this chunk to the current response buffer
        audioBufferRef.current.push(arrayBuffer);
        
        // Set receiving state and reset timeout
        if (!isReceivingAudio) {
          setIsReceivingAudio(true);
          addMessage('system', '🎵 Receiving audio stream...');
          
          // Log the start of audio streaming
          try {
            interactionLogger.logUserAction('audio_stream_start', {
              audio_source: 'gemini_api',
              stream_timestamp: Date.now(),
              mime_type: inlineData.mimeType
            });
          } catch (logError) {
            console.warn('⚠️ Failed to log audio stream start:', logError);
          }
        }
        
        // Clear existing timeout and set new one
        if (audioTimeoutRef.current) {
          clearTimeout(audioTimeoutRef.current);
        }
        
        // Wait for stream to complete (500ms of no new chunks)
        audioTimeoutRef.current = setTimeout(() => {
          // Create new audio response and add to queue (don't interrupt current playback)
          const responseId = nextResponseIdRef.current++;
          const audioResponse = {
            id: responseId,
            chunks: [...audioBufferRef.current],
            timestamp: Date.now()
          };
          
          audioResponseQueueRef.current.push(audioResponse);
          console.log(`🎵 Queued audio response ${responseId} (${audioResponse.chunks.length} chunks) - Queue length: ${audioResponseQueueRef.current.length}`);
          
          // Clear the buffer for next response
          audioBufferRef.current = [];
          setIsReceivingAudio(false);
          
          // Start playing if not already playing (true queuing behavior)
          if (!isPlayingAudioRef.current) {
            playNextAudioFromQueue();
          } else {
            console.log(`🎵 Response ${responseId} queued, waiting for current response to finish`);
          }
          
          // Log the end of audio streaming
          try {
            interactionLogger.logUserAction('audio_stream_end', {
              audio_source: 'gemini_api',
              stream_timestamp: Date.now(),
              response_id: responseId,
              chunks_count: audioResponse.chunks.length,
              total_duration: audioResponse.chunks.length * 0.1 // Rough estimate
            });
          } catch (logError) {
            console.warn('⚠️ Failed to log audio stream end:', logError);
          }
        }, 500);

      } catch (error) {
        console.error('🚨 Audio chunk processing failed:', error);
        addMessage('error', `Audio chunk failed: ${error.message}`);
      }
    } else {
      console.warn('⚠️ Invalid audio data:', { mimeType: inlineData.mimeType, hasData: !!inlineData.data });
    }
  }, [addMessage, isReceivingAudio, playNextAudioFromQueue]);

  // Handle server content using Google's official format
  const handleServerContent = useCallback((serverContent) => {
    console.log('🔍 Processing server content parts:', serverContent.modelTurn?.parts?.length || 0);
    
    if (serverContent.modelTurn && serverContent.modelTurn.parts) {
      for (const part of serverContent.modelTurn.parts) {
        if (part.text) {
          console.log('💬 Adding AI message:', part.text);
          addMessage('ai', part.text);
          
          // Log API text response with error handling
          try {
            interactionLogger.logApiResponse(part.text, {
              response_type: 'text',
              response_length: part.text.length
            });
          } catch (logError) {
            console.warn('⚠️ Failed to log text response:', logError);
          }
        } else if (part.inlineData) {
          console.log('🎵 Processing inline audio data');
          handleAudioResponse(part.inlineData);
          
          // Log API audio response with error handling
          try {
            interactionLogger.logApiResponse(part.inlineData, {
              response_type: 'audio',
              mime_type: part.inlineData.mimeType,
              data_size: part.inlineData.data ? part.inlineData.data.length : 0,
              audio_source: 'gemini_api',
              microphone_on: false, // This is API audio, not user audio
              response_timestamp: Date.now(),
              replay_mode: interactionLogger.replayMode
            });
          } catch (logError) {
            console.warn('⚠️ Failed to log audio response:', logError);
          }
        }
      }
    }
    
    // Handle turn completion
    if (serverContent.turnComplete) {
      console.log('✅ Turn completed');
      // Optionally add a visual indicator that the AI has finished responding
    }

    if (serverContent.interrupted) {
      console.log('⏹️ Server signalled interruption');
      stopCurrentOutputAudio();
    }
  }, [addMessage, handleAudioResponse]);

  // Handle tool calls (placeholder)
  const handleToolCall = useCallback((toolCall) => {
    console.log('🔧 Tool call received:', toolCall);
    // Implement tool handling as needed
  }, []);

  // Send text message using Google's official format
  const sendTextMessage = useCallback(() => {
    if (!textInput.trim() || !isConnected || !wsRef.current || !setupCompleteRef.current) {
      return;
    }

    // If camera is on, send text as realtime input to ensure it sees current video
    // This is needed because client_content doesn't automatically include realtime context
    if (isCameraOn && cameraStreamRef.current) {
      const realtimeMessage = {
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ text: textInput.trim() }]
          }],
          turnComplete: true
        }
      };
      
      console.log('📤 Sending text as realtime input (camera active):', realtimeMessage);
      wsRef.current.send(JSON.stringify(realtimeMessage));
      addMessage('user', textInput.trim());
      
      // Log text input with error handling
      try {
        interactionLogger.logTextInput(textInput.trim(), {
          message_length: textInput.trim().length,
          is_connected: isConnected,
          camera_active: true,
          input_type: 'realtime'
        });
      } catch (logError) {
        console.warn('⚠️ Failed to log text input:', logError);
      }
    } else {
      // Standard text message when no camera
      const message = {
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ text: textInput.trim() }]
          }],
          turnComplete: true
        }
      };

      console.log('📤 Sending text message (no camera):', message);
      wsRef.current.send(JSON.stringify(message));
      addMessage('user', textInput.trim());
      
      // Log text input with error handling
      try {
        interactionLogger.logTextInput(textInput.trim(), {
          message_length: textInput.trim().length,
          is_connected: isConnected,
          camera_active: false,
          input_type: 'client_content'
        });
      } catch (logError) {
        console.warn('⚠️ Failed to log text input:', logError);
      }
    }
    
    setTextInput('');
    logAnalytics('text_input', { 
      message_length: textInput.trim().length,
      camera_active: isCameraOn 
    });

    stopCurrentOutputAudio();
  }, [textInput, isConnected, isCameraOn, addMessage, logAnalytics]);

  // Toggle microphone
  const toggleMicrophone = useCallback(async () => {
    try {
      if (!isMicOn) {
        addMessage('system', '🎤 Requesting microphone access...');
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
            sampleRate: { ideal: 16000 }, // Google's preferred input rate
            sampleSize: { ideal: 16 }, // 16-bit samples
            channelCount: { ideal: 1 }, // Mono
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
        
        mediaStreamRef.current = stream;
        setIsMicOn(true);
        addMessage('system', '🎤 Microphone access granted');
        
        if (isConnected && wsRef.current) {
          // Pass true explicitly since setIsMicOn(true) hasn't updated state yet
          startAudioRecording(stream, true);
        }

        stopCurrentOutputAudio();
      } else {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
        }
        if (mediaRecorderRef.current) {
          mediaRecorderRef.current.scriptProcessor.disconnect();
          mediaRecorderRef.current.source.disconnect();
          // Close the recording audio context if it exists
          if (mediaRecorderRef.current.recordingAudioContext) {
            mediaRecorderRef.current.recordingAudioContext.close();
          }
          mediaRecorderRef.current = null;
        }
        setIsMicOn(false);
        addMessage('system', '🎤 Microphone turned off');
        micInterruptDoneRef.current = false;
      }
    } catch (error) {
      console.error('Microphone error:', error);
      addMessage('error', `Microphone error: ${error.message}`);
    }
  }, [isMicOn, isConnected, addMessage]);

  // Start audio recording (proper PCM conversion for Google Live API)
  const startAudioRecording = useCallback((stream, microphoneState = null) => {
    try {
      // Use the passed microphoneState or fall back to the current isMicOn state
      const actualMicState = microphoneState !== null ? microphoneState : isMicOn;
      
      // Create separate audio context for recording at 16kHz (Google's input requirement)
      const recordingAudioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000 // Google's required input sample rate
      });
      
      const source = recordingAudioContext.createMediaStreamSource(stream);
      
      // Create a script processor to capture PCM data
      const scriptProcessor = recordingAudioContext.createScriptProcessor(4096, 1, 1);
      
      scriptProcessor.onaudioprocess = (event) => {
        if (isConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0); // Get mono channel
          const sampleRate = recordingAudioContext.sampleRate;
          
          // Convert Float32Array to Int16Array (16-bit PCM, little-endian)
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            // Clamp and convert from [-1, 1] to [-32768, 32767]
            const sample = Math.max(-1, Math.min(1, inputData[i]));
            pcmData[i] = Math.round(sample * 32767);
          }
          
          // Convert to Uint8Array for base64 encoding (maintaining little-endian byte order)
          const uint8Data = new Uint8Array(pcmData.buffer);
          
          // Properly encode to base64 without stack overflow or invalid characters
          let binaryString = '';
          for (let i = 0; i < uint8Data.length; i++) {
            binaryString += String.fromCharCode(uint8Data[i]);
          }
          const base64Audio = btoa(binaryString);
          
          const audioMessage = {
            realtimeInput: {
              mediaChunks: [{
                mimeType: `audio/pcm;rate=${sampleRate}`, // Include sample rate in MIME type
                data: base64Audio
              }]
            }
          };
          
          // Log audio chunk with error handling
          // CRITICAL FIX: Log ALL audio chunks in replay mode for complete audio capture
          const logProbability = interactionLogger.replayMode ? 1.0 : 0.1; // 100% in replay mode for complete audio, 10% otherwise
          if (Math.random() < logProbability) {
            console.log(`📤 Sending PCM audio chunk: ${pcmData.length} samples, ${uint8Data.length} bytes (replay mode: ${interactionLogger.replayMode}), micOn: ${actualMicState}`);
            try {
              interactionLogger.logAudioChunk(base64Audio, {
                audio_sample_rate: sampleRate,
                data_size_bytes: uint8Data.length,
                microphone_on: actualMicState,
                is_connected: isConnected,
                audio_source: 'user_microphone',
                chunk_timestamp: Date.now(),
                replay_mode: interactionLogger.replayMode
              });
            } catch (logError) {
              console.warn('⚠️ Failed to log audio chunk:', logError);
            }
          }
          wsRef.current.send(JSON.stringify(audioMessage));

          if (!micInterruptDoneRef.current) {
            stopCurrentOutputAudio();
            micInterruptDoneRef.current = true;
          }
        }
      };
      
      // Connect the audio graph
      source.connect(scriptProcessor);
      scriptProcessor.connect(recordingAudioContext.destination);
      
      // Store the processor and context for cleanup
      mediaRecorderRef.current = { 
        scriptProcessor, 
        source, 
        recordingAudioContext 
      };
      
      addMessage('system', `🎤 Started recording PCM audio at ${recordingAudioContext.sampleRate}Hz (mic state: ${actualMicState})`);
    } catch (error) {
      console.error('Audio recording error:', error);
      addMessage('error', `Audio recording failed: ${error.message}`);
    }
  }, [isConnected, isMicOn, addMessage]);

  // Toggle camera
  const toggleCamera = useCallback(async () => {
    try {
      if (!isCameraOn) {
        addMessage('system', '📹 Requesting camera access...');
        console.log('Requesting camera access...');

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
            facingMode: cameraFacingMode
          }
        });
        
        console.log('Camera stream obtained:', stream);
        console.log('Video tracks:', stream.getVideoTracks());
        
        // Store the stream and let useEffect handle video element setup
        cameraStreamRef.current = stream;
        setIsCameraOn(true);
        addMessage('system', '📹 Camera started - video preview should be visible');
      } else {
        console.log('Turning off camera...');
        stopVideoFrameCapture(); // Stop sending frames to API
        if (cameraStreamRef.current) {
          cameraStreamRef.current.getTracks().forEach(track => track.stop());
          cameraStreamRef.current = null;
          console.log('Camera stream stopped');
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          console.log('Video element cleared');
        }
        setIsCameraOn(false);
        addMessage('system', '📹 Camera turned off');
      }
    } catch (error) {
      console.error('Camera error:', error);
      addMessage('error', `Camera error: ${error.message}`);
    }
  }, [isCameraOn, addMessage, stopVideoFrameCapture]);

  // Flip between front and rear cameras while camera is active
  const flipCamera = useCallback(async () => {
    if (!isCameraOn) return;
    const newFacing = cameraFacingMode === 'user' ? 'environment' : 'user';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
          facingMode: newFacing
        }
      });

      // Stop existing stream
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(t => t.stop());
      }

      cameraStreamRef.current = stream;
      setCameraFacingMode(newFacing);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.error);
      }
    } catch (err) {
      console.error('Flip camera error:', err);
    }
  }, [isCameraOn, cameraFacingMode]);

  // Handle exit - distinguish between casual exit and session completion
  const handleExit = useCallback(() => {
    if (!isConnected && messages.length === 0) {
      // Casual exit - no session to save, just go back
      console.log('🚪 Casual exit - no session data to save');
      if (onExitLiveMode) {
        onExitLiveMode(); // Call without session data for simple exit
      }
    } else {
      // There might be session data to save - trigger disconnect
      console.log('🚪 Exit with potential session data - triggering disconnect');
      disconnect();
    }
  }, [isConnected, messages.length, onExitLiveMode, disconnect]);



  useImperativeHandle(ref, () => ({
    triggerDisconnect: disconnect
  }));

  return (
    <div className="gemini-live-container">

      {/* Video Section */}
      <div className="video-section">
        {isCameraOn && (
          <div className="video-preview">
            <video 
              ref={videoRef} 
              className="video-element" 
              autoPlay 
              muted 
              playsInline
            >
              Your browser does not support the video element.
            </video>
            {!videoRef.current?.srcObject && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: '#fff',
                fontSize: '14px'
              }}>
                Loading camera...
              </div>
            )}
            <IconButton
              className="flip-camera-btn"
              icon="arrow-repeat"
              label="Flip camera"
              onClick={flipCamera}
            />
          </div>
        )}
      </div>

      {/* Chat Section */}
      <div className="chat-section">
        <div className="messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.type}`}>
              <div className="message-content">{msg.message}</div>
              <div className="message-time">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Bottom controls cluster */}
      <div className="bottom-controls">
        {/* Text input */}
        <div className="text-input-container">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendTextMessage()}
            placeholder="Type a message..."
            disabled={!isConnected}
            className="text-input"
          />
          <button 
            onClick={sendTextMessage} 
            disabled={!isConnected || !textInput.trim()}
            className="send-btn"
          >
            ↑
          </button>
        </div>

        {/* Control buttons */}
        <div className="control-buttons">
          {/* Camera toggle */}
          <IconButton
            onClick={toggleCamera}
            icon={isCameraOn ? 'camera-video-fill' : 'camera-video'}
            className={`camera-btn ${isCameraOn ? 'active' : ''}`}
            disabled={!isConnected}
            label={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
          />

          {/* Microphone toggle */}
          <IconButton
            onClick={toggleMicrophone}
            icon={isMicOn ? 'mic-fill' : 'mic'}
            className={`mic-btn ${isMicOn ? 'active' : ''}`}
            disabled={!isConnected}
            label={isMicOn ? 'Turn off microphone' : 'Turn on microphone'}
          />

          {/* Connect/Disconnect button */}
          {!isConnected && !isConnecting ? (
            <IconButton
              onClick={connectToGemini}
              icon="play-fill"
              className="connect-btn"
              label="Connect to Gemini"
            />
          ) : (
            <IconButton
              onClick={disconnect}
              icon="stop-fill"
              className="disconnect-btn"
              label="Disconnect"
            />
          )}

          {/* Voice selection menu */}
          <div
            className={`voice-selector-container ${voiceMenuOpen ? 'open' : ''}`}
            ref={voiceMenuRef}
          >
            <IconButton
              className="voice-btn"
              icon="gear"
              onClick={() => setVoiceMenuOpen((v) => !v)}
              label="Voice settings"
            />
            <div className="voice-menu">
              <div className="voice-option-group">
                <label>Voice:</label>
                <select 
                  value={selectedVoice} 
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  disabled={isConnected}
                >
                  {voices.map(voice => (
                    <option key={voice} value={voice}>{voice}</option>
                  ))}
                </select>
              </div>
              <div className="voice-option-group">
                <label>Response Mode:</label>
                <select 
                  value={responseMode} 
                  onChange={(e) => setResponseMode(e.target.value)}
                  disabled={isConnected}
                >
                  <option value="TEXT">Text</option>
                  <option value="AUDIO">Audio</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

GeminiLiveDirect.displayName = 'GeminiLiveDirect';

export default GeminiLiveDirect; 
