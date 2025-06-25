import { renderHook, act } from '@testing-library/react';
import { useChatApi } from '../useChatApi';

// Mock global EventSource
class EventSourceMock {
  static instances = [];
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.readyState = 1; // OPEN
    this.onmessage = null;
    this.onerror = null;
    EventSourceMock.instances.push(this);
  }
  close() {
    this.readyState = 2; // CLOSED
  }
  // Helper to fire an SSE message
  emit(dataObj) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(dataObj) });
    }
  }
  emitError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

global.EventSource = EventSourceMock;

beforeEach(() => {
  EventSourceMock.instances = [];
});

describe('useChatApi streamMessageToLLM', () => {
  it('reports chunks and completion callbacks in order', () => {
    jest.useFakeTimers();

    const API_URL = 'http://localhost:8080/api';

    const { result } = renderHook(() => useChatApi(API_URL));

    const onChunk = jest.fn();
    const onComplete = jest.fn();
    const onError = jest.fn();

    act(() => {
      // Call the streaming function – this will create an EventSourceMock
      result.current.streamMessageToLLM(
        42,
        { text: 'Hello' },
        'fakeApiKey',
        'openai',
        { onChunk, onComplete, onError }
      );
    });

    // Get the created EventSource instance
    const es = EventSourceMock.instances[0];

    // Emit delta chunks and done
    act(() => {
      es.emit({ delta: 'A' });
      es.emit({ delta: 'B' });
      es.emit({ done: true });
    });

    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk).toHaveBeenNthCalledWith(1, 'A');
    expect(onChunk).toHaveBeenNthCalledWith(2, 'B');

    // onComplete should be deferred with setTimeout(100) – flush timers
    jest.runAllTimers();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    jest.useRealTimers();
  });
});