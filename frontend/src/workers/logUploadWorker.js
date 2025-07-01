// Web worker to upload interaction log items without blocking the main thread

/* eslint-disable no-restricted-globals */

// Simple concurrency guard — only X parallel fetches at once
const MAX_PARALLEL = 6;
let active = 0;
const queue = [];

self.onmessage = (e) => {
  const { id, baseUrl, item } = e.data;
  queue.push({ id, baseUrl, item });
  pump();
};

function pump() {
  if (active >= MAX_PARALLEL || queue.length === 0) return;
  const { id, baseUrl, item } = queue.shift();
  active++;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second safety timeout

  fetch(`${baseUrl}/interaction-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(item),
    signal: controller.signal,
  })
    .then(async (res) => {
      clearTimeout(timeoutId);
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        self.postMessage({ id, ok: true, result: json });
      } else {
        self.postMessage({ id, ok: false, err: `HTTP ${res.status}` });
      }
    })
    .catch((err) => {
      self.postMessage({ id, ok: false, err: err.message || 'worker fetch error' });
    })
    .finally(() => {
      active--;
      pump();
    });
} 