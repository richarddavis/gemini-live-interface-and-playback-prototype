import { useState, useRef, useCallback } from 'react';

/**
 * Custom hook for handling audio streaming with buffering
 * Extracted from GeminiLiveDirect to be reusable for both live and replay
 */
export const useAudioStreaming = (options = {}) => {
  const {
    timeout = 500,
    sampleRate = 24000,
    audioSource = 'gemini_api',
    onStreamStart,
    onStreamEnd,
    onPlaybackStart,
    onPlaybackEnd,
    onError
  } = options;

  const [isReceivingAudio, setIsReceivingAudio] = useState(false);
  
  const audioBufferRef = useRef([]);
  const audioTimeoutRef = useRef(null);
  const audioContextRef = useRef(null);

  const clearBuffer = useCallback(() => {
    if (audioTimeoutRef.current) {
      clearTimeout(audioTimeoutRef.current);
      audioTimeoutRef.current = null;
    }
    audioBufferRef.current = [];
    setIsReceivingAudio(false);
  }, []);

  const playBufferedAudio = useCallback(async () => {
    if (audioBufferRef.current.length === 0) {
      console.log('🎵 No audio chunks to play');
      return;
    }

    try {
      // Initialize audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate
        });
      }

      const audioContext = audioContextRef.current;
      
      // Resume audio context if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Concatenate all audio chunks
      const totalLength = audioBufferRef.current.reduce((sum, buffer) => sum + buffer.byteLength, 0);
      const combinedBuffer = new ArrayBuffer(totalLength);
      const combinedView = new Uint8Array(combinedBuffer);
      
      let offset = 0;
      for (const buffer of audioBufferRef.current) {
        combinedView.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }

      console.log(`🎵 Playing combined audio: ${audioBufferRef.current.length} chunks, ${totalLength} bytes`);

      // Process as PCM (16-bit, mono, little-endian)
      const numChannels = 1;
      const bytesPerSample = 2;
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

      // Notify about playback start
      if (onPlaybackStart) {
        onPlaybackStart({
          chunks_count: audioBufferRef.current.length,
          total_bytes: totalLength,
          estimated_duration: audioBuffer.duration,
          playback_timestamp: Date.now()
        });
      }

      // Create source and play
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      source.onended = () => {
        console.log('🎵 Audio playback completed');
        setIsReceivingAudio(false);
        if (onPlaybackEnd) {
          onPlaybackEnd({
            timestamp: Date.now()
          });
        }
      };
      
      source.start(0);
      
      // Clear the buffer after starting playback
      audioBufferRef.current = [];

    } catch (error) {
      console.error('🚨 Buffered audio playback failed:', error);
      setIsReceivingAudio(false);
      audioBufferRef.current = [];
      if (onError) {
        onError(error);
      }
    }
  }, [sampleRate, onPlaybackStart, onPlaybackEnd, onError]);

  const addAudioChunk = useCallback((arrayBuffer) => {
    // Validate input
    if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer)) {
      const error = new Error('Invalid audio chunk: expected ArrayBuffer');
      if (onError) {
        onError(error);
      }
      return;
    }

    try {
      // Add this chunk to the buffer
      audioBufferRef.current.push(arrayBuffer);
      
      // Set receiving state and notify on first chunk
      if (!isReceivingAudio) {
        setIsReceivingAudio(true);
        if (onStreamStart) {
          onStreamStart({
            timestamp: Date.now(),
            audio_source: audioSource
          });
        }
      }
      
      // Clear existing timeout and set new one
      if (audioTimeoutRef.current) {
        clearTimeout(audioTimeoutRef.current);
      }
      
      // Wait for stream to complete (configurable timeout)
      audioTimeoutRef.current = setTimeout(() => {
        if (onStreamEnd) {
          onStreamEnd({
            timestamp: Date.now(),
            chunks_count: audioBufferRef.current.length,
            audio_source: audioSource
          });
        }
        playBufferedAudio();
      }, timeout);

    } catch (error) {
      console.error('🚨 Audio chunk processing failed:', error);
      if (onError) {
        onError(error);
      }
    }
  }, [isReceivingAudio, timeout, audioSource, onStreamStart, onStreamEnd, playBufferedAudio, onError]);

  return {
    isReceivingAudio,
    addAudioChunk,
    clearBuffer
  };
}; 