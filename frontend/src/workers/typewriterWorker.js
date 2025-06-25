// Web Worker: typewriterWorker.js

// Character queue
let queue = [];
let timerId = null;
const MIN_DELAY = 60; // ms (adjust for speed)
const MAX_DELAY = 90;

function scheduleNext() {
  if (timerId || queue.length === 0) return;
  const delay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
  timerId = setTimeout(() => {
    timerId = null;
    if (queue.length === 0) return;
    const char = queue.shift();
    self.postMessage({ type: 'char', char });
    scheduleNext();
  }, delay);
}

self.onmessage = (e) => {
  const { type, data } = e.data;
  if (type === 'add') {
    queue.push(...data.split(''));
    scheduleNext();
  } else if (type === 'flush') {
    // Emit all remaining chars immediately (e.g., on stream complete)
    while (queue.length) {
      self.postMessage({ type: 'char', char: queue.shift() });
    }
    self.postMessage({ type: 'flushComplete' });
  }
};