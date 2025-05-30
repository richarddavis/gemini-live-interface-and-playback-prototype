import React, { useState, useRef, useCallback, useEffect } from 'react';
import { interactionLogger } from '../services/interactionLogger';
import './InteractionReplay.css';

const InteractionReplay = () => {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [replayData, setReplayData] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [loading, setLoading] = useState(false);

  const videoRef = useRef(null);
  const audioContextRef = useRef(null);
  const playbackTimeoutRef = useRef(null);

  // Load all available sessions on component mount
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const sessionsData = await interactionLogger.getAllReplaySessions();
      if (sessionsData && sessionsData.sessions) {
        setSessions(sessionsData.sessions);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
    setLoading(false);
  };

  const loadReplayData = async (sessionId) => {
    setLoading(true);
    try {
      const data = await interactionLogger.getReplayData(sessionId);
      setReplayData(data);
      setCurrentIndex(0);
      setIsPlaying(false);
    } catch (error) {
      console.error('Error loading replay data:', error);
    }
    setLoading(false);
  };

  const handleSessionSelect = (sessionId) => {
    setSelectedSession(sessionId);
    loadReplayData(sessionId);
  };

  const startReplay = () => {
    if (!replayData || !replayData.logs || replayData.logs.length === 0) return;
    
    setIsPlaying(true);
    setCurrentIndex(0);
    playNextInteraction(0);
  };

  const stopReplay = () => {
    setIsPlaying(false);
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
  };

  const playNextInteraction = (index) => {
    if (!isPlaying || !replayData || index >= replayData.logs.length) {
      setIsPlaying(false);
      return;
    }

    const currentLog = replayData.logs[index];
    setCurrentIndex(index);

    // Process the current interaction
    processInteraction(currentLog);

    // Calculate time to next interaction
    let delay = 1000 / playbackSpeed; // Default 1 second
    if (index < replayData.logs.length - 1) {
      const nextLog = replayData.logs[index + 1];
      const timeDiff = new Date(nextLog.timestamp) - new Date(currentLog.timestamp);
      delay = Math.max(100, timeDiff / playbackSpeed); // Minimum 100ms delay
    }

    playbackTimeoutRef.current = setTimeout(() => {
      playNextInteraction(index + 1);
    }, delay);
  };

  const processInteraction = (log) => {
    console.log('Replaying:', log.interaction_type, log.timestamp);

    switch (log.interaction_type) {
      case 'video_frame':
        displayVideoFrame(log);
        break;
      case 'audio_chunk':
        playAudioChunk(log);
        break;
      case 'text_input':
        displayTextInput(log);
        break;
      case 'api_response':
        displayApiResponse(log);
        break;
      case 'user_action':
        displayUserAction(log);
        break;
      default:
        console.log('Unknown interaction type:', log.interaction_type);
    }
  };

  const displayVideoFrame = (log) => {
    if (log.media_data && log.media_data.data_inline && videoRef.current) {
      try {
        // Convert base64 back to image
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(log.media_data.data_inline)));
        const imageUrl = `data:image/jpeg;base64,${base64Data}`;
        
        // Create an image element and display it
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          
          // Display in video element (convert canvas to video stream)
          const stream = canvas.captureStream(2); // 2 FPS
          videoRef.current.srcObject = stream;
        };
        img.src = imageUrl;
      } catch (error) {
        console.error('Error displaying video frame:', error);
      }
    }
  };

  const playAudioChunk = async (log) => {
    if (log.media_data && log.media_data.data_inline) {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000
          });
        }

        const audioContext = audioContextRef.current;
        const audioData = new Uint8Array(log.media_data.data_inline);
        
        // Convert PCM data back to audio buffer
        const sampleRate = log.interaction_metadata?.audio_sample_rate || 16000;
        const numSamples = audioData.length / 2; // 16-bit samples
        const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        
        // Convert back from PCM
        const dataView = new DataView(audioData.buffer);
        for (let i = 0; i < numSamples; i++) {
          const sample = dataView.getInt16(i * 2, true); // little-endian
          channelData[i] = sample / 32768.0;
        }
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start(0);
      } catch (error) {
        console.error('Error playing audio chunk:', error);
      }
    }
  };

  const displayTextInput = (log) => {
    // This would be displayed in a chat-like interface
    console.log('User typed:', log.media_data?.data || 'Text not stored');
  };

  const displayApiResponse = (log) => {
    // This would be displayed in a chat-like interface
    console.log('Gemini responded:', log.media_data?.data || 'Response not stored');
  };

  const displayUserAction = (log) => {
    console.log('User action:', log.interaction_metadata?.action_type, log.interaction_metadata?.action_details);
  };

  const jumpToInteraction = (index) => {
    setCurrentIndex(index);
    if (replayData && replayData.logs[index]) {
      processInteraction(replayData.logs[index]);
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="interaction-replay">
      <div className="replay-header">
        <h2>🎬 Interaction Replay</h2>
      </div>

      <div className="replay-content">
        {/* Session Selection */}
        <div className="session-selector">
          <h3>Select Session to Replay</h3>
          {loading && <p>Loading sessions...</p>}
          {sessions.length === 0 && !loading && (
            <p>No replay sessions found. Enable replay mode during interactions to record full data.</p>
          )}
          <div className="sessions-list">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`session-item ${selectedSession === session.session_id ? 'selected' : ''}`}
                onClick={() => handleSessionSelect(session.session_id)}
              >
                <div className="session-info">
                  <strong>Session {session.session_id}</strong>
                  <br />
                  <small>
                    {formatTimestamp(session.started_at)} - {session.duration_seconds}s
                    <br />
                    {session.video_frames_sent} video frames, {session.audio_chunks_sent} audio chunks
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Replay Controls */}
        {replayData && (
          <div className="replay-controls">
            <div className="playback-controls">
              <button onClick={startReplay} disabled={isPlaying}>
                ▶️ Play
              </button>
              <button onClick={stopReplay} disabled={!isPlaying}>
                ⏹️ Stop
              </button>
              <label>
                Speed:
                <select value={playbackSpeed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))}>
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={4}>4x</option>
                </select>
              </label>
            </div>

            <div className="progress-info">
              <p>
                Interaction {currentIndex + 1} of {replayData.logs.length}
                {replayData.logs[currentIndex] && (
                  <span> - {replayData.logs[currentIndex].interaction_type} at {formatTimestamp(replayData.logs[currentIndex].timestamp)}</span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Replay Display */}
        {replayData && (
          <div className="replay-display">
            <div className="video-replay">
              <h4>Video Replay</h4>
              <video
                ref={videoRef}
                className="replay-video"
                autoPlay
                muted
                style={{
                  width: '320px',
                  height: '240px',
                  backgroundColor: '#000',
                  border: '1px solid #ccc'
                }}
              />
            </div>

            <div className="interaction-timeline">
              <h4>Interaction Timeline</h4>
              <div className="timeline-container">
                {replayData.logs.map((log, index) => (
                  <div
                    key={index}
                    className={`timeline-item ${index === currentIndex ? 'current' : ''}`}
                    onClick={() => jumpToInteraction(index)}
                  >
                    <div className="timeline-marker"></div>
                    <div className="timeline-content">
                      <strong>{log.interaction_type}</strong>
                      <br />
                      <small>{formatTimestamp(log.timestamp)}</small>
                      {log.interaction_metadata && (
                        <div className="metadata">
                          {log.interaction_metadata.data_size_bytes && (
                            <span>{log.interaction_metadata.data_size_bytes} bytes</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InteractionReplay; 