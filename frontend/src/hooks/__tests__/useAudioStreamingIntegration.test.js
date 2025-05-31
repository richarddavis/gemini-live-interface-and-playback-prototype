import { renderHook, act } from '@testing-library/react';
import { useAudioStreaming } from '../useAudioStreaming';

// Mock global dependencies
global.AudioContext = jest.fn(() => ({
  state: 'running',
  sampleRate: 24000,
  createBuffer: jest.fn().mockReturnValue({
    duration: 1.5,
    getChannelData: jest.fn().mockReturnValue(new Float32Array(1000))
  }),
  createBufferSource: jest.fn(() => ({
    buffer: null,
    connect: jest.fn(),
    start: jest.fn(),
    onended: null
  })),
  destination: {},
  resume: jest.fn().mockResolvedValue()
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useAudioStreaming - Replay System Integration', () => {
  describe('Replay scenario: Multiple Gemini audio chunks', () => {
    it('should buffer and play consecutive API audio chunks as a stream', async () => {
      const onStreamStart = jest.fn();
      const onStreamEnd = jest.fn();
      const onPlaybackStart = jest.fn();
      const onPlaybackEnd = jest.fn();

      const { result } = renderHook(() => useAudioStreaming({
        timeout: 200, // Faster timeout for API chunks
        audioSource: 'gemini_api',
        onStreamStart,
        onStreamEnd,
        onPlaybackStart,
        onPlaybackEnd
      }));

      // Simulate multiple API audio chunks arriving quickly (like in replay)
      const chunk1 = new ArrayBuffer(500);
      const chunk2 = new ArrayBuffer(750);
      const chunk3 = new ArrayBuffer(600);

      // First chunk starts the stream
      act(() => {
        result.current.addAudioChunk(chunk1);
      });

      expect(result.current.isReceivingAudio).toBe(true);
      expect(onStreamStart).toHaveBeenCalledWith({
        timestamp: expect.any(Number),
        audio_source: 'gemini_api'
      });

      // Additional chunks reset the timeout
      act(() => {
        result.current.addAudioChunk(chunk2);
      });

      act(() => {
        result.current.addAudioChunk(chunk3);
      });

      // Advance time to trigger playback
      await act(async () => {
        jest.advanceTimersByTime(200);
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(onStreamEnd).toHaveBeenCalledWith({
        timestamp: expect.any(Number),
        chunks_count: 3,
        audio_source: 'gemini_api'
      });

      expect(onPlaybackStart).toHaveBeenCalledWith({
        chunks_count: 3,
        total_bytes: 1850, // 500 + 750 + 600
        estimated_duration: 1.5,
        playback_timestamp: expect.any(Number)
      });
    });

    it('should handle user audio chunks immediately without buffering', () => {
      const onStreamStart = jest.fn();
      const onPlaybackStart = jest.fn();

      const { result } = renderHook(() => useAudioStreaming({
        timeout: 200,
        audioSource: 'user_microphone',
        onStreamStart,
        onPlaybackStart
      }));

      const userChunk = new ArrayBuffer(1000);

      act(() => {
        result.current.addAudioChunk(userChunk);
      });

      expect(result.current.isReceivingAudio).toBe(true);
      expect(onStreamStart).toHaveBeenCalledWith({
        timestamp: expect.any(Number),
        audio_source: 'user_microphone'
      });

      // User audio should trigger immediately (no buffering timeout)
      expect(onPlaybackStart).not.toHaveBeenCalled();
    });
  });

  describe('Replay scenario: Mixed audio types', () => {
    it('should handle different audio sources with different configs', async () => {
      const geminiCallbacks = {
        onStreamStart: jest.fn(),
        onStreamEnd: jest.fn(),
        onPlaybackStart: jest.fn()
      };

      const userCallbacks = {
        onStreamStart: jest.fn(),
        onStreamEnd: jest.fn(),
        onPlaybackStart: jest.fn()
      };

      // Simulate two separate audio streaming hooks - one for API, one for user
      const { result: geminiResult } = renderHook(() => useAudioStreaming({
        timeout: 200,
        audioSource: 'gemini_api',
        ...geminiCallbacks
      }));

      const { result: userResult } = renderHook(() => useAudioStreaming({
        timeout: 500, // Longer timeout for user audio
        audioSource: 'user_microphone',
        ...userCallbacks
      }));

      // Add API chunks
      act(() => {
        geminiResult.current.addAudioChunk(new ArrayBuffer(500));
        geminiResult.current.addAudioChunk(new ArrayBuffer(600));
      });

      // Add user chunk
      act(() => {
        userResult.current.addAudioChunk(new ArrayBuffer(800));
      });

      expect(geminiResult.current.isReceivingAudio).toBe(true);
      expect(userResult.current.isReceivingAudio).toBe(true);

      // Advance time for API audio
      await act(async () => {
        jest.advanceTimersByTime(200);
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(geminiCallbacks.onStreamEnd).toHaveBeenCalledWith({
        timestamp: expect.any(Number),
        chunks_count: 2,
        audio_source: 'gemini_api'
      });

      expect(geminiCallbacks.onPlaybackStart).toHaveBeenCalledWith({
        chunks_count: 2,
        total_bytes: 1100,
        estimated_duration: 1.5,
        playback_timestamp: expect.any(Number)
      });

      // User audio should still be buffering
      expect(userCallbacks.onStreamEnd).not.toHaveBeenCalled();
    });
  });

  describe('Replay scenario: Logging integration', () => {
    it('should provide appropriate data for replay system logging', async () => {
      const onStreamStart = jest.fn();
      const onStreamEnd = jest.fn();
      const onPlaybackStart = jest.fn();

      const { result } = renderHook(() => useAudioStreaming({
        timeout: 200,
        audioSource: 'gemini_api',
        onStreamStart,
        onStreamEnd,
        onPlaybackStart
      }));

      const chunk1 = new ArrayBuffer(500);
      const chunk2 = new ArrayBuffer(750);

      act(() => {
        result.current.addAudioChunk(chunk1);
        result.current.addAudioChunk(chunk2);
      });

      await act(async () => {
        jest.advanceTimersByTime(200);
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Verify the callbacks provide data needed for replay system logging
      expect(onStreamStart).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
          audio_source: 'gemini_api'
        })
      );

      expect(onStreamEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
          chunks_count: 2,
          audio_source: 'gemini_api'
        })
      );

      expect(onPlaybackStart).toHaveBeenCalledWith(
        expect.objectContaining({
          chunks_count: 2,
          total_bytes: 1250,
          estimated_duration: expect.any(Number),
          playback_timestamp: expect.any(Number)
        })
      );
    });
  });

  describe('Edge cases for replay system', () => {
    it('should handle rapid chunk additions without timeout conflicts', async () => {
      const onStreamEnd = jest.fn();
      const onPlaybackStart = jest.fn();

      const { result } = renderHook(() => useAudioStreaming({
        timeout: 100,
        onStreamEnd,
        onPlaybackStart
      }));

      // Rapidly add 5 chunks
      act(() => {
        for (let i = 0; i < 5; i++) {
          result.current.addAudioChunk(new ArrayBuffer(200 + i * 50));
        }
      });

      // Should still be buffering
      expect(onPlaybackStart).not.toHaveBeenCalled();

      // Advance time to trigger playback
      await act(async () => {
        jest.advanceTimersByTime(100);
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Should have played all chunks as one stream
      expect(onStreamEnd).toHaveBeenCalledWith({
        timestamp: expect.any(Number),
        chunks_count: 5,
        audio_source: 'gemini_api'
      });

      expect(onPlaybackStart).toHaveBeenCalledWith({
        chunks_count: 5,
        total_bytes: 1200, // 200+250+300+350+400
        estimated_duration: 1.5,
        playback_timestamp: expect.any(Number)
      });
    });

    it('should handle manual buffer clearing during replay', () => {
      const onStreamStart = jest.fn();
      const onPlaybackStart = jest.fn();

      const { result } = renderHook(() => useAudioStreaming({
        timeout: 200,
        onStreamStart,
        onPlaybackStart
      }));

      act(() => {
        result.current.addAudioChunk(new ArrayBuffer(500));
      });

      expect(result.current.isReceivingAudio).toBe(true);
      expect(onStreamStart).toHaveBeenCalled();

      // Clear buffer before timeout
      act(() => {
        result.current.clearBuffer();
      });

      expect(result.current.isReceivingAudio).toBe(false);

      // Advance time past timeout
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should not have triggered playback
      expect(onPlaybackStart).not.toHaveBeenCalled();
    });
  });
}); 