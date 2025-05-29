# Gemini Live API - Modern Implementation Guide

Based on comprehensive review of official documentation from Google Cloud Vertex AI and Google AI Studio, this guide provides the correct approach to implementing Gemini Live API in 2025.

## 🚨 Critical Findings from Documentation Review

### 1. **CRITICAL: Correct Model Name**
The model name is absolutely crucial for Live API:

```python
# ✅ CORRECT - Live API Model
model_id = "gemini-2.0-flash-live-preview-04-09"

# ❌ WRONG - Regular Model (not Live API)
model_id = "gemini-2.0-flash"
```

**This is the most common cause of Live API connection failures.**

### 2. **SDK Requirements**
Must use the modern `google-genai` SDK (v1.0+):

```bash
# ✅ CORRECT - Modern SDK
pip install google-genai>=1.0.0

# ❌ WRONG - Older SDK (limited features)
pip install google-generativeai
```

### 3. **Authentication Method**
We're using Vertex AI correctly with service account JSON (no API key needed):

```python
# ✅ CORRECT - Vertex AI Authentication
client = genai.Client(
    http_options=HttpOptions(api_version="v1beta1"),
    vertexai=True,
    project=project_id,
    location=location
)

# Environment variables for Vertex AI
os.environ["GOOGLE_CLOUD_PROJECT"] = "generative-fashion-355408"
os.environ["GOOGLE_CLOUD_LOCATION"] = "global"
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
```

### 4. **Location Configuration**
Location must be specified. Common options:
- `global` (recommended for testing)
- `us-central1`
- `us-east5`

### 5. **Audio Format Requirements**
- **Input Audio**: Raw 16 bit PCM at 16kHz little-endian
- **Output Audio**: Raw 16 bit PCM at 24kHz little-endian

## 🏗️ Modern Implementation Architecture

### SDK Structure
```python
from google import genai
from google.genai.types import (
    Content,
    LiveConnectConfig,
    HttpOptions,
    Modality,
    Part,
    SpeechConfig,
    VoiceConfig,
    PrebuiltVoiceConfig,
)

# Client initialization
client = genai.Client(
    http_options=HttpOptions(api_version="v1beta1"),
    vertexai=True,
    project="generative-fashion-355408",
    location="global"
)

# Session configuration
config = LiveConnectConfig(
    response_modalities=[Modality.TEXT],  # or [Modality.AUDIO]
    speech_config=SpeechConfig(
        voice_config=VoiceConfig(
            prebuilt_voice_config=PrebuiltVoiceConfig(
                voice_name="Aoede"  # 8 voices available
            )
        )
    )
)

# Connection
async with client.aio.live.connect(model=model_id, config=config) as session:
    # Send content
    await session.send_client_content(
        turns=Content(role="user", parts=[Part(text="Hello")])
    )
    
    # Receive responses
    async for message in session.receive():
        if message.text:
            print(message.text)
```

## 🧪 Updated Test Framework

### New Test Suite: `test_modern_gemini_live.py`

This completely rewritten test suite implements the correct Live API approach:

**Features:**
- ✅ Uses correct model: `gemini-2.0-flash-live-preview-04-09`
- ✅ Uses `google-genai` SDK with async WebSocket connections
- ✅ Proper Vertex AI authentication
- ✅ Text-to-text communication test
- ✅ Text-to-audio communication test
- ✅ Conversation memory test across multiple turns
- ✅ Proper error handling and detailed logging

**Tests Included:**
1. **Text Communication Test** - Basic Live API WebSocket communication
2. **Audio Communication Test** - Text-to-speech with voice selection
3. **Conversation Memory Test** - Multi-turn conversation context retention

### New Test Runner: `test_live_api_modern.sh`

Comprehensive test runner with:
- Dependency checking
- Docker environment setup
- Test execution with proper configuration
- Results analysis and reporting
- Cleanup functionality

## 🚀 How to Run the Modern Tests

### Prerequisites
1. Docker and docker-compose installed
2. Service account JSON file in `.secrets/gcp/`
3. Project ID: `generative-fashion-355408`

### Quick Start
```bash
# Show test configuration
./test_live_api_modern.sh --info

# Run validation only
./test_live_api_modern.sh --validate

# Run full test suite
./test_live_api_modern.sh

# Get help
./test_live_api_modern.sh --help
```

### Manual Testing
```bash
# Build with updated dependencies
docker-compose -f docker-compose.test.yml build backend

# Run the modern test suite
docker-compose -f docker-compose.test.yml run --rm backend python test_modern_gemini_live.py
```

## 📋 Live API Capabilities

### Supported Features
- ✅ **Multimodality**: Text, audio, and video input/output
- ✅ **Low-latency**: Real-time bidirectional communication
- ✅ **Session Memory**: Context retention within sessions
- ✅ **Voice Activity Detection**: Automatic speech detection
- ✅ **Function Calling**: Integration with external services
- ✅ **Code Execution**: Python code generation and execution
- ✅ **Grounding**: Google Search integration
- ✅ **Multiple Voices**: 8 HD voices available (Aoede, Puck, Charon, Kore, Fenrir, Leda, Orus, Zephyr)
- ✅ **31 Languages**: Multilingual support

### Session Specifications
- **Default Session Length**: 10 minutes (extendable in 10-minute increments)
- **Context Window**: 32,768 tokens
- **Audio Rate**: 25 tokens/second, Video: 258 tokens/second
- **Concurrent Sessions**: Up to 10 per project
- **Rate Limits**: 4M tokens per minute

## 🔧 Configuration Examples

### Text-Only Communication
```python
config = LiveConnectConfig(
    response_modalities=[Modality.TEXT]
)
```

### Audio Output with Voice Selection
```python
config = LiveConnectConfig(
    response_modalities=[Modality.AUDIO],
    speech_config=SpeechConfig(
        voice_config=VoiceConfig(
            prebuilt_voice_config=PrebuiltVoiceConfig(
                voice_name="Aoede"
            )
        ),
        language_code="en-US"
    )
)
```

### Multi-Modal (Text + Audio)
```python
config = LiveConnectConfig(
    response_modalities=[Modality.TEXT, Modality.AUDIO],
    speech_config=SpeechConfig(
        voice_config=VoiceConfig(
            prebuilt_voice_config=PrebuiltVoiceConfig(
                voice_name="Puck"
            )
        )
    )
)
```

## 🚨 Common Issues and Solutions

### Issue 1: "Model not found" or Connection Failures
**Cause**: Using wrong model name
**Solution**: Use `gemini-2.0-flash-live-preview-04-09` (not `gemini-2.0-flash`)

### Issue 2: SDK Import Errors
**Cause**: Using older `google-generativeai` package
**Solution**: Install `google-genai>=1.0.0`

### Issue 3: Authentication Issues
**Cause**: Incorrect authentication setup
**Solution**: Verify service account JSON and environment variables:
```bash
export GOOGLE_CLOUD_PROJECT="generative-fashion-355408"
export GOOGLE_CLOUD_LOCATION="global"
export GOOGLE_GENAI_USE_VERTEXAI="True"
```

### Issue 4: Region/Location Errors
**Cause**: Incorrect or missing location
**Solution**: Set location to `global`, `us-central1`, or `us-east5`

### Issue 5: Audio Format Issues
**Cause**: Wrong audio format
**Solution**: Use Raw 16-bit PCM (16kHz input, 24kHz output)

## 📊 Test Results Structure

The modern test framework outputs structured results:

```json
{
  "timestamp": "2025-01-XX...",
  "test_framework": "Modern Gemini Live API Test",
  "model": "gemini-2.0-flash-live-preview-04-09",
  "results": {
    "text_communication": {
      "status": "success",
      "input": "Hello? Gemini, are you there?",
      "output": "Yes, I'm here. What would you like to talk about?",
      "model": "gemini-2.0-flash-live-preview-04-09",
      "modality": "text"
    },
    "audio_communication": {
      "status": "success",
      "input": "Hello! Please say a brief greeting.",
      "audio_samples": 48000,
      "audio_file": "test_results/live_api_audio_20250XXX.raw",
      "model": "gemini-2.0-flash-live-preview-04-09",
      "modality": "audio",
      "voice": "Aoede"
    },
    "conversation_memory": {
      "status": "success",
      "memory_retained": true,
      "first_input": "My name is Alice and my favorite color is blue.",
      "second_input": "What is my name and favorite color?",
      "second_response": "Your name is Alice and your favorite color is blue."
    }
  }
}
```

## 🔄 Next Steps

1. **Run the Modern Tests**: Execute `./test_live_api_modern.sh` to validate Live API connectivity
2. **Audio Testing**: Test audio input/output with microphone and speakers
3. **WebSocket Proxy Development**: Create proxy for browser-based applications
4. **Function Calling Integration**: Add external service integration
5. **Production Integration**: Integrate Live API into your chat application

## 📚 Official Documentation References

- [Vertex AI Live API Reference](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/multimodal-live)
- [Live API Guide](https://cloud.google.com/vertex-ai/generative-ai/docs/live-api)
- [Google GenAI SDK Documentation](https://ai.google.dev/gemini-api/docs/live)
- [Live API Cookbook Examples](https://github.com/google-gemini/cookbook)

## ⚠️ Important Notes

1. **Model Name is Critical**: The exact model name `gemini-2.0-flash-live-preview-04-09` is required
2. **SDK Version Matters**: Use `google-genai` v1.0+ for full Live API support
3. **Authentication**: We have Vertex AI properly configured (no API key needed)
4. **Region Sensitivity**: Location configuration affects availability and performance
5. **Audio Formats**: Specific PCM format requirements must be followed

---

**Summary**: The key to successful Live API implementation is using the correct model name, modern SDK, and proper configuration. Our previous attempts likely failed due to using the wrong model name or SDK version. The new test framework addresses these issues and follows official documentation exactly. 