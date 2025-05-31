import React, { useState, useEffect, useRef } from 'react';
import { interactionLogger } from '../services/interactionLogger';
import './InteractionReplay.css';
import { useAudioStreaming } from '../hooks/useAudioStreaming';

const InteractionReplay = () => {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [replayData, setReplayData] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const [shouldStartPlayback, setShouldStartPlayback] = useState(false);
  
  // State for displaying replay content
  const [currentVideoFrame, setCurrentVideoFrame] = useState(null);
  const [currentTextInput, setCurrentTextInput] = useState('');
  const [currentApiResponse, setCurrentApiResponse] = useState('');
  const [currentUserAction, setCurrentUserAction] = useState('');
  const [replayStatus, setReplayStatus] = useState('Ready to replay...');
  const [audioCache, setAudioCache] = useState(new Map());
  const [videoCache, setVideoCache] = useState(new Map());
  const [mediaCacheReady, setMediaCacheReady] = useState(false);
  const [isRegeneratingUrls, setIsRegeneratingUrls] = useState(false);

  // Audio streaming state for realistic replay
  const [isStreamingAudio, setIsStreamingAudio] = useState(false);

  const videoRef = useRef(null);
  const audioContextRef = useRef(null);
  const playbackTimeoutRef = useRef(null);

  // NEW: Audio streaming hooks for different audio sources
  const geminiAudioStreaming = useAudioStreaming({
    timeout: 200, // Faster timeout for API chunks (replicate live behavior)
    audioSource: 'gemini_api',
    sampleRate: 24000,
    onStreamStart: (data) => {
      console.log('🎵 Gemini audio stream started:', data);
      setIsStreamingAudio(true);
      setReplayStatus('🎵 Starting Gemini audio stream...');
    },
    onStreamEnd: (data) => {
      console.log('🎵 Gemini audio stream ended:', data);
      setReplayStatus(`🔊 Playing Gemini audio stream (${data.chunks_count} chunks)`);
    },
    onPlaybackStart: (data) => {
      console.log('🎵 Gemini audio playback started:', data);
      setReplayStatus(`🔊 Playing Gemini audio (${data.estimated_duration.toFixed(2)}s, ${data.chunks_count} chunks)`);
    },
    onPlaybackEnd: (data) => {
      console.log('🎵 Gemini audio playback ended:', data);
      setIsStreamingAudio(false);
      setReplayStatus('🎵 Gemini audio stream completed');
    },
    onError: (error) => {
      console.error('🚨 Gemini audio streaming error:', error);
      setIsStreamingAudio(false);
      setReplayStatus('❌ Gemini audio error');
    }
  });

  const userAudioStreaming = useAudioStreaming({
    timeout: 500, // Longer timeout for user audio (different behavior)
    audioSource: 'user_microphone',
    sampleRate: 16000, // User audio is typically 16kHz
    onStreamStart: (data) => {
      console.log('🎵 User audio stream started:', data);
      setReplayStatus('🎤 Playing user audio...');
    },
    onStreamEnd: (data) => {
      console.log('🎵 User audio stream ended:', data);
    },
    onPlaybackStart: (data) => {
      console.log('🎵 User audio playback started:', data);
      setReplayStatus(`🎤 Playing user audio (${data.estimated_duration.toFixed(2)}s)`);
    },
    onPlaybackEnd: (data) => {
      console.log('🎵 User audio playback ended:', data);
      setReplayStatus('🎤 User audio completed');
    },
    onError: (error) => {
      console.error('🚨 User audio streaming error:', error);
      setReplayStatus('❌ User audio error');
    }
  });

  // Load all available sessions on component mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Handle playback start after state updates
  useEffect(() => {
    if (shouldStartPlayback && isPlaying && replayData?.logs?.length > 0) {
      console.log('🎬 useEffect: Starting playback after state update');
      setShouldStartPlayback(false);
      playNextInteraction(0);
    }
  }, [shouldStartPlayback, isPlaying, replayData]);

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
      setAudioCache(new Map());
      setVideoCache(new Map());
      setMediaCacheReady(false);
      
      // Start preloading media if there are audio chunks or video frames
      if (data && data.logs) {
        preloadMediaContent(data.logs);
      }
    } catch (error) {
      console.error('Error loading replay data:', error);
    }
    setLoading(false);
  };

  const preloadMediaContent = async (logs) => {
    try {
      setReplayStatus('Analyzing media content...');
      
      // Filter different types of media content
      const audioLogs = logs.filter(log => 
        (log.interaction_type === 'audio_chunk' || log.interaction_type === 'api_response') &&
        log.media_data && 
        log.media_data.cloud_storage_url
      );

      const videoLogs = logs.filter(log => 
        log.interaction_type === 'video_frame' &&
        log.media_data && 
        log.media_data.cloud_storage_url
      );

      const totalMedia = audioLogs.length + videoLogs.length;
      
      if (totalMedia === 0) {
        console.log('🎬 No media content to preload');
        setMediaCacheReady(true);
        setReplayStatus('Ready to replay...');
        return;
      }

      console.log(`🎬 Preloading ${audioLogs.length} audio chunks and ${videoLogs.length} video frames in parallel...`);
      
      // Initialize audio context for audio processing
      let audioContext = null;
      if (audioLogs.length > 0) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 24000
          });
        }
        audioContext = audioContextRef.current;
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
      }

      // Create parallel download promises for audio
      const audioPromises = audioLogs.map(async (log, index) => {
        try {
          const proxyUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:8080/api'}/interaction-logs/media/${log.id}`;
          const response = await fetch(proxyUrl);
          
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const sampleRate = log.interaction_metadata?.audio_sample_rate || 24000;
            
            // Convert PCM data to audio buffer
            const dataView = new DataView(arrayBuffer);
            const numSamples = arrayBuffer.byteLength / 2; // 16-bit samples
            
            const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
            const channelData = audioBuffer.getChannelData(0);
            
            for (let j = 0; j < numSamples; j++) {
              const sample = dataView.getInt16(j * 2, true); // little-endian
              channelData[j] = sample / 32768.0;
            }
            
            console.log(`🎬 Downloaded audio ${index + 1}/${audioLogs.length}: ${log.id} (${audioBuffer.duration.toFixed(3)}s)`);
            return { logId: log.id, audioBuffer, success: true };
          } else if (response.status === 502 || response.status === 400) {
            // Handle expired GCS URLs gracefully
            console.warn(`🎬 Audio ${log.id} media unavailable (likely expired URL): ${response.status}`);
            return { logId: log.id, success: false, error: 'expired_url', httpStatus: response.status };
          } else {
            console.warn(`Failed to download audio ${log.id}: ${response.status}`);
            return { logId: log.id, success: false, error: `HTTP ${response.status}` };
          }
        } catch (error) {
          console.error(`Failed to preload audio chunk ${log.id}:`, error);
          return { logId: log.id, success: false, error: error.message };
        }
      });

      // Create parallel download promises for video
      const videoPromises = videoLogs.map(async (log, index) => {
        try {
          const proxyUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:8080/api'}/interaction-logs/media/${log.id}`;
          const response = await fetch(proxyUrl);
          
          if (response.ok) {
            const blob = await response.blob();
            const imageUrl = URL.createObjectURL(blob);
            
            console.log(`🎬 Downloaded video ${index + 1}/${videoLogs.length}: ${log.id} (${blob.type}, ${blob.size} bytes)`);
            return {
              logId: log.id,
              frameData: {
                url: imageUrl,
                blob: blob,
                size: blob.size,
                type: blob.type
              },
              success: true
            };
          } else if (response.status === 502 || response.status === 400) {
            // Handle expired GCS URLs gracefully
            console.warn(`🎬 Video ${log.id} media unavailable (likely expired URL): ${response.status}`);
            return { logId: log.id, success: false, error: 'expired_url', httpStatus: response.status };
          } else {
            console.warn(`Failed to download video ${log.id}: ${response.status}`);
            return { logId: log.id, success: false, error: `HTTP ${response.status}` };
          }
        } catch (error) {
          console.error(`Failed to preload video frame ${log.id}:`, error);
          return { logId: log.id, success: false, error: error.message };
        }
      });

      // Show progress while downloads are happening
      setReplayStatus(`🚀 Downloading ${totalMedia} media files in parallel...`);
      
      // Wait for all downloads to complete (both successes and failures)
      const [audioResults, videoResults] = await Promise.all([
        Promise.allSettled(audioPromises),
        Promise.allSettled(videoPromises)
      ]);

      // Process results and build caches
      const audioCache = new Map();
      const videoCache = new Map();
      
      let audioSuccessCount = 0;
      let audioExpiredCount = 0;
      audioResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          audioCache.set(result.value.logId, result.value.audioBuffer);
          audioSuccessCount++;
        } else if (result.status === 'fulfilled' && result.value.error === 'expired_url') {
          audioExpiredCount++;
        }
      });

      let videoSuccessCount = 0;
      let videoExpiredCount = 0;
      videoResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          videoCache.set(result.value.logId, result.value.frameData);
          videoSuccessCount++;
        } else if (result.status === 'fulfilled' && result.value.error === 'expired_url') {
          videoExpiredCount++;
        }
      });

      // Update cache states
      setAudioCache(audioCache);
      setVideoCache(videoCache);
      setMediaCacheReady(true);
      
      const statusParts = [];
      if (audioSuccessCount > 0) statusParts.push(`${audioSuccessCount}/${audioLogs.length} audio chunks`);
      if (videoSuccessCount > 0) statusParts.push(`${videoSuccessCount}/${videoLogs.length} video frames`);
      
      const statusText = statusParts.join(' and ');
      const expiredCount = audioExpiredCount + videoExpiredCount;
      const otherFailedCount = (audioLogs.length - audioSuccessCount - audioExpiredCount) + 
                              (videoLogs.length - videoSuccessCount - videoExpiredCount);
      
      let failedText = '';
      if (expiredCount > 0) {
        failedText += ` (${expiredCount} expired URLs)`;
      }
      if (otherFailedCount > 0) {
        failedText += ` (${otherFailedCount} other failures)`;
      }
      
      // Set status message based on results
      if (audioSuccessCount === 0 && videoSuccessCount === 0) {
        if (expiredCount > 0) {
          setReplayStatus(`⏳ Media unavailable due to expired URLs - replay will show interaction timing only`);
        } else {
          setReplayStatus('❌ Media preloading failed - replay will show interaction timing only');
        }
      } else {
        setReplayStatus(`⚡ Media preloaded: ${statusText}${failedText} - ready for replay`);
      }
      
      console.log(`🎬 Parallel preload complete: ${audioCache.size} audio, ${videoCache.size} video. Expired: ${expiredCount}, Other failures: ${otherFailedCount}`);

    } catch (error) {
      console.error('Error preloading media:', error);
      setMediaCacheReady(true);
      setReplayStatus('⚠️ Media preloading failed - replay will show interaction timing only');
    }
  };

  const regenerateUrls = async () => {
    if (!selectedSession) {
      console.error('No session selected for URL regeneration');
      return;
    }

    setIsRegeneratingUrls(true);
    setReplayStatus('🔄 Regenerating expired URLs...');

    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:8080/api'}/interaction-logs/regenerate-urls/${selectedSession}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log('🔄 URL regeneration result:', result);

        if (result.regenerated > 0) {
          setReplayStatus(`✅ Regenerated ${result.regenerated} URLs successfully! Reloading session data...`);
          
          // Reload the replay data to get fresh URLs
          await loadReplayData(selectedSession);
          
          setReplayStatus(`✅ URLs regenerated and session reloaded - ready for replay with fresh URLs!`);
        } else {
          setReplayStatus('⚠️ No URLs needed regeneration or regeneration failed');
        }

        if (result.failed > 0) {
          console.warn('Some URL regenerations failed:', result.errors);
        }
      } else {
        const errorData = await response.json();
        console.error('URL regeneration failed:', errorData);
        setReplayStatus(`❌ Failed to regenerate URLs: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error regenerating URLs:', error);
      setReplayStatus('❌ Error occurred while regenerating URLs');
    } finally {
      setIsRegeneratingUrls(false);
    }
  };

  const handleSessionSelect = (sessionId) => {
    setSelectedSession(sessionId);
    loadReplayData(sessionId);
  };

  const startReplay = () => {
    console.log('🎬 startReplay called');
    console.log('🎬 replayData:', replayData);
    console.log('🎬 replayData.logs:', replayData?.logs);
    console.log('🎬 logs length:', replayData?.logs?.length);
    
    if (!replayData || !replayData.logs || replayData.logs.length === 0) {
      console.log('🎬 startReplay: No data to replay');
      setReplayStatus('No data available for replay');
      return;
    }
    
    if (!mediaCacheReady) {
      setReplayStatus('Please wait for media content to finish preloading...');
      return;
    }
    
    console.log('🎬 Starting replay with', replayData.logs.length, 'interactions');
    console.log('🎬 Audio cache size:', audioCache.size);
    setReplayStatus(`Starting replay of ${replayData.logs.length} interactions...`);
    setIsPlaying(true);
    setCurrentIndex(0);
    setShouldStartPlayback(true); // Trigger useEffect after state updates
  };

  const stopReplay = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
    setCurrentVideoFrame(null);
    setCurrentTextInput('');
    setCurrentApiResponse('');
    setCurrentUserAction('');
    setReplayStatus('Replay stopped');
    
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
    
    // Clean up audio streaming state - UPDATED for useAudioStreaming hooks
    setIsStreamingAudio(false);
    geminiAudioStreaming.clearBuffer();
    userAudioStreaming.clearBuffer();
  };

  const playNextInteraction = (index) => {
    console.log('🎬 playNextInteraction called with index:', index);
    console.log('🎬 isPlaying:', isPlaying);
    console.log('🎬 replayData exists:', !!replayData);
    console.log('🎬 index >= replayData.logs.length:', index >= (replayData?.logs?.length || 0));
    
    if (!isPlaying || !replayData || index >= replayData.logs.length) {
      console.log('🎬 playNextInteraction: Stopping playback');
      setIsPlaying(false);
      return;
    }

    const currentLog = replayData.logs[index];
    console.log('🎬 Processing interaction:', currentLog);
    setCurrentIndex(index);

    // Process the current interaction
    processInteraction(currentLog);

    // Improved timing logic with better audio handling
    let delay = 50; // Minimum delay for smooth playback
    
    if (index < replayData.logs.length - 1) {
      const nextLog = replayData.logs[index + 1];
      const timeDiff = new Date(nextLog.timestamp) - new Date(currentLog.timestamp);
      
      // Special handling for audio streaming events
      if (currentLog.interaction_type === 'user_action' && 
          currentLog.interaction_metadata?.action_type === 'audio_stream_start') {
        // When audio streaming starts, move quickly to the next interaction
        delay = Math.min(100, Math.max(30, timeDiff / playbackSpeed));
      } else if (currentLog.interaction_type === 'audio_chunk' && nextLog.interaction_type === 'audio_chunk') {
        // For consecutive audio chunks, check if they're from the same source
        const currentIsUserAudio = currentLog.interaction_metadata?.microphone_on === true;
        const nextIsUserAudio = nextLog.interaction_metadata?.microphone_on === true;
        
        if (!currentIsUserAudio && !nextIsUserAudio) {
          // Both are API audio chunks - these should be processed quickly for streaming
          delay = Math.min(50, Math.max(20, timeDiff / playbackSpeed));
        } else if (currentIsUserAudio && nextIsUserAudio) {
          // Both are user audio - normal timing
          delay = Math.min(150, Math.max(30, timeDiff / playbackSpeed));
        } else {
          // Different source audio - allow more time for context switch
          delay = Math.min(500, Math.max(100, timeDiff / playbackSpeed));
        }
      } else if (currentLog.interaction_type === 'video_frame' && nextLog.interaction_type === 'video_frame') {
        // For video frames, use precise timing based on actual timestamps
        const frameDelay = Math.max(16, timeDiff / playbackSpeed); // Minimum 16ms for 60fps
        delay = Math.min(200, frameDelay); // Cap at 200ms for very slow sequences
      } else if (currentLog.interaction_type === 'api_response' || nextLog.interaction_type === 'api_response') {
        // API responses often need more processing time
        delay = Math.min(1000, Math.max(200, timeDiff / playbackSpeed));
      } else if (isStreamingAudio && 
                 (currentLog.interaction_type === 'audio_chunk' || 
                  currentLog.interaction_type === 'api_response')) {
        // If we're currently streaming audio, process audio-related events faster
        delay = Math.min(100, Math.max(20, timeDiff / playbackSpeed));
      } else {
        // For other interactions, use normal timing
        delay = Math.max(50, Math.min(1500, timeDiff / playbackSpeed)); // Cap at 1.5 seconds
      }
    }

    console.log('🎬 Setting timeout for next interaction in', delay, 'ms', `(${currentLog.interaction_type} -> ${index < replayData.logs.length - 1 ? replayData.logs[index + 1].interaction_type : 'end'})`);
    playbackTimeoutRef.current = setTimeout(() => {
      playNextInteraction(index + 1);
    }, delay);
  };

  const processInteraction = (log) => {
    console.log('🎬 Replaying:', log.interaction_type, log.timestamp);
    console.log('🎬 Log data:', log);

    switch (log.interaction_type) {
      case 'video_frame':
        displayVideoFrame(log);
        break;
      case 'audio_chunk':
        handleAudioChunkForStreaming(log);
        break;
      case 'text_input':
        displayTextInput(log);
        break;
      case 'api_response':
        handleApiResponseForStreaming(log);
        break;
      case 'user_action':
        handleUserActionForStreaming(log);
        break;
      default:
        console.log('Unknown interaction type:', log.interaction_type);
    }
  };

  // Handle audio chunks with streaming logic - UPDATED to use useAudioStreaming hooks
  const handleAudioChunkForStreaming = async (log) => {
    const isUserAudio = log.interaction_metadata?.microphone_on === true;
    
    // Fetch the audio data if not cached
    let audioArrayBuffer = null;
    
    if (audioCache.has(log.id)) {
      // Convert cached AudioBuffer back to ArrayBuffer for hook
      const cachedBuffer = audioCache.get(log.id);
      // For now, we'll create a mock ArrayBuffer - in production this would be optimized
      audioArrayBuffer = new ArrayBuffer(cachedBuffer.length * 2); // Estimate based on 16-bit samples
    } else if (log.media_data && log.media_data.cloud_storage_url) {
      try {
        const proxyUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:8080/api'}/interaction-logs/media/${log.id}`;
        const response = await fetch(proxyUrl);
        
        if (response.ok) {
          audioArrayBuffer = await response.arrayBuffer();
        }
      } catch (error) {
        console.error('Error loading audio chunk:', error);
        return;
      }
    }
    
    if (audioArrayBuffer) {
      if (isUserAudio) {
        console.log('🎵 Adding user audio chunk to stream:', log.id);
        userAudioStreaming.addAudioChunk(audioArrayBuffer);
      } else {
        console.log('🎵 Adding API audio chunk to stream:', log.id);
        geminiAudioStreaming.addAudioChunk(audioArrayBuffer);
      }
    } else {
      console.warn('🎵 No audio data available for chunk:', log.id);
    }
  };

  // Handle API responses that might be audio
  const handleApiResponseForStreaming = (log) => {
    // Check if this is an audio response
    if (log.interaction_metadata?.response_type === 'audio') {
      handleAudioChunkForStreaming(log);
    } else {
      displayApiResponse(log);
    }
  };

  // Handle user actions, including audio streaming events - UPDATED for new hooks
  const handleUserActionForStreaming = (log) => {
    const actionType = log.interaction_metadata?.action_type;
    
    if (actionType === 'audio_stream_start') {
      console.log('🎵 Audio stream start event detected');
      setReplayStatus('🎵 Gemini audio stream starting...');
      // The hooks will handle the streaming automatically
    } else if (actionType === 'audio_stream_end') {
      console.log('🎵 Audio stream end event detected');
      // The hooks will trigger playback on timeout, but we can force it if needed
      geminiAudioStreaming.clearBuffer(); // This will trigger any pending streams
    } else {
      displayUserAction(log);
    }
  };

  const displayVideoFrame = async (log) => {
    // First, check if we have this video frame cached
    if (videoCache.has(log.id)) {
      try {
        console.log('🎬 Displaying cached video frame for interaction:', log.id);
        
        const cachedFrame = videoCache.get(log.id);
        const imageUrl = cachedFrame.url;
        
        // Find or create image container
        if (videoRef.current) {
          console.log('🎬 Video ref found, updating display with cached frame');
          
          // Clear any existing video streams
          if (videoRef.current.srcObject) {
            const tracks = videoRef.current.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            videoRef.current.srcObject = null;
          }
          
          // Hide the video element and show image instead
          videoRef.current.style.display = 'none';
          
          // Find or create image element next to video
          let imgElement = videoRef.current.parentElement.querySelector('img.replay-frame');
          if (!imgElement) {
            imgElement = document.createElement('img');
            imgElement.className = 'replay-frame';
            imgElement.style.width = '320px';
            imgElement.style.height = '240px';
            imgElement.style.backgroundColor = '#000';
            imgElement.style.border = '1px solid #ccc';
            imgElement.style.objectFit = 'contain';
            imgElement.style.display = 'block';
            
            // Insert after the video element
            videoRef.current.parentElement.insertBefore(imgElement, videoRef.current.nextSibling);
            console.log('🎬 Created new image element for cached frame');
          }
          
          // Set cached image
          imgElement.src = imageUrl;
          imgElement.onload = () => {
            console.log('🎬 Cached video frame displayed successfully:', imgElement.naturalWidth, 'x', imgElement.naturalHeight);
          };
          
          console.log('🎬 Cached video frame displayed instantly');
        } else {
          console.error('🎬 Video ref not found for cached frame!');
        }
        
        setCurrentVideoFrame(`Frame ${log.id} (cached) loaded at ${new Date().toLocaleTimeString()}`);
        return;
      } catch (error) {
        console.error('Error displaying cached video frame:', error);
      }
    }

    // Fallback to network fetch if not cached
    if (log.media_data && log.media_data.cloud_storage_url) {
      try {
        console.log('🎬 Loading video frame via backend proxy for interaction:', log.id, '(not cached)');
        
        // Use backend proxy endpoint instead of direct GCS URL
        const proxyUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:8080/api'}/interaction-logs/media/${log.id}`;
        console.log('🎬 Fetching from proxy URL:', proxyUrl);
        
        const response = await fetch(proxyUrl);
        console.log('🎬 Proxy response status:', response.status, response.statusText);
        
        if (response.ok) {
          const blob = await response.blob();
          console.log('🎬 Blob received:', blob.type, blob.size, 'bytes');
          
          const imageUrl = URL.createObjectURL(blob);
          console.log('🎬 Created blob URL:', imageUrl);
          
          // Find or create image container
          if (videoRef.current) {
            console.log('🎬 Video ref found, updating display');
            
            // Clear any existing video streams
            if (videoRef.current.srcObject) {
              const tracks = videoRef.current.srcObject.getTracks();
              tracks.forEach(track => track.stop());
              videoRef.current.srcObject = null;
            }
            
            // Hide the video element and show image instead
            videoRef.current.style.display = 'none';
            
            // Find or create image element next to video
            let imgElement = videoRef.current.parentElement.querySelector('img.replay-frame');
            if (!imgElement) {
              imgElement = document.createElement('img');
              imgElement.className = 'replay-frame';
              imgElement.style.width = '320px';
              imgElement.style.height = '240px';
              imgElement.style.backgroundColor = '#000';
              imgElement.style.border = '1px solid #ccc';
              imgElement.style.objectFit = 'contain';
              imgElement.style.display = 'block';
              
              // Insert after the video element
              videoRef.current.parentElement.insertBefore(imgElement, videoRef.current.nextSibling);
              console.log('🎬 Created new image element');
            }
            
            // Clean up previous image URL
            if (imgElement.src && imgElement.src.startsWith('blob:')) {
              URL.revokeObjectURL(imgElement.src);
            }
            
            // Set new image
            imgElement.src = imageUrl;
            imgElement.onload = () => {
              console.log('🎬 Image loaded successfully:', imgElement.naturalWidth, 'x', imgElement.naturalHeight);
            };
            imgElement.onerror = (error) => {
              console.error('🎬 Image failed to load:', error);
            };
            
            console.log('🎬 Video frame displayed as image');
          } else {
            console.error('🎬 Video ref not found!');
          }
          
          setCurrentVideoFrame(`Frame ${log.id} loaded at ${new Date().toLocaleTimeString()}`);
        } else if (response.status === 502 || response.status === 400) {
          // Handle expired GCS URLs gracefully
          console.warn('🎬 Video frame media unavailable (likely expired URL):', response.status);
          
          // Show placeholder for unavailable media
          if (videoRef.current) {
            // Hide the video element
            videoRef.current.style.display = 'none';
            
            // Find or create placeholder element
            let imgElement = videoRef.current.parentElement.querySelector('img.replay-frame');
            if (!imgElement) {
              imgElement = document.createElement('img');
              imgElement.className = 'replay-frame';
              imgElement.style.width = '320px';
              imgElement.style.height = '240px';
              imgElement.style.backgroundColor = '#333';
              imgElement.style.border = '1px solid #ccc';
              imgElement.style.objectFit = 'contain';
              imgElement.style.display = 'flex';
              imgElement.style.alignItems = 'center';
              imgElement.style.justifyContent = 'center';
              imgElement.style.color = '#fff';
              imgElement.style.fontSize = '14px';
              imgElement.style.textAlign = 'center';
              
              // Insert after the video element
              videoRef.current.parentElement.insertBefore(imgElement, videoRef.current.nextSibling);
            }
            
            // Create a canvas with placeholder text
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 240;
            const ctx = canvas.getContext('2d');
            
            // Fill background
            ctx.fillStyle = '#333';
            ctx.fillRect(0, 0, 320, 240);
            
            // Add text
            ctx.fillStyle = '#fff';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Video frame unavailable', 160, 110);
            ctx.fillText('(expired media URL)', 160, 130);
            
            // Set canvas as image source
            imgElement.src = canvas.toDataURL();
          }
          
          setCurrentVideoFrame(`Frame ${log.id} - media unavailable (expired URL)`);
        } else {
          console.error('Failed to fetch video frame via proxy:', response.status);
          setCurrentVideoFrame(`Error loading video frame - HTTP ${response.status}`);
        }
      } catch (error) {
        console.error('Error displaying video frame:', error);
        setCurrentVideoFrame('Error loading video frame');
      }
    } else if (log.media_data && log.media_data.storage_type === 'hash_only') {
      setCurrentVideoFrame('Video frame captured (hash-only mode - no replay data)');
    } else {
      setCurrentVideoFrame('No video frame data available');
    }
  };

  const playAudioChunk = async (log) => {
    // Determine if this is user audio or API audio
    const isUserAudio = log.interaction_metadata?.microphone_on === true;
    const audioSource = isUserAudio ? 'User' : 'API';
    
    // First, check if we have this audio chunk cached
    if (audioCache.has(log.id)) {
      try {
        console.log(`🎬 Playing cached ${audioSource} audio chunk for interaction:`, log.id);
        
        // Initialize audio context if needed with appropriate sample rate
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 24000 // Use consistent 24kHz for playback
          });
        }

        const audioContext = audioContextRef.current;
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        // Get the cached audio buffer
        const audioBuffer = audioCache.get(log.id);
        
        // Create and play audio source with appropriate gain for user vs API audio
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = audioBuffer;
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Adjust volume based on audio source (user audio is often quieter)
        gainNode.gain.value = isUserAudio ? 1.2 : 0.8; // Boost user audio, lower API audio
        
        source.start(0);
        
        console.log(`🎬 Playing cached ${audioSource} PCM audio chunk: ${audioBuffer.duration.toFixed(3)}s (instant playback)`);
        
        // Visual feedback for audio type
        setReplayStatus(`🔊 Playing ${audioSource.toLowerCase()} audio (${audioBuffer.duration.toFixed(2)}s)`);
        return;
      } catch (error) {
        console.error(`Error playing cached ${audioSource} audio chunk:`, error);
      }
    }

    // Fallback to network fetch if not cached
    if (log.media_data && log.media_data.cloud_storage_url) {
      try {
        console.log(`🎬 Loading ${audioSource} audio chunk via backend proxy for interaction:`, log.id, '(not cached)');
        
        // Use backend proxy endpoint instead of direct GCS URL
        const proxyUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:8080/api'}/interaction-logs/media/${log.id}`;
        const response = await fetch(proxyUrl);
        
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          
          // Initialize audio context if needed
          if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
              sampleRate: 24000 // Consistent 24kHz for playback
            });
          }

          const audioContext = audioContextRef.current;
          
          // Resume audio context if suspended (required for user interaction policies)
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }
          
          // For PCM data, we need to process it differently than for encoded audio
          if (response.headers.get('content-type') === 'audio/pcm' || log.media_data.cloud_storage_url.includes('.pcm')) {
            // Handle raw PCM data with proper sample rate detection
            let sampleRate = 24000; // Default
            
            // Try to get sample rate from metadata
            if (log.interaction_metadata?.audio_sample_rate) {
              sampleRate = log.interaction_metadata.audio_sample_rate;
            } else if (isUserAudio) {
              sampleRate = 16000; // User audio is typically 16kHz
            }
            
            const audioData = new Uint8Array(arrayBuffer);
            const numSamples = audioData.length / 2; // 16-bit samples
            
            const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
            const channelData = audioBuffer.getChannelData(0);
            
            // Convert PCM data to audio buffer
            const dataView = new DataView(arrayBuffer);
            for (let i = 0; i < numSamples; i++) {
              const sample = dataView.getInt16(i * 2, true); // little-endian
              channelData[i] = sample / 32768.0;
            }
            
            const source = audioContext.createBufferSource();
            const gainNode = audioContext.createGain();
            
            source.buffer = audioBuffer;
            source.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Adjust volume based on audio source
            gainNode.gain.value = isUserAudio ? 1.2 : 0.8;
            
            // Start audio immediately without additional delays
            source.start(0);
            
            console.log(`🎬 Playing ${audioSource} PCM audio chunk (network):`, numSamples, 'samples at', sampleRate, 'Hz', `(${audioBuffer.duration.toFixed(3)}s)`);
            setReplayStatus(`🔊 Playing ${audioSource.toLowerCase()} audio (${audioBuffer.duration.toFixed(2)}s) - network`);
          } else {
            // Handle encoded audio (MP3, WAV, etc.)
            try {
              const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
              const source = audioContext.createBufferSource();
              const gainNode = audioContext.createGain();
              
              source.buffer = audioBuffer;
              source.connect(gainNode);
              gainNode.connect(audioContext.destination);
              
              // Adjust volume based on audio source
              gainNode.gain.value = isUserAudio ? 1.2 : 0.8;
              
              source.start(0);
              
              console.log(`🎬 Playing ${audioSource} encoded audio chunk:`, audioBuffer.duration, 'seconds');
              setReplayStatus(`🔊 Playing ${audioSource.toLowerCase()} audio (${audioBuffer.duration.toFixed(2)}s) - encoded`);
            } catch (decodeError) {
              console.error(`Failed to decode ${audioSource} audio data:`, decodeError);
            }
          }
        } else if (response.status === 502 || response.status === 400) {
          // Handle expired GCS URLs gracefully
          console.warn(`🎬 ${audioSource} audio chunk media unavailable (likely expired URL):`, response.status);
          setReplayStatus(`⏸️ ${audioSource} audio unavailable (expired URL)`);
        } else {
          console.error(`Failed to fetch ${audioSource} audio chunk via proxy:`, response.status);
          setReplayStatus(`❌ Failed to load ${audioSource.toLowerCase()} audio - HTTP ${response.status}`);
        }
      } catch (error) {
        console.error(`Error playing ${audioSource} audio chunk:`, error);
        setReplayStatus(`❌ Error playing ${audioSource.toLowerCase()} audio`);
      }
    } else if (log.media_data && log.media_data.storage_type === 'hash_only') {
      console.log(`🎬 ${audioSource} audio chunk captured (hash-only mode - no replay data)`);
      setReplayStatus(`${audioSource} audio detected (hash-only mode)`);
    } else {
      console.log(`🎬 No ${audioSource} audio chunk data available`);
      setReplayStatus(`No ${audioSource.toLowerCase()} audio available`);
    }
  };

  const displayTextInput = (log) => {
    // Check for GCS stored text data first, then fallback to hash-only info
    let textContent = 'Text input detected';
    
    if (log.media_data && log.media_data.cloud_storage_url) {
      // For future: we could fetch text content from GCS if stored
      textContent = `Text input stored in cloud (ID: ${log.id})`;
    } else if (log.media_data && log.media_data.storage_type === 'hash_only') {
      textContent = `Text input detected (${log.id}) - Data stored as hash only for privacy`;
    } else if (log.interaction_metadata?.text) {
      textContent = log.interaction_metadata.text;
    }
    
    console.log('🎬 User typed:', textContent);
    setCurrentTextInput(textContent);
    setReplayStatus(`Processing text input...`);
  };

  const displayApiResponse = async (log) => {
    console.log('🎬 API Response log:', log);
    console.log('🎬 media_data:', log.media_data);
    console.log('🎬 interaction_metadata:', log.interaction_metadata);
    
    let responseText = 'Gemini API response received';
    
    if (log.media_data && log.media_data.cloud_storage_url) {
      try {
        console.log('🎬 Loading API response via backend proxy for interaction:', log.id);
        
        // Use backend proxy endpoint instead of direct GCS URL
        const proxyUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:8080/api'}/interaction-logs/media/${log.id}`;
        const response = await fetch(proxyUrl);
        
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          
          if (contentType === 'application/json') {
            // If it's stored as JSON, parse it
            const jsonData = await response.json();
            responseText = `Gemini response: ${JSON.stringify(jsonData, null, 2)}`;
          } else if (contentType === 'audio/pcm') {
            // If it's audio response, note that and play it
            responseText = 'Gemini responded with audio (playing...)';
            await playAudioChunk(log); // Reuse audio playing logic
          } else {
            // Text response
            responseText = `Gemini response: ${await response.text()}`;
          }
        } else if (response.status === 502 || response.status === 400) {
          // Handle expired GCS URLs gracefully
          responseText = `Gemini response stored in cloud (${log.id}) - Media unavailable (expired URL)`;
        } else {
          responseText = `Gemini response stored in cloud (ID: ${log.id}) - Failed to fetch via proxy (${response.status})`;
        }
      } catch (error) {
        console.error('Error fetching API response via proxy:', error);
        responseText = `Gemini response stored in cloud (ID: ${log.id}) - Error fetching via proxy`;
      }
    } else if (log.media_data && log.media_data.storage_type === 'hash_only') {
      responseText = `Gemini response detected (${log.id}) - Data stored as hash only. Enable replay mode for full content.`;
    } else if (log.interaction_metadata?.response_text) {
      responseText = log.interaction_metadata.response_text;
    }
    
    console.log('🎬 Gemini responded:', responseText);
    setCurrentApiResponse(responseText);
    setReplayStatus(`Processing API response...`);
  };

  const displayUserAction = (log) => {
    const actionType = log.interaction_metadata?.action_type || 'action';
    const actionDetails = log.interaction_metadata?.action_details || `User interaction (${log.id})`;
    const actionText = `${actionType}: ${actionDetails}`;
    console.log('🎬 User action:', actionType, actionDetails);
    setCurrentUserAction(actionText);
    setReplayStatus(`Processing user action: ${actionType}`);
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
          <div className="replay-mode-notice">
            <strong>📝 Note:</strong> For full replay with actual content, use "Live Mode" to record a new session. 
            Old sessions only have hash data for privacy.
          </div>
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
        <div className="replay-main-content">
          {replayData && (
            <div className="replay-controls">
              <div className="playback-controls">
                <button onClick={startReplay} disabled={isPlaying || !mediaCacheReady}>
                  {!mediaCacheReady ? '⏳ Loading...' : '▶️ Play'}
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
                {/* Show regenerate button when URLs are expired */}
                {(replayStatus.includes('expired URL') || replayStatus.includes('Media unavailable')) && (
                  <button 
                    onClick={regenerateUrls} 
                    disabled={isRegeneratingUrls || isPlaying}
                    style={{
                      marginLeft: '10px',
                      backgroundColor: isRegeneratingUrls ? '#666' : '#007bff',
                      color: 'white',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      cursor: isRegeneratingUrls ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isRegeneratingUrls ? '🔄 Regenerating...' : '🔄 Fix Expired URLs'}
                  </button>
                )}
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
              <div className="replay-display-content">
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
                  {currentVideoFrame && (
                    <div className="current-frame-info">
                      <small>Current frame: {currentVideoFrame}</small>
                    </div>
                  )}
                </div>

                <div className="replay-content-display">
                  <h4>Current Content</h4>
                  <div className="replay-status">
                    <strong>Status:</strong> <span className={isPlaying ? 'status-playing' : 'status-stopped'}>{replayStatus}</span>
                  </div>
                  <div className="content-sections">
                    {currentUserAction && (
                      <div className="content-item user-action">
                        <strong>User Action:</strong> {currentUserAction}
                      </div>
                    )}
                    {currentTextInput && (
                      <div className="content-item text-input">
                        <strong>User Text:</strong> {currentTextInput}
                      </div>
                    )}
                    {currentApiResponse && (
                      <div className="content-item api-response">
                        <strong>Gemini Response:</strong> {currentApiResponse}
                      </div>
                    )}
                    {/* Audio status indicator */}
                    {(replayStatus.includes('🔊') || isStreamingAudio) && (
                      <div className={`content-item audio-indicator ${replayStatus.includes('user') ? 'user-audio' : 'api-audio'} ${isStreamingAudio ? 'streaming' : ''}`}>
                        <strong>🎵 Audio Status:</strong> {replayStatus}
                        {isStreamingAudio && (
                          <div style={{ fontSize: '12px', marginTop: '5px', opacity: 0.8 }}>
                            Streaming...
                          </div>
                        )}
                      </div>
                    )}
                    {!currentUserAction && !currentTextInput && !currentApiResponse && !isPlaying && (
                      <div className="content-item placeholder">
                        <em>Select a session and click Play to see replay content...</em>
                      </div>
                    )}
                  </div>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InteractionReplay; 