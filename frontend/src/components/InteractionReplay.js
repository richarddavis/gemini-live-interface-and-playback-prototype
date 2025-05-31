import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { interactionLogger } from '../services/interactionLogger';
import './InteractionReplay.css';
import { useAudioStreaming } from '../hooks/useAudioStreaming';

// Constants for better maintainability
const CONSTANTS = {
  AUDIO: {
    SAMPLE_RATES: {
      USER: 16000,
      API: 24000,
      PLAYBACK: 24000
    },
    VOLUME: {
      USER: 1.2,
      API: 0.8
    },
    TIMEOUT: {
      USER: 500,
      API: 200
    }
  },
  VIDEO: {
    DIMENSIONS: {
      WIDTH: 320,
      HEIGHT: 240
    },
    MIN_FRAME_DELAY: 16, // 60fps minimum
    MAX_FRAME_DELAY: 200
  },
  TIMING: {
    MIN_DELAY: 50,
    MAX_DELAY: 1500,
    AUDIO_STREAM_DELAY: 100,
    CONSECUTIVE_AUDIO_DELAY: 50,
    API_RESPONSE_MIN_DELAY: 200,
    CONTEXT_SWITCH_DELAY: 100
  },
  MEDIA: {
    EXPIRED_STATUSES: [400, 502],
    PLACEHOLDER_TEXT: {
      VIDEO: 'Video frame unavailable\n(expired media URL)',
      AUDIO: 'Audio unavailable (expired URL)'
    }
  }
};

// Custom hook for replay state management
const useReplayState = () => {
  const [state, setState] = useState({
    // Session management
    sessions: [],
    selectedSession: null,
    replayData: null,
    loading: false,
    
    // Playback control
    isPlaying: false,
    currentIndex: 0,
    playbackSpeed: 1,
    shouldStartPlayback: false,
    
    // Content display
    currentVideoFrame: null,
    currentTextInput: '',
    currentApiResponse: '',
    currentUserAction: '',
    replayStatus: 'Ready to replay...',
    
    // Media management
    audioCache: new Map(),
    videoCache: new Map(),
    mediaCacheReady: false,
    isRegeneratingUrls: false,
    isStreamingAudio: false
  });

  const updateState = useCallback((updates) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const resetPlayback = useCallback(() => {
    updateState({
      isPlaying: false,
      currentIndex: 0,
      currentVideoFrame: null,
      currentTextInput: '',
      currentApiResponse: '',
      currentUserAction: '',
      replayStatus: 'Replay stopped',
      isStreamingAudio: false
    });
  }, [updateState]);

  return { state, updateState, resetPlayback };
};

// Custom hook for media caching
const useMediaCache = (updateState) => {
  const audioContextRef = useRef(null);

  const initializeAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: CONSTANTS.AUDIO.SAMPLE_RATES.PLAYBACK
      });
    }
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    
    return audioContextRef.current;
  }, []);

  const createAudioBuffer = useCallback(async (arrayBuffer, sampleRate) => {
    const audioContext = await initializeAudioContext();
    const dataView = new DataView(arrayBuffer);
    const numSamples = arrayBuffer.byteLength / 2;
    
    const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    
    for (let i = 0; i < numSamples; i++) {
      const sample = dataView.getInt16(i * 2, true);
      channelData[i] = sample / 32768.0;
    }
    
    return audioBuffer;
  }, [initializeAudioContext]);

  const downloadMediaFile = useCallback(async (logId, type) => {
    const proxyUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:8080/api'}/interaction-logs/media/${logId}`;
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      if (CONSTANTS.MEDIA.EXPIRED_STATUSES.includes(response.status)) {
        throw new Error(`expired_url:${response.status}`);
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    return type === 'audio' ? response.arrayBuffer() : response.blob();
  }, []);

  const preloadAudio = useCallback(async (audioLogs) => {
    const audioContext = await initializeAudioContext();
    
    const promises = audioLogs.map(async (log, index) => {
      try {
        const arrayBuffer = await downloadMediaFile(log.id, 'audio');
        const sampleRate = log.interaction_metadata?.audio_sample_rate || CONSTANTS.AUDIO.SAMPLE_RATES.API;
        const audioBuffer = await createAudioBuffer(arrayBuffer, sampleRate);
        
        console.log(`🎬 Downloaded audio ${index + 1}/${audioLogs.length}: ${log.id} (${audioBuffer.duration.toFixed(3)}s)`);
        return { logId: log.id, audioBuffer, success: true };
      } catch (error) {
        const isExpired = error.message.startsWith('expired_url');
        console.warn(`🎬 Audio ${log.id} failed:`, error.message);
        return { 
          logId: log.id, 
          success: false, 
          error: isExpired ? 'expired_url' : error.message,
          httpStatus: isExpired ? error.message.split(':')[1] : null
        };
      }
    });

    const results = await Promise.allSettled(promises);
    const audioCache = new Map();
    let successCount = 0;
    let expiredCount = 0;

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          audioCache.set(result.value.logId, result.value.audioBuffer);
          successCount++;
        } else if (result.value.error === 'expired_url') {
          expiredCount++;
        }
      }
    });

    return { audioCache, successCount, expiredCount, total: audioLogs.length };
  }, [downloadMediaFile, createAudioBuffer, initializeAudioContext]);

  const preloadVideo = useCallback(async (videoLogs) => {
    const promises = videoLogs.map(async (log, index) => {
      try {
        const blob = await downloadMediaFile(log.id, 'video');
        const imageUrl = URL.createObjectURL(blob);
        
        console.log(`🎬 Downloaded video ${index + 1}/${videoLogs.length}: ${log.id} (${blob.type}, ${blob.size} bytes)`);
        return {
          logId: log.id,
          frameData: { url: imageUrl, blob, size: blob.size, type: blob.type },
          success: true
        };
      } catch (error) {
        const isExpired = error.message.startsWith('expired_url');
        console.warn(`🎬 Video ${log.id} failed:`, error.message);
        return { 
          logId: log.id, 
          success: false, 
          error: isExpired ? 'expired_url' : error.message 
        };
      }
    });

    const results = await Promise.allSettled(promises);
    const videoCache = new Map();
    let successCount = 0;
    let expiredCount = 0;

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          videoCache.set(result.value.logId, result.value.frameData);
          successCount++;
        } else if (result.value.error === 'expired_url') {
          expiredCount++;
        }
      }
    });

    return { videoCache, successCount, expiredCount, total: videoLogs.length };
  }, [downloadMediaFile]);

  return {
    audioContextRef,
    preloadAudio,
    preloadVideo,
    initializeAudioContext,
    createAudioBuffer
  };
};

// Custom hook for audio streaming configuration
const useAudioStreamingConfig = (updateState) => {
  const createStreamingConfig = useCallback((audioSource, sampleRate) => ({
    timeout: audioSource === 'user_microphone' ? CONSTANTS.AUDIO.TIMEOUT.USER : CONSTANTS.AUDIO.TIMEOUT.API,
    audioSource,
    sampleRate,
    onStreamStart: (data) => {
      console.log(`🎵 ${audioSource} stream started:`, data);
      updateState({ isStreamingAudio: true });
      updateState({ 
        replayStatus: audioSource === 'user_microphone' ? '🎤 Playing user audio...' : '🎵 Starting Gemini audio stream...' 
      });
    },
    onStreamEnd: (data) => {
      console.log(`🎵 ${audioSource} stream ended:`, data);
      if (audioSource === 'gemini_api') {
        updateState({ replayStatus: `🔊 Playing Gemini audio stream (${data.chunks_count} chunks)` });
      }
    },
    onPlaybackStart: (data) => {
      console.log(`🎵 ${audioSource} playback started:`, data);
      const label = audioSource === 'user_microphone' ? 'user' : 'Gemini';
      updateState({ 
        replayStatus: `🔊 Playing ${label} audio (${data.estimated_duration.toFixed(2)}s${data.chunks_count ? `, ${data.chunks_count} chunks` : ''})`
      });
    },
    onPlaybackEnd: (data) => {
      console.log(`🎵 ${audioSource} playback ended:`, data);
      updateState({ isStreamingAudio: false });
      const label = audioSource === 'user_microphone' ? 'User' : 'Gemini';
      updateState({ replayStatus: `🎵 ${label} audio completed` });
    },
    onError: (error) => {
      console.error(`🚨 ${audioSource} streaming error:`, error);
      updateState({ isStreamingAudio: false, replayStatus: `❌ ${audioSource} audio error` });
    }
  }), [updateState]);

  return { createStreamingConfig };
};

// Utility functions
const formatTimestamp = (timestamp) => new Date(timestamp).toLocaleTimeString();

const calculatePlaybackDelay = (currentLog, nextLog, playbackSpeed, isStreamingAudio) => {
  if (!nextLog) return CONSTANTS.TIMING.MIN_DELAY;

  const timeDiff = new Date(nextLog.timestamp) - new Date(currentLog.timestamp);
  const { interaction_type: currentType } = currentLog;
  const { interaction_type: nextType } = nextLog;

  // Audio stream start events
  if (currentType === 'user_action' && currentLog.interaction_metadata?.action_type === 'audio_stream_start') {
    return Math.min(CONSTANTS.TIMING.AUDIO_STREAM_DELAY, Math.max(30, timeDiff / playbackSpeed));
  }

  // Consecutive audio chunks
  if (currentType === 'audio_chunk' && nextType === 'audio_chunk') {
    const currentIsUser = currentLog.interaction_metadata?.microphone_on === true;
    const nextIsUser = nextLog.interaction_metadata?.microphone_on === true;
    
    if (!currentIsUser && !nextIsUser) {
      return Math.min(CONSTANTS.TIMING.CONSECUTIVE_AUDIO_DELAY, Math.max(20, timeDiff / playbackSpeed));
    } else if (currentIsUser && nextIsUser) {
      return Math.min(150, Math.max(30, timeDiff / playbackSpeed));
    } else {
      return Math.min(500, Math.max(CONSTANTS.TIMING.CONTEXT_SWITCH_DELAY, timeDiff / playbackSpeed));
    }
  }

  // Video frames
  if (currentType === 'video_frame' && nextType === 'video_frame') {
    const frameDelay = Math.max(CONSTANTS.VIDEO.MIN_FRAME_DELAY, timeDiff / playbackSpeed);
    return Math.min(CONSTANTS.VIDEO.MAX_FRAME_DELAY, frameDelay);
  }

  // API responses
  if (currentType === 'api_response' || nextType === 'api_response') {
    return Math.min(1000, Math.max(CONSTANTS.TIMING.API_RESPONSE_MIN_DELAY, timeDiff / playbackSpeed));
  }

  // Streaming audio events
  if (isStreamingAudio && (currentType === 'audio_chunk' || currentType === 'api_response')) {
    return Math.min(CONSTANTS.TIMING.AUDIO_STREAM_DELAY, Math.max(20, timeDiff / playbackSpeed));
  }

  // Default timing
  return Math.max(CONSTANTS.TIMING.MIN_DELAY, Math.min(CONSTANTS.TIMING.MAX_DELAY, timeDiff / playbackSpeed));
};

const InteractionReplay = () => {
  const { state, updateState, resetPlayback } = useReplayState();
  const mediaCache = useMediaCache(updateState);
  const { createStreamingConfig } = useAudioStreamingConfig(updateState);
  
  // Refs
  const videoRef = useRef(null);
  const playbackTimeoutRef = useRef(null);

  // Audio streaming hooks
  const geminiAudioStreaming = useAudioStreaming(
    createStreamingConfig('gemini_api', CONSTANTS.AUDIO.SAMPLE_RATES.API)
  );
  
  const userAudioStreaming = useAudioStreaming(
    createStreamingConfig('user_microphone', CONSTANTS.AUDIO.SAMPLE_RATES.USER)
  );

  // Memoized computed values
  const hasExpiredUrls = useMemo(() => 
    state.replayStatus.includes('expired URL') || state.replayStatus.includes('Media unavailable'),
    [state.replayStatus]
  );

  const canStartReplay = useMemo(() => 
    state.replayData?.logs?.length > 0 && state.mediaCacheReady && !state.isPlaying,
    [state.replayData, state.mediaCacheReady, state.isPlaying]
  );

  // Load all available sessions on component mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Handle playback start after state updates
  useEffect(() => {
    if (state.shouldStartPlayback && state.isPlaying && state.replayData?.logs?.length > 0) {
      console.log('🎬 useEffect: Starting playback after state update');
      state.shouldStartPlayback = false;
      playNextInteraction(0);
    }
  }, [state.shouldStartPlayback, state.isPlaying, state.replayData]);

  const loadSessions = async () => {
    updateState({ loading: true });
    try {
      const sessionsData = await interactionLogger.getAllReplaySessions();
      if (sessionsData && sessionsData.sessions) {
        updateState({ sessions: sessionsData.sessions });
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
    updateState({ loading: false });
  };

  const loadReplayData = async (sessionId) => {
    updateState({ loading: true });
    try {
      const data = await interactionLogger.getReplayData(sessionId);
      updateState({ replayData: data });
      updateState({ currentIndex: 0 });
      updateState({ isPlaying: false });
      updateState({ audioCache: new Map() });
      updateState({ videoCache: new Map() });
      updateState({ mediaCacheReady: false });
      
      // Start preloading media if there are audio chunks or video frames
      if (data && data.logs) {
        preloadMediaContent(data.logs);
      }
    } catch (error) {
      console.error('Error loading replay data:', error);
    }
    updateState({ loading: false });
  };

  const preloadMediaContent = async (logs) => {
    try {
      updateState({ replayStatus: 'Analyzing media content...' });
      
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
        updateState({ mediaCacheReady: true });
        updateState({ replayStatus: 'Ready to replay...' });
        return;
      }

      console.log(`🎬 Preloading ${audioLogs.length} audio chunks and ${videoLogs.length} video frames in parallel...`);
      
      // Initialize audio context for audio processing
      let audioContext = null;
      if (audioLogs.length > 0) {
        audioContext = await mediaCache.initializeAudioContext();
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
      }

      // Show progress while downloads are happening
      updateState({ replayStatus: `🚀 Downloading ${totalMedia} media files in parallel...` });
      
      // Wait for all downloads to complete (both successes and failures)
      const audioResults = await mediaCache.preloadAudio(audioLogs);
      const videoResults = await mediaCache.preloadVideo(videoLogs);

      // Process results and build caches
      const audioCache = audioResults.audioCache;
      const videoCache = videoResults.videoCache;
      
      const audioSuccessCount = audioResults.successCount;
      const audioExpiredCount = audioResults.expiredCount;
      const videoSuccessCount = videoResults.successCount;
      const videoExpiredCount = videoResults.expiredCount;

      // Update cache states
      updateState({ audioCache });
      updateState({ videoCache });
      updateState({ mediaCacheReady: true });
      
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
          updateState({ replayStatus: `⏳ Media unavailable due to expired URLs - replay will show interaction timing only` });
        } else {
          updateState({ replayStatus: '❌ Media preloading failed - replay will show interaction timing only' });
        }
      } else {
        updateState({ replayStatus: `⚡ Media preloaded: ${statusText}${failedText} - ready for replay` });
      }
      
      console.log(`🎬 Parallel preload complete: ${audioCache.size} audio, ${videoCache.size} video. Expired: ${expiredCount}, Other failures: ${otherFailedCount}`);

    } catch (error) {
      console.error('Error preloading media:', error);
      updateState({ mediaCacheReady: true });
      updateState({ replayStatus: '⚠️ Media preloading failed - replay will show interaction timing only' });
    }
  };

  const regenerateUrls = async () => {
    if (!state.selectedSession) {
      console.error('No session selected for URL regeneration');
      return;
    }

    updateState({ isRegeneratingUrls: true });
    updateState({ replayStatus: '🔄 Regenerating expired URLs...' });

    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:8080/api'}/interaction-logs/regenerate-urls/${state.selectedSession}`,
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
          updateState({ replayStatus: `✅ Regenerated ${result.regenerated} URLs successfully! Reloading session data...` });
          
          // Reload the replay data to get fresh URLs
          await loadReplayData(state.selectedSession);
          
          updateState({ replayStatus: `✅ URLs regenerated and session reloaded - ready for replay with fresh URLs!` });
        } else {
          updateState({ replayStatus: '⚠️ No URLs needed regeneration or regeneration failed' });
        }

        if (result.failed > 0) {
          console.warn('Some URL regenerations failed:', result.errors);
        }
      } else {
        const errorData = await response.json();
        console.error('URL regeneration failed:', errorData);
        updateState({ replayStatus: `❌ Failed to regenerate URLs: ${errorData.error}` });
      }
    } catch (error) {
      console.error('Error regenerating URLs:', error);
      updateState({ replayStatus: '❌ Error occurred while regenerating URLs' });
    } finally {
      updateState({ isRegeneratingUrls: false });
    }
  };

  const handleSessionSelect = (sessionId) => {
    updateState({ selectedSession: sessionId });
    loadReplayData(sessionId);
  };

  const startReplay = () => {
    console.log('🎬 startReplay called');
    console.log('🎬 replayData:', state.replayData);
    console.log('🎬 replayData.logs:', state.replayData?.logs);
    console.log('🎬 logs length:', state.replayData?.logs?.length);
    
    if (!state.replayData || !state.replayData.logs || state.replayData.logs.length === 0) {
      console.log('🎬 startReplay: No data to replay');
      updateState({ replayStatus: 'No data available for replay' });
      return;
    }
    
    if (!state.mediaCacheReady) {
      updateState({ replayStatus: 'Please wait for media content to finish preloading...' });
      return;
    }
    
    console.log('🎬 Starting replay with', state.replayData.logs.length, 'interactions');
    console.log('🎬 Audio cache size:', state.audioCache.size);
    updateState({ replayStatus: `Starting replay of ${state.replayData.logs.length} interactions...` });
    updateState({ isPlaying: true });
    updateState({ currentIndex: 0 });
    updateState({ shouldStartPlayback: true }); // Trigger useEffect after state updates
  };

  const stopReplay = () => {
    updateState({ isPlaying: false });
    updateState({ currentIndex: 0 });
    updateState({ currentVideoFrame: null });
    updateState({ currentTextInput: '' });
    updateState({ currentApiResponse: '' });
    updateState({ currentUserAction: '' });
    updateState({ replayStatus: 'Replay stopped' });
    
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
    
    // Clean up audio streaming state - UPDATED for useAudioStreaming hooks
    updateState({ isStreamingAudio: false });
    geminiAudioStreaming.clearBuffer();
    userAudioStreaming.clearBuffer();
  };

  const playNextInteraction = (index) => {
    console.log('🎬 playNextInteraction called with index:', index);
    console.log('🎬 isPlaying:', state.isPlaying);
    console.log('🎬 replayData exists:', !!state.replayData);
    console.log('🎬 index >= replayData.logs.length:', index >= (state.replayData?.logs?.length || 0));
    
    if (!state.isPlaying || !state.replayData || index >= state.replayData.logs.length) {
      console.log('🎬 playNextInteraction: Stopping playback');
      updateState({ isPlaying: false });
      return;
    }

    const currentLog = state.replayData.logs[index];
    console.log('🎬 Processing interaction:', currentLog);
    updateState({ currentIndex: index });

    // Process the current interaction
    processInteraction(currentLog);

    // Improved timing logic with better audio handling
    let delay = calculatePlaybackDelay(currentLog, state.replayData.logs[index + 1], state.playbackSpeed, state.isStreamingAudio);

    console.log('🎬 Setting timeout for next interaction in', delay, 'ms', `(${currentLog.interaction_type} -> ${index < state.replayData.logs.length - 1 ? state.replayData.logs[index + 1].interaction_type : 'end'})`);
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
    
    if (state.audioCache.has(log.id)) {
      // Convert cached AudioBuffer back to ArrayBuffer for hook
      const cachedBuffer = state.audioCache.get(log.id);
      
      // Get the original PCM data from the AudioBuffer
      const channelData = cachedBuffer.getChannelData(0);
      const sampleRate = cachedBuffer.sampleRate;
      const numSamples = channelData.length;
      
      // Convert float32 back to 16-bit PCM
      const pcmBuffer = new ArrayBuffer(numSamples * 2); // 16-bit = 2 bytes per sample
      const dataView = new DataView(pcmBuffer);
      
      for (let i = 0; i < numSamples; i++) {
        // Convert from [-1, 1] float to 16-bit signed integer
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        const intSample = Math.round(sample * 32767);
        dataView.setInt16(i * 2, intSample, true); // true = little-endian
      }
      
      audioArrayBuffer = pcmBuffer;
      console.log(`🎬 Using cached audio for ${log.id}: ${numSamples} samples, ${pcmBuffer.byteLength} bytes`);
    } else if (log.media_data && log.media_data.cloud_storage_url) {
      try {
        const proxyUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:8080/api'}/interaction-logs/media/${log.id}`;
        const response = await fetch(proxyUrl);
        
        if (response.ok) {
          audioArrayBuffer = await response.arrayBuffer();
          console.log(`🎵 Fetched audio for ${log.id}: ${audioArrayBuffer.byteLength} bytes`);
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
      updateState({ replayStatus: '🎵 Gemini audio stream starting...' });
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
    if (state.videoCache.has(log.id)) {
      try {
        console.log('🎬 Displaying cached video frame for interaction:', log.id);
        
        const cachedFrame = state.videoCache.get(log.id);
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
        
        updateState({ currentVideoFrame: `Frame ${log.id} (cached) loaded at ${new Date().toLocaleTimeString()}` });
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
          
          updateState({ currentVideoFrame: `Frame ${log.id} loaded at ${new Date().toLocaleTimeString()}` });
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
          
          updateState({ currentVideoFrame: `Frame ${log.id} - media unavailable (expired URL)` });
        } else {
          console.error('Failed to fetch video frame via proxy:', response.status);
          updateState({ currentVideoFrame: `Error loading video frame - HTTP ${response.status}` });
        }
      } catch (error) {
        console.error('Error displaying video frame:', error);
        updateState({ currentVideoFrame: 'Error loading video frame' });
      }
    } else if (log.media_data && log.media_data.storage_type === 'hash_only') {
      updateState({ currentVideoFrame: 'Video frame captured (hash-only mode - no replay data)' });
    } else {
      updateState({ currentVideoFrame: 'No video frame data available' });
    }
  };

  const playAudioChunk = async (log) => {
    // Determine if this is user audio or API audio
    const isUserAudio = log.interaction_metadata?.microphone_on === true;
    const audioSource = isUserAudio ? 'User' : 'API';
    
    // First, check if we have this audio chunk cached
    if (state.audioCache.has(log.id)) {
      try {
        console.log(`🎬 Playing cached ${audioSource} audio chunk for interaction:`, log.id);
        
        // Initialize audio context if needed with appropriate sample rate
        const audioContext = await mediaCache.initializeAudioContext();

        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        // Get the cached audio buffer
        const audioBuffer = state.audioCache.get(log.id);
        
        // Create and play audio source with appropriate gain for user vs API audio
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = audioBuffer;
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Adjust volume based on audio source (user audio is often quieter)
        gainNode.gain.value = isUserAudio ? CONSTANTS.AUDIO.VOLUME.USER : CONSTANTS.AUDIO.VOLUME.API;
        
        source.start(0);
        
        console.log(`🎬 Playing cached ${audioSource} PCM audio chunk: ${audioBuffer.duration.toFixed(3)}s (instant playback)`);
        
        // Visual feedback for audio type
        updateState({ replayStatus: `🔊 Playing ${audioSource.toLowerCase()} audio (${audioBuffer.duration.toFixed(2)}s)` });
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
          const audioContext = await mediaCache.initializeAudioContext();
          
          // Resume audio context if suspended (required for user interaction policies)
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }
          
          // For PCM data, we need to process it differently than for encoded audio
          if (response.headers.get('content-type') === 'audio/pcm' || log.media_data.cloud_storage_url.includes('.pcm')) {
            // Handle raw PCM data with proper sample rate detection
            let sampleRate = CONSTANTS.AUDIO.SAMPLE_RATES.API; // Default
            
            // Try to get sample rate from metadata
            if (log.interaction_metadata?.audio_sample_rate) {
              sampleRate = log.interaction_metadata.audio_sample_rate;
            } else if (isUserAudio) {
              sampleRate = CONSTANTS.AUDIO.SAMPLE_RATES.USER; // User audio is typically 16kHz
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
            gainNode.gain.value = isUserAudio ? CONSTANTS.AUDIO.VOLUME.USER : CONSTANTS.AUDIO.VOLUME.API;
            
            // Start audio immediately without additional delays
            source.start(0);
            
            console.log(`🎬 Playing ${audioSource} PCM audio chunk (network):`, numSamples, 'samples at', sampleRate, 'Hz', `(${audioBuffer.duration.toFixed(3)}s)`);
            updateState({ replayStatus: `🔊 Playing ${audioSource.toLowerCase()} audio (${audioBuffer.duration.toFixed(2)}s) - network` });
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
              gainNode.gain.value = isUserAudio ? CONSTANTS.AUDIO.VOLUME.USER : CONSTANTS.AUDIO.VOLUME.API;
              
              source.start(0);
              
              console.log(`🎬 Playing ${audioSource} encoded audio chunk:`, audioBuffer.duration, 'seconds');
              updateState({ replayStatus: `🔊 Playing ${audioSource.toLowerCase()} audio (${audioBuffer.duration.toFixed(2)}s) - encoded` });
            } catch (decodeError) {
              console.error(`Failed to decode ${audioSource} audio data:`, decodeError);
            }
          }
        } else if (response.status === 502 || response.status === 400) {
          // Handle expired GCS URLs gracefully
          console.warn(`🎬 ${audioSource} audio chunk media unavailable (likely expired URL):`, response.status);
          updateState({ replayStatus: `⏸️ ${audioSource} audio unavailable (expired URL)` });
        } else {
          console.error(`Failed to fetch ${audioSource} audio chunk via proxy:`, response.status);
          updateState({ replayStatus: `❌ Failed to load ${audioSource.toLowerCase()} audio - HTTP ${response.status}` });
        }
      } catch (error) {
        console.error(`Error playing ${audioSource} audio chunk:`, error);
        updateState({ replayStatus: `❌ Error playing ${audioSource.toLowerCase()} audio` });
      }
    } else if (log.media_data && log.media_data.storage_type === 'hash_only') {
      console.log(`🎬 ${audioSource} audio chunk captured (hash-only mode - no replay data)`);
      updateState({ replayStatus: `${audioSource} audio detected (hash-only mode)` });
    } else {
      console.log(`🎬 No ${audioSource} audio chunk data available`);
      updateState({ replayStatus: `No ${audioSource.toLowerCase()} audio available` });
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
    updateState({ currentTextInput: textContent });
    updateState({ replayStatus: `Processing text input...` });
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
    updateState({ currentApiResponse: responseText });
    updateState({ replayStatus: `Processing API response...` });
  };

  const displayUserAction = (log) => {
    const actionType = log.interaction_metadata?.action_type || 'action';
    const actionDetails = log.interaction_metadata?.action_details || `User interaction (${log.id})`;
    const actionText = `${actionType}: ${actionDetails}`;
    console.log('🎬 User action:', actionType, actionDetails);
    updateState({ currentUserAction: actionText });
    updateState({ replayStatus: `Processing user action: ${actionType}` });
  };

  const jumpToInteraction = (index) => {
    updateState({ currentIndex: index });
    if (state.replayData && state.replayData.logs[index]) {
      processInteraction(state.replayData.logs[index]);
    }
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
          {state.loading && <p>Loading sessions...</p>}
          {state.sessions.length === 0 && !state.loading && (
            <p>No replay sessions found. Enable replay mode during interactions to record full data.</p>
          )}
          <div className="sessions-list">
            {state.sessions.map((session) => (
              <div
                key={session.id}
                className={`session-item ${state.selectedSession === session.session_id ? 'selected' : ''}`}
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
          {state.replayData && (
            <div className="replay-controls">
              <div className="playback-controls">
                <button onClick={startReplay} disabled={state.isPlaying || !state.mediaCacheReady}>
                  {!state.mediaCacheReady ? '⏳ Loading...' : '▶️ Play'}
                </button>
                <button onClick={stopReplay} disabled={!state.isPlaying}>
                  ⏹️ Stop
                </button>
                <label>
                  Speed:
                  <select value={state.playbackSpeed} onChange={(e) => updateState({ playbackSpeed: Number(e.target.value) })}>
                    <option value={0.5}>0.5x</option>
                    <option value={1}>1x</option>
                    <option value={2}>2x</option>
                    <option value={4}>4x</option>
                  </select>
                </label>
                {/* Show regenerate button when URLs are expired */}
                {hasExpiredUrls && (
                  <button 
                    onClick={regenerateUrls} 
                    disabled={state.isRegeneratingUrls || state.isPlaying}
                    style={{
                      marginLeft: '10px',
                      backgroundColor: state.isRegeneratingUrls ? '#666' : '#007bff',
                      color: 'white',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      cursor: state.isRegeneratingUrls ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {state.isRegeneratingUrls ? '🔄 Regenerating...' : '🔄 Fix Expired URLs'}
                  </button>
                )}
              </div>

              <div className="progress-info">
                <p>
                  Interaction {state.currentIndex + 1} of {state.replayData.logs.length}
                  {state.replayData.logs[state.currentIndex] && (
                    <span> - {state.replayData.logs[state.currentIndex].interaction_type} at {formatTimestamp(state.replayData.logs[state.currentIndex].timestamp)}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Replay Display */}
          {state.replayData && (
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
                  {state.currentVideoFrame && (
                    <div className="current-frame-info">
                      <small>Current frame: {state.currentVideoFrame}</small>
                    </div>
                  )}
                </div>

                <div className="replay-content-display">
                  <h4>Current Content</h4>
                  <div className="replay-status">
                    <strong>Status:</strong> <span className={state.isPlaying ? 'status-playing' : 'status-stopped'}>{state.replayStatus}</span>
                  </div>
                  <div className="content-sections">
                    {state.currentUserAction && (
                      <div className="content-item user-action">
                        <strong>User Action:</strong> {state.currentUserAction}
                      </div>
                    )}
                    {state.currentTextInput && (
                      <div className="content-item text-input">
                        <strong>User Text:</strong> {state.currentTextInput}
                      </div>
                    )}
                    {state.currentApiResponse && (
                      <div className="content-item api-response">
                        <strong>Gemini Response:</strong> {state.currentApiResponse}
                      </div>
                    )}
                    {/* Audio status indicator */}
                    {(state.replayStatus.includes('🔊') || state.isStreamingAudio) && (
                      <div className={`content-item audio-indicator ${state.replayStatus.includes('user') ? 'user-audio' : 'api-audio'} ${state.isStreamingAudio ? 'streaming' : ''}`}>
                        <strong>🎵 Audio Status:</strong> {state.replayStatus}
                        {state.isStreamingAudio && (
                          <div style={{ fontSize: '12px', marginTop: '5px', opacity: 0.8 }}>
                            Streaming...
                          </div>
                        )}
                      </div>
                    )}
                    {!state.currentUserAction && !state.currentTextInput && !state.currentApiResponse && !state.isPlaying && (
                      <div className="content-item placeholder">
                        <em>Select a session and click Play to see replay content...</em>
                      </div>
                    )}
                  </div>
                </div>

                <div className="interaction-timeline">
                  <h4>Interaction Timeline</h4>
                  <div className="timeline-container">
                    {state.replayData.logs.map((log, index) => (
                      <div
                        key={index}
                        className={`timeline-item ${index === state.currentIndex ? 'current' : ''}`}
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