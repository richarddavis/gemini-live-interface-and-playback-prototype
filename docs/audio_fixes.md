# Audio Processing Fixes for Gemini Live API

## Issue Description
The original implementation was producing garbled and very fast audio responses that sounded vaguely like speech but were unintelligible. Additionally, the console was flooded with enormous amounts of base64 audio data logging.

## Root Causes Identified

### 1. Sample Rate Configuration Issues
- **Problem**: Single audio context used for both recording (16kHz) and playback (24kHz)
- **Impact**: Caused sample rate mismatches leading to incorrect playback speed
- **Fix**: Separate audio contexts for recording vs playback with correct sample rates

### 2. PCM Data Conversion Errors
- **Problem**: Improper handling of 16-bit little-endian PCM data
- **Impact**: Garbled audio due to incorrect byte order interpretation
- **Fix**: Proper DataView usage with explicit little-endian handling

### 3. Audio Buffer Creation Issues
- **Problem**: Sample rate not properly extracted from MIME type
- **Impact**: Audio played at wrong speed
- **Fix**: Parse sample rate from MIME type (e.g., "audio/pcm;rate=24000")

### 4. **Audio Chunk Streaming Issues (Major Fix)**
- **Problem**: Each audio chunk was played immediately instead of being buffered
- **Impact**: Multiple overlapping audio streams created garbled, unintelligible sound
- **Fix**: Implemented audio buffering system that accumulates chunks and plays them as a single stream

### 5. **Console Logging Overload**
- **Problem**: Massive base64 audio data was being logged for every chunk
- **Impact**: Made debugging impossible and consumed excessive memory
- **Fix**: Reduced logging verbosity and implemented selective logging

## Detailed Fixes Applied

### 1. Audio Context Separation
```javascript
// Recording: 16kHz context for input processing
const recordingAudioContext = new AudioContext({ sampleRate: 16000 });

// Playback: 24kHz context for output (or main context)
if (!audioContextRef.current) {
  audioContextRef.current = new AudioContext({ sampleRate: 24000 });
}
```

### 2. Improved PCM Conversion for Recording
```javascript
// Proper float32 to int16 conversion with clamping
const sample = Math.max(-1, Math.min(1, inputData[i]));
pcmData[i] = Math.round(sample * 32767);
```

### 3. Proper PCM Decoding for Playback
```javascript
// Use DataView for proper endianness handling
const dataView = new DataView(arrayBuffer);
for (let i = 0; i < numSamples; i++) {
  const sample = dataView.getInt16(i * 2, true); // true = little-endian
  channelData[i] = sample / 32768.0;
}
```

### 4. Enhanced Audio Format Detection
```javascript
// Extract sample rate from MIME type
const rateMatch = inlineData.mimeType.match(/rate=(\d+)/);
if (rateMatch) {
  sampleRate = parseInt(rateMatch[1]);
}
```

### 5. Improved Error Handling
- Fallback from standard audio decode to raw PCM processing
- Better debugging output with sample counts and durations
- Proper cleanup of audio contexts and resources

### 6. **Audio Chunk Buffering System**
```javascript
// Buffer audio chunks instead of playing immediately
audioBufferRef.current.push(arrayBuffer);

// Wait for stream completion (500ms timeout)
audioTimeoutRef.current = setTimeout(() => {
  playBufferedAudio();
}, 500);

// Concatenate all chunks into single stream
const totalLength = audioBufferRef.current.reduce((sum, buffer) => sum + buffer.byteLength, 0);
const combinedBuffer = new ArrayBuffer(totalLength);
```

### 7. **Reduced Console Logging**
```javascript
// Only log 10% of audio chunks to prevent console overflow
if (Math.random() < 0.1) {
  console.log(`📤 Sending PCM audio chunk: ${pcmData.length} samples`);
}

// Simplified server content logging
console.log('🔍 Processing server content parts:', serverContent.modelTurn?.parts?.length || 0);
```

## Technical Specifications

### Google Gemini Live API Audio Requirements
- **Input**: 16-bit PCM, 16kHz, mono, little-endian
- **Output**: 16-bit PCM, 24kHz, mono, little-endian
- **MIME Types**: `audio/pcm;rate=16000` (input), `audio/pcm;rate=24000` (output)

### Browser Audio API Configuration
- **Recording**: Separate AudioContext at 16kHz
- **Playback**: Main AudioContext at 24kHz (or default)
- **Sample Format**: Float32 in browser, Int16 for transmission

## Testing Recommendations

1. **Audio Quality**: Test with various microphones and playback devices
2. **Sample Rate Handling**: Verify correct playback speed and pitch
3. **Latency**: Monitor real-time performance with WebRTC metrics
4. **Error Handling**: Test with network interruptions and malformed data

## Performance Optimizations

1. **Buffer Management**: Reuse audio buffers where possible
2. **Context Lifecycle**: Proper cleanup to prevent memory leaks
3. **Chunking**: Optimal chunk sizes (4096 samples) for low latency
4. **Voice Activity Detection**: Future enhancement to reduce bandwidth

## Browser Compatibility Notes

- **AudioContext**: Supported in all modern browsers
- **getUserMedia**: Requires HTTPS in production
- **Sample Rate Constraints**: Not all browsers honor exact sample rate requests
- **Audio Worklet**: Consider for future low-latency implementations 
## Reusable Hook
For new features use the shared [useAudioStreaming](../frontend/src/hooks/useAudioStreaming.js) hook to manage buffering and playback.
