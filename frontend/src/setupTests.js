// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock Web Audio API for testing
global.AudioContext = jest.fn(() => ({
  createBuffer: jest.fn(() => ({
    length: 1024,
    sampleRate: 44100,
    numberOfChannels: 2,
    getChannelData: jest.fn(() => new Float32Array(1024))
  })),
  createBufferSource: jest.fn(() => ({
    buffer: null,
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn()
  })),
  destination: {},
  sampleRate: 44100,
  close: jest.fn(),
  resume: jest.fn()
}));

global.webkitAudioContext = global.AudioContext;

// Mock fetch API
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ authenticated: true, user: { name: 'testuser' } }),
  })
);
