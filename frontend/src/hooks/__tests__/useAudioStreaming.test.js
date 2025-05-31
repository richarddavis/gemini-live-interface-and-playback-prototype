import { renderHook, act } from '@testing-library/react';
import { useAudioStreaming } from '../useAudioStreaming';

// Mock Web Audio API
const mockAudioBuffer = {
  duration: 2.5,
  getChannelData: jest.fn().mockReturnValue(new Float32Array(1000)),
};

const mockBufferSource = {
  buffer: null,
  connect: jest.fn(),
  start: jest.fn(),
  onended: null,
};

const mockAudioContext = {
  state: 'running',
  sampleRate: 24000,
  createBuffer: jest.fn(),
  createBufferSource: jest.fn(),
  destination: {},
  resume: jest.fn().mockResolvedValue(),
};

// Mock AudioContext constructor globally
global.AudioContext = jest.fn();
global.webkitAudioContext = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  // Setup fresh mocks for each test
  mockAudioContext.createBuffer.mockReturnValue(mockAudioBuffer);
  mockAudioContext.createBufferSource.mockReturnValue(mockBufferSource);
  global.AudioContext.mockImplementation(() => mockAudioContext);
  global.webkitAudioContext.mockImplementation(() => mockAudioContext);
  mockBufferSource.buffer = null;
  mockBufferSource.onended = null;
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useAudioStreaming', () => {
  describe('Basic functionality', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useAudioStreaming());
      
      expect(result.current.isReceivingAudio).toBe(false);
      expect(typeof result.current.addAudioChunk).toBe('function');
      expect(typeof result.current.clearBuffer).toBe('function');
    });

    it('should accept custom options', () => {
      const onStreamStart = jest.fn();
      const onStreamEnd = jest.fn();
      const onPlaybackStart = jest.fn();
      const onPlaybackEnd = jest.fn();
      
      const { result } = renderHook(() => useAudioStreaming({
        timeout: 1000,
        onStreamStart,
        onStreamEnd,
        onPlaybackStart,
        onPlaybackEnd
      }));
      
      expect(result.current.isReceivingAudio).toBe(false);
    });
  });

  describe('Audio chunk handling', () => {
    it('should start receiving when first chunk is added', () => {
      const onStreamStart = jest.fn();
      const { result } = renderHook(() => useAudioStreaming({ onStreamStart }));
      
      const mockChunk = new ArrayBuffer(1000);
      
      act(() => {
        result.current.addAudioChunk(mockChunk);
      });
      
      expect(result.current.isReceivingAudio).toBe(true);
      expect(onStreamStart).toHaveBeenCalledWith({
        timestamp: expect.any(Number),
        audio_source: 'gemini_api'
      });
    });

    it('should buffer multiple chunks without triggering playback immediately', () => {
      const onPlaybackStart = jest.fn();
      const { result } = renderHook(() => useAudioStreaming({ 
        timeout: 500,
        onPlaybackStart 
      }));
      
      const chunk1 = new ArrayBuffer(500);
      const chunk2 = new ArrayBuffer(500);
      
      act(() => {
        result.current.addAudioChunk(chunk1);
        result.current.addAudioChunk(chunk2);
      });
      
      expect(result.current.isReceivingAudio).toBe(true);
      expect(onPlaybackStart).not.toHaveBeenCalled();
    });

    it('should allow manual buffer clearing', () => {
      const { result } = renderHook(() => useAudioStreaming());
      
      const mockChunk = new ArrayBuffer(1000);
      
      act(() => {
        result.current.addAudioChunk(mockChunk);
      });
      
      expect(result.current.isReceivingAudio).toBe(true);
      
      act(() => {
        result.current.clearBuffer();
      });
      
      expect(result.current.isReceivingAudio).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should handle invalid audio data gracefully', () => {
      const onError = jest.fn();
      const { result } = renderHook(() => useAudioStreaming({ onError }));
      
      const invalidChunk = null;
      
      act(() => {
        result.current.addAudioChunk(invalidChunk);
      });
      
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Invalid audio chunk')
        })
      );
    });

    it('should handle audio context creation errors gracefully', async () => {
      // Replace the global mock temporarily
      const originalAudioContext = global.AudioContext;
      global.AudioContext = jest.fn(() => {
        throw new Error('AudioContext not supported');
      });
      
      const onError = jest.fn();
      const { result } = renderHook(() => useAudioStreaming({ onError }));
      
      const mockChunk = new ArrayBuffer(1000);
      
      act(() => {
        result.current.addAudioChunk(mockChunk);
      });
      
      // Fast forward the timeout
      await act(async () => {
        jest.advanceTimersByTime(500);
        // Use setTimeout instead of setImmediate for browser compatibility
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('AudioContext not supported')
        })
      );
      
      // Restore the mock
      global.AudioContext = originalAudioContext;
    });
  });

  // Integration test that doesn't rely on complex mocking
  describe('Integration', () => {
    it('should trigger timeout callback when chunks stop arriving', async () => {
      const onStreamEnd = jest.fn();
      const { result } = renderHook(() => useAudioStreaming({ 
        timeout: 300,
        onStreamEnd
      }));
      
      const mockChunk = new ArrayBuffer(1000);
      
      act(() => {
        result.current.addAudioChunk(mockChunk);
      });
      
      expect(onStreamEnd).not.toHaveBeenCalled();
      
      // Fast forward time to trigger timeout
      await act(async () => {
        jest.advanceTimersByTime(300);
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      
      expect(onStreamEnd).toHaveBeenCalledWith({
        timestamp: expect.any(Number),
        chunks_count: 1,
        audio_source: 'gemini_api'
      });
    });

    it('should reset timeout when new chunks arrive', () => {
      const onStreamEnd = jest.fn();
      const { result } = renderHook(() => useAudioStreaming({ 
        timeout: 500,
        onStreamEnd 
      }));
      
      const chunk1 = new ArrayBuffer(500);
      const chunk2 = new ArrayBuffer(500);
      
      act(() => {
        result.current.addAudioChunk(chunk1);
      });
      
      act(() => {
        jest.advanceTimersByTime(300);
      });
      
      act(() => {
        result.current.addAudioChunk(chunk2);
      });
      
      act(() => {
        jest.advanceTimersByTime(300);
      });
      
      // Should not have triggered yet
      expect(onStreamEnd).not.toHaveBeenCalled();
      
      act(() => {
        jest.advanceTimersByTime(200);
      });
      
      // Now it should have triggered
      expect(onStreamEnd).toHaveBeenCalled();
    });
  });
}); 