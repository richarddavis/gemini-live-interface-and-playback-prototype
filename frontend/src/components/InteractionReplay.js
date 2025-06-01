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

  const processMediaPreloadResults = useCallback((results, cacheMap, type) => {
    let successCount = 0;
    let expiredCount = 0;
    
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          if (type === 'audio') {
            cacheMap.set(result.value.logId, result.value.audioBuffer);
          } else if (type === 'video') {
            cacheMap.set(result.value.logId, result.value.frameData);
          }
          successCount++;
        } else if (result.value.error === 'expired_url') {
          expiredCount++;
        }
      }
    });
    
    return { successCount, expiredCount };
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
    const { successCount, expiredCount } = processMediaPreloadResults(results, audioCache, 'audio');

    return { audioCache, successCount, expiredCount, total: audioLogs.length };
  }, [downloadMediaFile, createAudioBuffer, initializeAudioContext, processMediaPreloadResults]);

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
    const { successCount, expiredCount } = processMediaPreloadResults(results, videoCache, 'video');

    return { videoCache, successCount, expiredCount, total: videoLogs.length };
  }, [downloadMediaFile, processMediaPreloadResults]);

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

// Custom hook for conversation segment processing
const useConversationSegments = (updateState) => {
  const processIntoSegments = useCallback((logs) => {
    console.log('🚨🚨🚨 UPDATED INTERACTIONREPLAY CODE IS RUNNING! 🚨🚨🚨');
    console.log('🎭 Processing', logs.length, 'logs into conversation segments...');
    
    // Debug: Check audio chunk distribution
    const audioChunks = logs.filter(log => log.interaction_type === 'audio_chunk');
    const userAudioCount = audioChunks.filter(log => log.interaction_metadata?.microphone_on === true).length;
    const userAudioChunkCount = audioChunks.filter(log => log.interaction_metadata?.microphone_on === false).length;
    const videoFrames = logs.filter(log => log.interaction_type === 'video_frame');
    
    // Check API responses for audio content
    const apiResponses = logs.filter(log => log.interaction_type === 'api_response');
    const apiAudioResponseCount = apiResponses.filter(log => {
      // Check if the api_response contains audio data
      return log.media_data?.cloud_storage_url && 
             (log.media_data.cloud_storage_url.includes('.pcm') || 
              (log.interaction_metadata && log.interaction_metadata.response_type === 'audio'));
    }).length;
    
    console.log(`🎭 Content analysis: ${userAudioCount} user audio_chunks, ${userAudioChunkCount} other audio_chunks, ${apiAudioResponseCount} API audio responses, ${videoFrames.length} video frames`);
    
    // Show video frame distribution by timestamp
    if (videoFrames.length > 0) {
      console.log(`🎭 Video frame timestamps:`, videoFrames.map(f => ({ 
        id: f.id, 
        timestamp: f.timestamp, 
        microphone_on: f.interaction_metadata?.microphone_on 
      })));
    }
    
    const segments = [];
    let currentSegment = null;
    let segmentId = 0;
    
    // Constants for filtering noise - REDUCED THRESHOLD
    const MIN_USER_SPEECH_DURATION = 800; // Reduced from 1500ms to 800ms to be less aggressive

    // Group logs by conversation segments
    logs.forEach((log, index) => {
      const { 
        id, 
        interaction_type, 
        timestamp, 
        interaction_metadata 
      } = log;

      // Type detection
      const isTextInput = interaction_type === 'text_input';
      const isUserAudio = interaction_type === 'audio_chunk' && interaction_metadata?.microphone_on === true;
      const isApiAudioResponse = interaction_type === 'api_response' && log.media_data;
      const isTextApiResponse = interaction_type === 'api_response' && !log.media_data;
      const isVideoFrame = interaction_type === 'video_frame';
      const isUserAction = interaction_type === 'user_action';

      // Debug segment detection
      if (interaction_type === 'audio_chunk') {
        console.log(`🎭 Audio chunk ${id}: microphone_on=${interaction_metadata?.microphone_on}, isUserAudio=${isUserAudio}`);
      } else if (isApiAudioResponse) {
        console.log(`🎭 API audio response ${id}: detected as audio response`);
      } else if (isVideoFrame) {
        console.log(`🎭 Video frame ${id}: timestamp=${timestamp}, microphone_on=${interaction_metadata?.microphone_on}`);
      }

      // Look ahead to see if this is a trailing single audio chunk (likely noise)
      const nextLog = index < logs.length - 1 ? logs[index + 1] : null;
      const isTrailingSingleAudioChunk = (
        isUserAudio && 
        currentSegment && 
        currentSegment.type === 'api_response' &&
        (!nextLog || nextLog.interaction_type !== 'audio_chunk' || nextLog.interaction_metadata?.microphone_on !== true)
      );

      // Define segment boundaries (improved to prevent trailing noise segments)
      const isSegmentStart = (
        isTextInput || 
        (isUserAction && interaction_metadata?.action_type === 'audio_stream_start') ||
        (isUserAudio && !isTrailingSingleAudioChunk && (!currentSegment || currentSegment.type !== 'user_speech')) ||
        (isApiAudioResponse && (!currentSegment || currentSegment.type !== 'api_response'))
      );

      // Handle trailing audio chunks by adding them to current API response segment
      if (isTrailingSingleAudioChunk) {
        console.log(`🎭 ⚠️  Detected trailing single audio chunk ${id} after API response - adding to current segment instead of creating new segment`);
        currentSegment.logs.push(log);
        currentSegment.audioChunks.push(log);
        currentSegment.endTime = timestamp;
        currentSegment.metadata.chunkCount++;
        if (log.media_data?.data_size_bytes) {
          currentSegment.metadata.totalBytes += log.media_data.data_size_bytes;
        }
        console.log(`🎭 Added trailing audio to segment ${currentSegment.id}: ${currentSegment.audioChunks.length} chunks`);
        return; // Skip the rest of the processing for this log
      }

      // Create new segment if needed
      if (isSegmentStart || !currentSegment) {
        // Finalize previous segment
        if (currentSegment) {
          currentSegment.endTime = currentSegment.logs[currentSegment.logs.length - 1].timestamp;
          currentSegment.duration = new Date(currentSegment.endTime) - new Date(currentSegment.startTime);
          console.log(`🎭 Finalized segment ${currentSegment.id} (${currentSegment.type}): ${currentSegment.audioChunks.length} audio, ${currentSegment.videoFrames.length} video, ${currentSegment.duration}ms`);
        }

        // Determine segment type
        let segmentType = 'unknown';
        if (isTextInput) segmentType = 'user_text';
        else if (isUserAudio) segmentType = 'user_speech';
        else if (isApiAudioResponse || isTextApiResponse) segmentType = 'api_response';
        else if (isUserAction) segmentType = 'user_action';

        currentSegment = {
          id: ++segmentId,
          type: segmentType,
          startTime: timestamp,
          endTime: timestamp,
          duration: 0,
          logs: [],
          audioChunks: [], // Will include both audio_chunk and api_response audio
          videoFrames: [],
          metadata: {
            chunkCount: 0,
            totalBytes: 0,
            sampleRate: interaction_metadata?.audio_sample_rate || (isUserAudio ? 16000 : 24000)
          }
        };
        segments.push(currentSegment);
        console.log(`🎭 Created new segment ${segmentId} (${segmentType}) starting at ${timestamp}`);
      }

      // Add log to current segment
      currentSegment.logs.push(log);
      currentSegment.endTime = timestamp;

      // Categorize by type with detailed logging
      if (interaction_type === 'audio_chunk' || isApiAudioResponse) {
        currentSegment.audioChunks.push(log);
        currentSegment.metadata.chunkCount++;
        if (log.media_data?.data_size_bytes) {
          currentSegment.metadata.totalBytes += log.media_data.data_size_bytes;
        }
        console.log(`🎭 Added audio to segment ${currentSegment.id}: ${currentSegment.audioChunks.length} chunks`);
      } else if (isVideoFrame) {
        currentSegment.videoFrames.push(log);
        console.log(`🎭 Added video frame to segment ${currentSegment.id} (${currentSegment.type}): ${currentSegment.videoFrames.length} frames, frame timestamp=${timestamp}`);
      }
    });

    // Finalize last segment
    if (currentSegment) {
      currentSegment.duration = new Date(currentSegment.endTime) - new Date(currentSegment.startTime);
      console.log(`🎭 Finalized final segment ${currentSegment.id} (${currentSegment.type}): ${currentSegment.audioChunks.length} audio, ${currentSegment.videoFrames.length} video, ${currentSegment.duration}ms`);
    }

    // ============================================
    // 🚨 FILTERING COMPLETELY REMOVED FOR DEBUGGING 🚨
    // ============================================
    console.log(`🚨🚨🚨 FILTERING DISABLED - ALL SEGMENTS WILL BE USED (Updated Code Running!) 🚨🚨🚨`);
    console.log(`🎭 Using all ${segments.length} segments without any filtering`);
    
    const filteredSegments = segments; // Use ALL segments without any filtering

    // MERGE CONSECUTIVE API RESPONSE SEGMENTS for smooth playback
    console.log(`🎭 🔗 MERGING consecutive API response segments for smooth playback...`);
    const mergedSegments = [];
    let currentMergedSegment = null;
    
    filteredSegments.forEach((segment, index) => {
      if (segment.type === 'api_response') {
        if (currentMergedSegment && currentMergedSegment.type === 'api_response') {
          // Merge this API response with the previous one
          console.log(`🎭 🔗 Merging API response segment ${segment.id} into merged segment ${currentMergedSegment.id}`);
          
          // Extend the merged segment
          currentMergedSegment.logs.push(...segment.logs);
          currentMergedSegment.audioChunks.push(...segment.audioChunks);
          currentMergedSegment.videoFrames.push(...segment.videoFrames);
          currentMergedSegment.endTime = segment.endTime;
          // FIX: Calculate duration as sum of actual audio content, not wall-clock time span
          currentMergedSegment.duration += segment.duration; // Add this segment's actual duration
          currentMergedSegment.metadata.chunkCount += segment.metadata.chunkCount;
          currentMergedSegment.metadata.totalBytes += segment.metadata.totalBytes;
          
          // Add the original segment IDs to track what was merged
          if (!currentMergedSegment.mergedSegmentIds) {
            currentMergedSegment.mergedSegmentIds = [currentMergedSegment.originalId];
          }
          currentMergedSegment.mergedSegmentIds.push(segment.id);
          
        } else {
          // Start a new merged API response segment
          currentMergedSegment = {
            ...segment,
            originalId: segment.id,
            id: `merged_api_${segment.id}`,
            mergedSegmentIds: []
          };
          mergedSegments.push(currentMergedSegment);
          console.log(`🎭 🔗 Started new merged API response segment: ${currentMergedSegment.id}`);
        }
      } else {
        // Non-API response segment - add as-is and reset merge tracking
        mergedSegments.push(segment);
        currentMergedSegment = null;
        console.log(`🎭 🔗 Added non-API segment: ${segment.type} ${segment.id}`);
      }
    });
    
    console.log(`🎭 🔗 Merging complete: ${filteredSegments.length} segments → ${mergedSegments.length} segments`);
    console.log(`🎭 🔗 Merged segments:`, mergedSegments.map(s => {
      if (s.mergedSegmentIds && s.mergedSegmentIds.length > 0) {
        return `${s.type}(${s.audioChunks.length}a,${s.videoFrames.length}v,${s.duration}ms) [merged: ${s.mergedSegmentIds.join(',')}]`;
      } else {
        return `${s.type}(${s.audioChunks.length}a,${s.videoFrames.length}v,${s.duration}ms)`;
      }
    }));

    console.log('🎭 Created', mergedSegments.length, 'conversation segments (after filtering and merging):', 
      mergedSegments.map(s => `${s.type}(${s.audioChunks.length}a,${s.videoFrames.length}v,${s.duration}ms)`));
      
    // DETAILED DEBUG: Show exact segment breakdown for troubleshooting
    console.log('🎭 🔍 DETAILED SEGMENT BREAKDOWN:');
    mergedSegments.forEach((segment, index) => {
      const durationSec = (segment.duration / 1000).toFixed(2);
      const startTime = new Date(segment.startTime).toLocaleTimeString();
      const endTime = new Date(segment.endTime).toLocaleTimeString();
      
      console.log(`🎭 📋 Segment ${index + 1}/${mergedSegments.length}: ${segment.type.toUpperCase()}`);
      console.log(`     ⏱️  Duration: ${durationSec}s (${segment.duration}ms)`);
      console.log(`     🕐 Time: ${startTime} → ${endTime}`);
      console.log(`     🎵 Audio chunks: ${segment.audioChunks.length}`);
      console.log(`     📹 Video frames: ${segment.videoFrames.length}`);
      console.log(`     🆔 ID: ${segment.id} ${segment.mergedSegmentIds ? `[merged: ${segment.mergedSegmentIds.join(',')}]` : ''}`);
      
      if (segment.type === 'user_speech' && segment.audioChunks.length > 0) {
        const firstChunk = segment.audioChunks[0];
        const lastChunk = segment.audioChunks[segment.audioChunks.length - 1];
        console.log(`     🎤 User speech: ${firstChunk.id} → ${lastChunk.id} (${segment.audioChunks.length} chunks)`);
      }
      
      if (segment.type === 'api_response' && segment.audioChunks.length > 0) {
        const firstChunk = segment.audioChunks[0];
        const lastChunk = segment.audioChunks[segment.audioChunks.length - 1];
        console.log(`     🤖 API response: ${firstChunk.id} → ${lastChunk.id} (${segment.audioChunks.length} chunks)`);
      }
    });
      
    // Additional debug: show which segments have video
    const segmentsWithVideo = mergedSegments.filter(s => s.videoFrames.length > 0);
    console.log(`🎭 Merged segments with video (${segmentsWithVideo.length}/${mergedSegments.length}):`, segmentsWithVideo.map(s => `Segment ${s.id} (${s.type}): ${s.videoFrames.length} frames`));

    return mergedSegments;
  }, []);

  const concatenateAudioBuffers = useCallback(async (audioBuffers, sampleRate, segmentType = 'unknown') => {
    if (audioBuffers.length === 0) return null;

    const totalSamples = audioBuffers.reduce((sum, buffer) => sum + buffer.length, 0);
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
    const unifiedBuffer = audioContext.createBuffer(1, totalSamples, sampleRate);
    const channelData = unifiedBuffer.getChannelData(0);

    let offset = 0;
    audioBuffers.forEach((buffer, index) => {
      const sourceData = buffer.getChannelData(0);
      console.log(`🎵 Concatenating chunk ${index + 1}/${audioBuffers.length} for ${segmentType} segment: ${sourceData.length} samples at offset ${offset}`);
      
      // Safety check for buffer overflow
      if (offset + sourceData.length > totalSamples) {
        console.error(`🎵 ❌ Buffer overflow detected for ${segmentType} segment! offset: ${offset}, chunk size: ${sourceData.length}, total: ${totalSamples}`);
        const availableSpace = totalSamples - offset;
        const truncatedData = sourceData.slice(0, availableSpace);
        channelData.set(truncatedData, offset);
        console.warn(`🎵 ⚠️  Truncated chunk to fit for ${segmentType} segment: ${truncatedData.length} samples`);
        return;
      }
      
      channelData.set(sourceData, offset);
      offset += sourceData.length;
    });

    console.log(`🎵 Created unified audio for ${segmentType} segment: ${unifiedBuffer.duration.toFixed(2)}s, ${totalSamples} samples (${audioBuffers.length} chunks merged)`);
    
    return { audioBuffer: unifiedBuffer, audioContext, duration: unifiedBuffer.duration, chunkCount: audioBuffers.length };
  }, []);

  const createSegmentAudio = useCallback(async (segment, audioCache) => {
    if (segment.audioChunks.length === 0) return null;

    try {
      console.log(`🎵 Creating unified audio for ${segment.type} segment with ${segment.audioChunks.length} chunks`);
      console.log(`🎵 Segment duration: ${(segment.duration / 1000).toFixed(2)}s, ID: ${segment.id}`);
      
      // Get all cached audio buffers for this segment
      const audioBuffers = segment.audioChunks
        .map(chunk => audioCache.get(chunk.id))
        .filter(buffer => buffer !== undefined);

      if (audioBuffers.length === 0) {
        console.warn('🎵 No cached audio buffers available for segment');
        return null;
      }

      console.log(`🎵 Found ${audioBuffers.length}/${segment.audioChunks.length} cached audio buffers`);

      // Calculate total duration and samples (for safety checks)
      const totalDuration = audioBuffers.reduce((sum, buffer) => sum + buffer.duration, 0);
      const sampleRate = segment.metadata.sampleRate;
      
      console.log(`🎵 Total duration: ${totalDuration.toFixed(3)}s, Sample rate: ${sampleRate}Hz`);
      
      // SAFETY CHECK: Prevent massive audio buffers that can cause corruption
      const MAX_BUFFER_DURATION = 30; // 30 seconds max
      const MAX_CHUNK_COUNT = 150; // Increased from 50 to handle longer Gemini responses
      
      let buffersToConcatenate = audioBuffers;
      let truncated = false;

      if (totalDuration > MAX_BUFFER_DURATION) {
        console.warn(`🎵 ⚠️  Segment audio too long (${totalDuration.toFixed(2)}s > ${MAX_BUFFER_DURATION}s) - truncating`);
        let accumulatedDuration = 0;
        buffersToConcatenate = [];
        for (const buffer of audioBuffers) {
          if (accumulatedDuration + buffer.duration <= MAX_BUFFER_DURATION) {
            buffersToConcatenate.push(buffer);
            accumulatedDuration += buffer.duration;
          } else {
            console.warn(`🎵 ⚠️  Truncating merged segment at ${accumulatedDuration.toFixed(2)}s`);
            break;
          }
        }
        truncated = true;
      } else if (audioBuffers.length > MAX_CHUNK_COUNT) {
        console.warn(`🎵 ⚠️  Too many chunks (${audioBuffers.length} > ${MAX_CHUNK_COUNT}) - truncating`);
        buffersToConcatenate = audioBuffers.slice(0, MAX_CHUNK_COUNT);
        truncated = true;
      }

      const result = await concatenateAudioBuffers(buffersToConcatenate, sampleRate, segment.type);
      if (result) {
        return { ...result, type: segment.type, truncated };
      } else {
        return null;
      }

    } catch (error) {
      console.error('🚨 Failed to create segment audio:', error);
      console.error('🚨 Segment details:', { 
        id: segment.id, 
        type: segment.type, 
        duration: segment.duration, 
        chunkCount: segment.audioChunks.length 
      });
      return null;
    }
  }, [concatenateAudioBuffers]);

  // Helper function for creating truncated segment audio
  const createTruncatedSegmentAudio = async (audioBuffers, sampleRate, segmentType) => {
    const result = await concatenateAudioBuffers(audioBuffers, sampleRate, segmentType);
    if (result) {
      return { ...result, type: segmentType, truncated: true };
    } else {
      return null;
    }
  };

  const createSegmentVideo = useCallback((segment, videoCache) => {
    if (segment.videoFrames.length === 0) return null;

    // Create video timeline for smooth frame display
    const frames = segment.videoFrames
      .map(frame => ({
        timestamp: frame.timestamp,
        frameData: videoCache.get(frame.id),
        relativeTime: new Date(frame.timestamp) - new Date(segment.startTime)
      }))
      .filter(frame => frame.frameData !== undefined);

    if (frames.length === 0) return null;

    console.log(`📹 Created video timeline with ${frames.length} frames over ${segment.duration}ms`);
    
    return {
      frames,
      duration: segment.duration,
      frameCount: frames.length,
      averageInterval: segment.duration / frames.length
    };
  }, []);

  return {
    processIntoSegments,
    createSegmentAudio,
    createSegmentVideo
  };
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
  const { processIntoSegments, createSegmentAudio, createSegmentVideo } = useConversationSegments(updateState);
  
  // Refs
  const videoRef = useRef(null);
  const playbackTimeoutRef = useRef(null);
  const videoPlaybackRef = useRef(null);

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

  const createMediaPreloadStatus = useCallback((audioResults, videoResults) => {
    const audioSuccessCount = audioResults.successCount;
    const audioLogsLength = audioResults.total;
    const audioExpiredCount = audioResults.expiredCount;

    const videoSuccessCount = videoResults.successCount;
    const videoLogsLength = videoResults.total;
    const videoExpiredCount = videoResults.expiredCount;

    const statusParts = [];
    if (audioSuccessCount > 0) statusParts.push(`${audioSuccessCount}/${audioLogsLength} audio chunks`);
    if (videoSuccessCount > 0) statusParts.push(`${videoSuccessCount}/${videoLogsLength} video frames`);
    
    const statusText = statusParts.join(' and ');
    const expiredCount = audioExpiredCount + videoExpiredCount;
    const otherFailedCount = (audioLogsLength - audioSuccessCount - audioExpiredCount) +
                            (videoLogsLength - videoSuccessCount - videoExpiredCount);
    
    let failedText = '';
    if (expiredCount > 0) {
      failedText += ` (${expiredCount} expired URLs)`;
    }
    if (otherFailedCount > 0) {
      failedText += ` (${otherFailedCount} other failures)`;
    }
    
    if (audioSuccessCount === 0 && videoSuccessCount === 0) {
      if (expiredCount > 0) {
        return `⏳ Media unavailable due to expired URLs - replay will show interaction timing only`;
      } else {
        return '❌ Media preloading failed - replay will show interaction timing only';
      }
    } else {
      return `⚡ Media preloaded: ${statusText}${failedText} - ready for replay`;
    }
  }, []);

  const preloadMediaContent = async (logs) => {
    try {
      updateState({ replayStatus: 'Analyzing media content...' });
      
      // Filter different types of media content
      const audioLogs = logs.filter(log => 
        ((log.interaction_type === 'audio_chunk' || log.interaction_type === 'api_response') &&
        log.media_data && 
        log.media_data.cloud_storage_url) &&
        // For api_response, check if it contains audio
        (log.interaction_type === 'audio_chunk' || 
         log.media_data.cloud_storage_url.includes('.pcm') ||
         log.interaction_metadata?.response_type === 'audio' ||
         log.interaction_metadata?.mime_type?.includes('audio'))
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
      
      // Update cache states
      updateState({ audioCache });
      updateState({ videoCache });
      updateState({ mediaCacheReady: true });
      
      updateState({ replayStatus: createMediaPreloadStatus(audioResults, videoResults) });
      
      console.log(`🎬 Parallel preload complete: ${audioCache.size} audio, ${videoCache.size} video.`);

      // NEW: Process logs into conversation segments for smoother replay
      if (audioCache.size > 0 || videoCache.size > 0) {
        console.log('🎭 Processing conversation segments...');
        try {
          const segments = processIntoSegments(logs);
          updateState({ conversationSegments: segments });
          
          // Pre-process segments for even smoother playback
          const processedSegments = new Map();
          console.log('🎭 Pre-processing segments for smooth playback...');
          
          for (const segment of segments) {
            console.log(`🎭 Processing segment ${segment.id} (${segment.type}): ${segment.audioChunks.length} audio, ${segment.videoFrames.length} video frames`);
          
            if (segment.audioChunks.length > 0) {
              const segmentAudio = await createSegmentAudio(segment, audioCache);
              if (segmentAudio) {
                processedSegments.set(`${segment.id}_audio`, segmentAudio);
                console.log(`🎭 Created audio segment: ${segment.id}_audio (${segmentAudio.duration.toFixed(2)}s)`);
              } else {
                console.warn(`🎭 Failed to create audio segment for ${segment.id}`);
        }
      }

            if (segment.videoFrames.length > 0) {
              console.log(`🎭 Creating video segment for ${segment.id} with ${segment.videoFrames.length} frames`);
              const segmentVideo = createSegmentVideo(segment, videoCache);
              if (segmentVideo) {
                processedSegments.set(`${segment.id}_video`, segmentVideo);
                console.log(`🎭 Created video segment: ${segment.id}_video (${segmentVideo.frames.length} frames, ${segmentVideo.averageInterval}ms interval)`);
              } else {
                console.warn(`🎭 Failed to create video segment for ${segment.id} - no cached frames available`);
              }
            }
          }
          
          console.log(`🎭 Segment preprocessing complete: ${processedSegments.size} processed segments`);
          console.log(`🎭 Processed segment keys:`, Array.from(processedSegments.keys()));
          
          updateState({ processedSegments });
          updateState({ replayStatus: `${createMediaPreloadStatus(audioResults, videoResults)} + ${segments.length} conversation segments - ready for smooth replay` });
        } catch (segmentError) {
          console.error('🚨 Segment processing failed:', segmentError);
          updateState({ replayStatus: `${createMediaPreloadStatus(audioResults, videoResults)} - ready for replay (fallback mode)` });
        }
      }

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
    console.log('🎬 Video cache size:', state.videoCache.size);
    
    // 🚨 FIX: Use segment-based playback to prevent simultaneous audio 🚨
    if (state.conversationSegments && state.conversationSegments.length > 0 && state.processedSegments && state.processedSegments.size > 0) {
      console.log('🎬 🎭 STARTING SEGMENT-BASED PLAYBACK - Unified audio segments');
      updateState({ 
        replayStatus: `Starting segment replay of ${state.conversationSegments.length} conversation segments...`,
        isPlaying: true,
        currentIndex: 0,
        currentSegmentIndex: 0
      });
      playNextSegment(0, true, state.conversationSegments);
    } else {
      // Fallback to individual interaction playback if segments unavailable
      console.log('🎬 📝 STARTING INDIVIDUAL INTERACTION PLAYBACK - Fallback mode');
      updateState({ 
        replayStatus: `Starting individual interaction replay of ${state.replayData.logs.length} interactions...`,
        isPlaying: true,
        currentIndex: 0
      });
      
      // Sort logs by timestamp to ensure correct order
      const sortedLogs = [...state.replayData.logs].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
      playNextInteraction(0);
    }
  };

  const stopReplay = () => {
    updateState({ isPlaying: false });
    updateState({ currentIndex: 0 });
    updateState({ currentVideoFrame: null });
    updateState({ currentTextInput: '' });
    updateState({ currentApiResponse: '' });
    updateState({ currentUserAction: '' });
    updateState({ replayStatus: 'Replay stopped' });
    
    // Stop raw playback if active
    if (state.rawPlaybackControl?.stop) {
      state.rawPlaybackControl.stop();
    }
    
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
    
    // Stop video playback
    if (videoPlaybackRef.current) {
      videoPlaybackRef.current.stop = true;
      videoPlaybackRef.current = null;
    }
    
    // Reset video display
    if (videoRef.current) {
      videoRef.current.style.display = 'block';
      // Remove any frame images
      const imgElement = videoRef.current.parentElement?.querySelector('img.replay-frame');
      if (imgElement) {
        imgElement.remove();
      }
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

  const getAudioData = useCallback(async (log) => {
    if (state.audioCache.has(log.id)) {
      // Convert cached AudioBuffer back to ArrayBuffer for hook
      const cachedBuffer = state.audioCache.get(log.id);
      const channelData = cachedBuffer.getChannelData(0);
      const numSamples = channelData.length;
      const pcmBuffer = new ArrayBuffer(numSamples * 2);
      const dataView = new DataView(pcmBuffer);
      
      for (let i = 0; i < numSamples; i++) {
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        const intSample = Math.round(sample * 32767);
        dataView.setInt16(i * 2, intSample, true);
      }
      console.log(`🎬 Using cached audio for ${log.id}: ${numSamples} samples, ${pcmBuffer.byteLength} bytes`);
      return pcmBuffer;
    } else if (log.media_data && log.media_data.cloud_storage_url) {
      try {
        const proxyUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:8080/api'}/interaction-logs/media/${log.id}`;
        const response = await fetch(proxyUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          console.log(`🎵 Fetched audio for ${log.id}: ${arrayBuffer.byteLength} bytes`);
          return arrayBuffer;
        } else if (CONSTANTS.MEDIA.EXPIRED_STATUSES.includes(response.status)) {
          throw new Error(`expired_url:${response.status}`);
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        console.error('Error loading audio chunk from network:', error);
        throw error;
      }
    }
    return null;
  }, [state.audioCache]);

  // Handle audio chunks with streaming logic - UPDATED to use useAudioStreaming hooks
  const handleAudioChunkForStreaming = async (log) => {
    const isUserAudio = log.interaction_metadata?.microphone_on === true;
    
    // Fetch the audio data if not cached
    let audioArrayBuffer = null;
    
    try {
      audioArrayBuffer = await getAudioData(log);
    } catch (error) {
      console.warn(`🎵 Audio chunk ${log.id} failed to load:`, error.message);
      return; // Skip if audio data cannot be loaded
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

  const displayFrameAsImage = useCallback((imageUrl, logId, isSegmentFrame = false, frameIndex = 0, totalFrames = 0) => {
    if (videoRef.current) {
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
        console.log(`🎬 Created new image element for ${isSegmentFrame ? 'segment ' : ''}frame`);
      } else {
        console.log(`📹 Using existing image element`);
      }
      
      // Clean up previous image URL
      if (imgElement.src && imgElement.src.startsWith('blob:')) {
        URL.revokeObjectURL(imgElement.src);
      }
      
      // Set new image
      imgElement.src = imageUrl;
      imgElement.onload = () => {
        console.log(`🎬 ${isSegmentFrame ? `Segment frame ${frameIndex + 1}/${totalFrames}` : 'Cached video frame'} displayed successfully: ${imgElement.naturalWidth}x${imgElement.naturalHeight}`);
      };
      imgElement.onerror = (error) => {
        console.error(`🎬 ${isSegmentFrame ? `Segment frame ${frameIndex + 1}/${totalFrames}` : 'Image'} failed to load:`, error);
      };
      
      console.log(`🎬 ${isSegmentFrame ? 'Segment v' : 'V'}ideo frame displayed as image`);
    } else {
      console.error(`🎬 Video ref not found for ${isSegmentFrame ? 'segment ' : ''}frame!`);
    }
    updateState({ currentVideoFrame: `${isSegmentFrame ? `Segment Frame ${frameIndex + 1}/${totalFrames}` : `Frame ${logId}`} loaded at ${new Date().toLocaleTimeString()}` });
  }, [updateState]);

  const displayPlaceholderImage = useCallback((type, logId, status = null) => {
    if (videoRef.current) {
      videoRef.current.style.display = 'none';
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
        videoRef.current.parentElement.insertBefore(imgElement, videoRef.current.nextSibling);
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = CONSTANTS.VIDEO.DIMENSIONS.WIDTH;
      canvas.height = CONSTANTS.VIDEO.DIMENSIONS.HEIGHT;
      const ctx = canvas.getContext('2d');
      
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = '#fff';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      
      const textLine1 = CONSTANTS.MEDIA.PLACEHOLDER_TEXT[type].split('\n')[0];
      const textLine2 = CONSTANTS.MEDIA.PLACEHOLDER_TEXT[type].split('\n')[1];

      ctx.fillText(textLine1, canvas.width / 2, canvas.height / 2 - 10);
      ctx.fillText(textLine2, canvas.width / 2, canvas.height / 2 + 10);
      
      imgElement.src = canvas.toDataURL();
    }
    updateState({ currentVideoFrame: `Frame ${logId} - media unavailable (expired URL)` });
  }, [updateState]);

  const updateReplayStatusForMediaError = useCallback((type, logId, errorMessage) => {
    const statusText = CONSTANTS.MEDIA.PLACEHOLDER_TEXT[type];
    updateState({ replayStatus: `${statusText} - ${errorMessage}` });
  }, [updateState]);

  const displayVideoFrame = async (log) => {
    // First, check if we have this video frame cached
    if (state.videoCache.has(log.id)) {
      try {
        console.log('🎬 Displaying cached video frame for interaction:', log.id);
        const cachedFrame = state.videoCache.get(log.id);
        displayFrameAsImage(cachedFrame.url, log.id);
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
          displayFrameAsImage(imageUrl, log.id);
        } else if (response.status === 502 || response.status === 400) {
          // Handle expired GCS URLs gracefully
          console.warn('🎬 Video frame media unavailable (likely expired URL):', response.status);
          displayPlaceholderImage('VIDEO', log.id, response.status);
          updateReplayStatusForMediaError('VIDEO', log.id, `expired URL (HTTP ${response.status})`);
        } else {
          console.error('Failed to fetch video frame via proxy:', response.status);
          updateState({ currentVideoFrame: `Error loading video frame - HTTP ${response.status}` });
          updateReplayStatusForMediaError('VIDEO', log.id, `HTTP ${response.status}`);
        }
      } catch (error) {
        console.error('Error displaying video frame:', error);
        updateState({ currentVideoFrame: 'Error loading video frame' });
        updateReplayStatusForMediaError('VIDEO', log.id, error.message);
      }
    } else if (log.media_data && log.media_data.storage_type === 'hash_only') {
      updateState({ currentVideoFrame: 'Video frame captured (hash-only mode - no replay data)' });
      updateReplayStatusForMediaError('VIDEO', log.id, 'hash-only mode');
    } else {
      updateState({ currentVideoFrame: 'No video frame data available' });
      updateReplayStatusForMediaError('VIDEO', log.id, 'no data');
    }
  };

  const playAudioChunk = async (log) => {
    // Determine if this is user audio or API audio
    const isUserAudio = log.interaction_metadata?.microphone_on === true;
    const audioSource = isUserAudio ? 'User' : 'API';
    
    // First, check if we have this audio chunk cached
    let audioArrayBuffer = null;
    try {
      audioArrayBuffer = await getAudioData(log);
    } catch (error) {
      console.warn(`🎬 ${audioSource} audio chunk media unavailable (likely expired URL or other error):`, error.message);
      updateReplayStatusForMediaError('AUDIO', log.id, `unavailable (${error.message.startsWith('expired_url') ? 'expired URL' : 'error'})`);
      return;
    }
    
    if (!audioArrayBuffer) {
      console.log(`🎬 No ${audioSource} audio chunk data available`);
      updateReplayStatusForMediaError('AUDIO', log.id, 'no data');
      return;
    }

    try {
      // Initialize audio context if needed with appropriate sample rate
      const audioContext = await mediaCache.initializeAudioContext();

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      // For PCM data, we need to process it differently than for encoded audio
      // Assume PCM if it's from a cached buffer or if the URL implies .pcm
      const isPCM = log.media_data?.cloud_storage_url?.includes('.pcm') || state.audioCache.has(log.id);

      if (isPCM) {
        // Handle raw PCM data with proper sample rate detection
        let sampleRate = CONSTANTS.AUDIO.SAMPLE_RATES.API; // Default
        
        // Try to get sample rate from metadata
        if (log.interaction_metadata?.audio_sample_rate) {
          sampleRate = log.interaction_metadata.audio_sample_rate;
        } else if (isUserAudio) {
            sampleRate = CONSTANTS.AUDIO.SAMPLE_RATES.USER; // User audio is typically 16kHz
        }
        
        const numSamples = audioArrayBuffer.byteLength / 2; // 16-bit samples
        
        const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        
        // Convert PCM data to audio buffer
        const dataView = new DataView(audioArrayBuffer);
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
        
        console.log(`🎬 Playing ${audioSource} PCM audio chunk:`, numSamples, 'samples at', sampleRate, 'Hz', `(${audioBuffer.duration.toFixed(3)}s)`);
        updateState({ replayStatus: `🔊 Playing ${audioSource.toLowerCase()} audio (${audioBuffer.duration.toFixed(2)}s)` });
      } else {
        // Handle encoded audio (MP3, WAV, etc.)
        try {
          const audioBuffer = await audioContext.decodeAudioData(audioArrayBuffer);
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
          updateState({ replayStatus: `❌ Failed to decode ${audioSource.toLowerCase()} audio` });
          updateReplayStatusForMediaError('AUDIO', log.id, `decode error`);
        }
      }
    } catch (error) {
      console.error(`Error playing ${audioSource} audio chunk:`, error);
      updateState({ replayStatus: `❌ Error playing ${audioSource.toLowerCase()} audio` });
      updateReplayStatusForMediaError('AUDIO', log.id, `playback error`);
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
          updateReplayStatusForMediaError('AUDIO', log.id, `expired URL (HTTP ${response.status})`);
        } else {
          responseText = `Gemini response stored in cloud (ID: ${log.id}) - Failed to fetch via proxy (${response.status})`;
          updateReplayStatusForMediaError('AUDIO', log.id, `fetch error (HTTP ${response.status})`);
        }
      } catch (error) {
        console.error('Error fetching API response via proxy:', error);
        responseText = `Gemini response stored in cloud (ID: ${log.id}) - Error fetching via proxy`;
        updateReplayStatusForMediaError('AUDIO', log.id, `fetch error`);
      }
    } else if (log.media_data && log.media_data.storage_type === 'hash_only') {
      responseText = `Gemini response detected (${log.id}) - Data stored as hash only. Enable replay mode for full content.`;
      updateReplayStatusForMediaError('AUDIO', log.id, 'hash-only mode');
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

  const playNextSegment = async (segmentIndex, isPlaying = null, segments = null) => {
    // Use passed parameters or fall back to state (fix for timing issues)
    const actualIsPlaying = isPlaying !== null ? isPlaying : state.isPlaying;
    const actualSegments = segments || state.conversationSegments;
    
    console.log(`🎭 playNextSegment called: index=${segmentIndex}, isPlaying=${actualIsPlaying}, segments=${actualSegments.length}`);
    
    if (!actualIsPlaying || segmentIndex >= actualSegments.length) {
      console.log('🎭 Segment replay complete');
      updateState({ isPlaying: false });
      return;
    }

    const segment = actualSegments[segmentIndex];
    console.log(`🎭 Playing segment ${segmentIndex + 1}/${actualSegments.length}: ${segment.type} (${segment.duration}ms)`);

    updateState({ currentSegmentIndex: segmentIndex });

    try {
      // Handle different segment types and wait for completion
      if (segment.type === 'user_speech') {
        await playUserSpeechSegment(segment, actualIsPlaying);
      } else if (segment.type === 'api_response') {
        await playApiResponseSegment(segment);
      } else if (segment.type === 'user_text') {
        playTextSegment(segment);
      } else {
        playActionSegment(segment);
      }

      // Add a small delay between segments for natural pacing
      const delay = Math.max(200, Math.min(1000, segment.duration * 0.1 / state.playbackSpeed));
      console.log(`🎭 Segment completed, waiting ${delay}ms before next segment`);
      
      setTimeout(() => {
        // FIX: Continue with next segment, passing state explicitly to avoid timing issues
        playNextSegment(segmentIndex + 1, actualIsPlaying, actualSegments);
      }, delay);

    } catch (error) {
      console.error('🚨 Segment playback failed:', error);
      updateState({ replayStatus: `❌ Segment ${segmentIndex + 1} failed: ${error.message}` });
      // Continue to next segment after brief delay, maintaining state
      setTimeout(() => playNextSegment(segmentIndex + 1, actualIsPlaying, actualSegments), 500);
    }
  };

  const playUserSpeechSegment = async (segment, isPlaying = true) => {
    updateState({ replayStatus: `🎤 Playing user speech (${(segment.duration / 1000).toFixed(1)}s)` });
    
    // Display video frames during speech
    const segmentVideo = state.processedSegments.get(`${segment.id}_video`);
    console.log(`🎤 User speech segment ${segment.id}: looking for video segment "${segment.id}_video"`);
    console.log(`🎤 Available processed segments:`, Array.from(state.processedSegments.keys()));
    console.log(`🎤 Video frames in segment:`, segment.videoFrames?.length || 0);
    console.log(`🎤 Current isPlaying state:`, state.isPlaying);
    console.log(`🎤 Passed isPlaying parameter:`, isPlaying);
    
    if (segmentVideo) {
      console.log(`🎤 Found video segment for user speech:`, segmentVideo);
      console.log(`🎤 Video segment has ${segmentVideo.frames?.length || 0} frames with average interval ${segmentVideo.averageInterval}ms`);
      // Pass the isPlaying parameter to video playback
      playSegmentVideo(segmentVideo, isPlaying);
    } else {
      // Check if this is expected (short segments often don't have video)
      const isShortSegment = segment.duration < 500; // Less than 500ms
      const hasVideoFramesInSegment = segment.videoFrames && segment.videoFrames.length > 0;
      
      if (hasVideoFramesInSegment) {
        // This is unexpected - segment has video frames but no processed video
        console.warn(`🎤 ⚠️  Segment ${segment.id} has ${segment.videoFrames.length} video frames but no processed video segment!`);
        console.warn(`🎤 Video frames:`, segment.videoFrames.map(f => ({ id: f.id, timestamp: f.timestamp })));
      } else if (isShortSegment) {
        // This is expected for short segments
        console.log(`🎤 📝 No video for segment ${segment.id} (${segment.duration}ms) - expected for short speech`);
      } else {
        // Longer segment without video - noteworthy but not alarming
        console.log(`🎤 📹 No video segment found for user speech segment ${segment.id} (${segment.duration}ms)`);
      }
    }
    
    // Play unified audio and wait for completion
    const segmentAudio = state.processedSegments.get(`${segment.id}_audio`);
    if (segmentAudio) {
      const { audioContext, audioBuffer } = segmentAudio;
      
      return new Promise((resolve) => {
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = audioBuffer;
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Boost user audio volume
        gainNode.gain.value = CONSTANTS.AUDIO.VOLUME.USER;
        
        // Wait for audio to complete
        source.onended = () => {
          console.log(`🎤 User speech completed: ${audioBuffer.duration.toFixed(2)}s`);
          // Stop any ongoing video playback for this segment when audio ends
          if (videoPlaybackRef.current) {
            console.log(`🎤 Stopping video playback as user speech audio completed`);
            videoPlaybackRef.current.stop = true;
          }
          resolve();
        };
        
        source.start(0);
        console.log(`🎤 Playing unified user speech: ${audioBuffer.duration.toFixed(2)}s`);
      });
    }
    
    // If no audio, just wait a short time
    return new Promise(resolve => setTimeout(resolve, 100));
  };

  const playApiResponseSegment = async (segment) => {
    updateState({ replayStatus: `🤖 Playing API response (${(segment.duration / 1000).toFixed(1)}s)` });
    
    // Play unified audio and wait for completion
    const segmentAudio = state.processedSegments.get(`${segment.id}_audio`);
    if (segmentAudio) {
      const { audioContext, audioBuffer } = segmentAudio;
      
      return new Promise((resolve) => {
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = audioBuffer;
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // API audio at normal volume
        gainNode.gain.value = CONSTANTS.AUDIO.VOLUME.API;
        
        // Wait for audio to complete
        source.onended = () => {
          console.log(`🤖 API response completed: ${audioBuffer.duration.toFixed(2)}s`);
          resolve();
        };
        
        source.start(0);
        console.log(`🤖 Playing unified API response: ${audioBuffer.duration.toFixed(2)}s`);
      });
    }

    // Show API response text if available
    const textLog = segment.logs.find(log => log.interaction_type === 'api_response');
    if (textLog) {
      updateState({ currentApiResponse: `API responded with ${segment.audioChunks.length} audio chunks` });
    }
    
    // If no audio, just wait a short time
    return new Promise(resolve => setTimeout(resolve, 100));
  };

  const playTextSegment = (segment) => {
    const textLog = segment.logs[0];
    updateState({ 
      replayStatus: `📝 Processing text input...`,
      currentTextInput: textLog.interaction_metadata?.text || 'Text input detected'
    });
  };

  const playActionSegment = (segment) => {
    const actionLog = segment.logs[0];
    const actionType = actionLog.interaction_metadata?.action_type || 'action';
    updateState({ 
      replayStatus: `⚡ User action: ${actionType}`,
      currentUserAction: `${actionType}: ${actionLog.interaction_metadata?.action_details || 'User interaction'}`
    });
  };

  const playSegmentVideo = (segmentVideo, isPlaying = true) => {
    const { frames, averageInterval } = segmentVideo;
    let frameIndex = 0;
    
    // Create a local playing flag to avoid state closure issues
    let isPlayingVideo = true;
    
    // Stop any previous video playback
    if (videoPlaybackRef.current) {
      videoPlaybackRef.current.stop = true;
    }
    
    // Create new playback control object
    videoPlaybackRef.current = { stop: false };
    const playbackControl = videoPlaybackRef.current;

    const showNextFrame = () => {
      // Check both the playback control and current state
      if (frameIndex < frames.length && !playbackControl.stop && isPlaying) {
        const frame = frames[frameIndex];
        console.log(`📹 Processing frame ${frameIndex + 1}/${frames.length}:`, frame);
        
        if (frame.frameData && videoRef.current) {
          console.log(`📹 Frame data available:`, frame.frameData);
          displayFrameAsImage(frame.frameData.url, null, true, frameIndex, frames.length);
        } else {
          console.warn(`📹 Frame ${frameIndex + 1} missing data:`, { hasFrameData: !!frame.frameData, hasVideoRef: !!videoRef.current });
        }

        frameIndex++;
        if (frameIndex < frames.length && !playbackControl.stop) {
          const delay = Math.max(100, averageInterval / state.playbackSpeed);
          console.log(`📹 Scheduling next frame in ${delay}ms`);
          setTimeout(showNextFrame, delay);
        } else {
          console.log(`📹 Video segment playback completed (${frames.length} frames)`);
          videoPlaybackRef.current = null;
        }
      } else {
        console.log(`📹 Video playback stopped: frameIndex=${frameIndex}, frames.length=${frames.length}, isPlaying=${isPlaying}, stopped=${playbackControl.stop}`);
        videoPlaybackRef.current = null;
      }
    };

    if (frames.length > 0) {
      console.log(`📹 Starting video playback: ${frames.length} frames at ${averageInterval}ms intervals`);
      console.log(`📹 First frame data:`, frames[0]);
      showNextFrame();
    } else {
      console.warn(`📹 No frames available for video playback`);
    }
  };

  // Debug test function - add this after the component definition
  const testSegmentFiltering = () => {
    console.log('🧪 ===== TESTING SEGMENT FILTERING IN INTERACTIONREPLAY =====');
    
    // Mock problematic data similar to the session
    const testLogs = [
      {
        id: 1,
        interaction_type: 'audio_chunk',
        timestamp: '2025-05-31T23:52:48.962553',
        interaction_metadata: { microphone_on: true, audio_sample_rate: 16000 }
      },
      {
        id: 2,
        interaction_type: 'audio_chunk',
        timestamp: '2025-05-31T23:52:48.964553', // 2ms later
        interaction_metadata: { microphone_on: true, audio_sample_rate: 16000 }
      },
      {
        id: 3,
        interaction_type: 'api_response',
        timestamp: '2025-05-31T23:52:58.862340',
        media_data: { cloud_storage_url: 'test.pcm' },
        interaction_metadata: { response_type: 'audio' }
      },
      {
        id: 4,
        interaction_type: 'audio_chunk',
        timestamp: '2025-05-31T23:53:02.809097',
        interaction_metadata: { microphone_on: true, audio_sample_rate: 16000 }
      },
      {
        id: 5,
        interaction_type: 'audio_chunk',
        timestamp: '2025-05-31T23:53:02.827097', // 18ms later
        interaction_metadata: { microphone_on: true, audio_sample_rate: 16000 }
      }
    ];
    
    console.log('🧪 Testing with mock logs that should create short user speech segments...');
    const result = processIntoSegments(testLogs);
    
    console.log('🧪 Result segments:', result);
    const userSpeechSegments = result.filter(s => s.type === 'user_speech');
    const shortSegments = userSpeechSegments.filter(s => s.duration < 500);
    
    console.log(`🧪 User speech segments found: ${userSpeechSegments.length}`);
    console.log(`🧪 Short user speech segments (< 500ms): ${shortSegments.length}`);
    
    if (shortSegments.length === 0) {
      console.log('🧪 ✅ FILTERING IS WORKING: No short segments remain');
    } else {
      console.log('🧪 ❌ FILTERING NOT WORKING: Short segments still exist:', shortSegments);
    }
    
    return result;
  };

  // Export test function to window for console access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.testSegmentFiltering = testSegmentFiltering;
      window.debugInteractionReplay = {
        processIntoSegments,
        testSegmentFiltering,
        currentState: state,
        conversationSegments: state.conversationSegments
      };
    }
  }, [state.conversationSegments]);

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