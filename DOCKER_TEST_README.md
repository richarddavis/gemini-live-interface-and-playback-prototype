# Gemini Live API Testing in Docker

This guide explains how to run the Gemini Live API tests in the dockerized environment. The test suite supports **two authentication methods** - choose the one that works best for your setup.

## Prerequisites

1. Docker and Docker Compose installed
2. **ONE** of these authentication methods:
   - **Option A:** Gemini API key from Google AI Studio
   - **Option B:** Google Cloud Project with service account (RECOMMENDED for Docker)

## Authentication Methods

### 🎯 **Option A: Gemini Developer API (API Key)**
- Simpler to get started
- Good for development and prototyping
- Get an API key from [Google AI Studio](https://ai.google.dev/)

### 🏢 **Option B: Vertex AI (Service Account) - RECOMMENDED**
- Enterprise-grade with better security
- Integrates with your existing Google Cloud setup
- Uses your service account JSON (already in `.secrets/gcp/`)
- Better for production environments

## Quick Start

```bash
# 1. Set up environment variables
cp .env.example .env

# 2. Edit .env and choose ONE authentication method:

# For API Key (Option A):
# GEMINI_API_KEY=your-actual-api-key-here

# For Vertex AI (Option B) - RECOMMENDED:
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1

# 3. Run tests
./test_live_in_docker.sh
```

## Why Vertex AI is Recommended for Docker

Since you already have:
- ✅ Service account JSON file in `.secrets/gcp/`
- ✅ Google Cloud Project configured
- ✅ Docker environment set up

Using Vertex AI authentication means:
- **No additional API keys needed** - uses your existing GCP setup
- **Better security** - service account vs API key
- **Enterprise features** - data residency, compliance, monitoring
- **Consistent with your backend** - same auth as your main application

## Environment Setup Details

### Option A: API Key Setup
```bash
# In your .env file:
GEMINI_API_KEY=your-actual-api-key-from-ai-studio
```

### Option B: Vertex AI Setup (Recommended)
```bash
# In your .env file:
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1  # or your preferred region
```

The service account JSON is automatically mounted from `.secrets/gcp/` in Docker.

## Test Scripts

### 1. `test_live_in_docker.sh` (Recommended)
**Smart Docker-native approach**:
- Automatically detects which authentication method you've configured
- Shows clear setup instructions if authentication is missing
- Runs tests in your existing backend service environment

```bash
./test_live_in_docker.sh
```

### 2. `run_live_tests.sh` 
Advanced test runner with dedicated test container:
```bash
./run_live_tests.sh
```

### 3. Direct Docker Compose
```bash
docker-compose -f docker-compose.yml -f docker-compose.test.yml run --rm test
```

## Test Results

Results are automatically saved to `./test_results/` with timestamps:
```
test_results/
├── gemini_live_test_results_20250529_143022.json
└── gemini_live_test_results_20250529_144512.json
```

Each result file includes which authentication method was used.

## What Gets Tested

The comprehensive test suite validates:

1. **Basic Connection** - WebSocket connection to Gemini Live API
2. **Simple Text Exchange** - Send/receive text messages  
3. **Multi-turn Conversation** - Context retention across turns
4. **System Instructions** - Custom behavior compliance (pirate speak example)
5. **Streaming Responses** - Chunk-based response handling
6. **Error Handling** - Graceful failure recovery

All tests work with both authentication methods.

## Authentication Detection

The test script automatically detects your authentication method:

```bash
# Example output for Vertex AI:
Using Vertex AI authentication with project: my-project, location: us-central1
✅ Vertex AI authentication found

# Example output for API Key:
✅ Gemini Developer API (API Key) authentication found
```

## Troubleshooting

### No Authentication Configured
```bash
❌ No authentication configured
Please configure authentication in your .env file:

Option A: Gemini Developer API
   Uncomment and set: GEMINI_API_KEY=your-actual-api-key

Option B: Vertex AI (Recommended)
   Set: GOOGLE_CLOUD_PROJECT=your-project-id
   Set: GOOGLE_CLOUD_LOCATION=us-central1
```

### API Key Issues
- Verify your API key is valid
- Check that you have Gemini API access enabled
- Ensure no extra quotes or spaces in the .env file

### Vertex AI Issues
- Verify your Google Cloud Project ID is correct
- Ensure your service account has "Vertex AI User" role
- Check that the service account JSON file exists in `.secrets/gcp/`

### Permission Issues
```bash
chmod +x test_live_in_docker.sh validate_test_setup.sh
```

### Docker Issues
```bash
# Start backend service manually
docker-compose up -d backend

# View backend logs
docker-compose logs backend
```

## Validation

Before running tests, validate your setup:
```bash
./validate_test_setup.sh
```

This checks:
- Docker installation and configuration
- Required files and scripts
- Authentication configuration (both methods)
- GCP credentials
- Docker build success
- Python syntax validation

## Switching Between Authentication Methods

You can easily switch between authentication methods by editing your `.env` file:

```bash
# To use API Key - uncomment this line:
# GEMINI_API_KEY=your-api-key

# To use Vertex AI - set these:
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
```

The test script will automatically detect and use whichever method is configured.

## Next Steps

After validating text communication:
1. **Audio Integration** - Add audio streaming tests
2. **Voice Activity Detection** - Test VAD functionality  
3. **Function Calling** - Integrate with your app's functions
4. **WebSocket Proxy** - Test the proxy service at port 8080
5. **Frontend Integration** - Connect with your React frontend

## Advanced Usage

### Running with Specific Authentication
```bash
# Force API Key authentication
GEMINI_API_KEY="your-key" ./test_live_in_docker.sh

# Force Vertex AI authentication  
GOOGLE_CLOUD_PROJECT="your-project" ./test_live_in_docker.sh
```

### Check Authentication Method in Results
The test results JSON includes which authentication method was used:
```json
{
  "auth_method": "vertex_ai",
  "model": "gemini-2.0-flash-live-001",
  "summary": { ... }
}
``` 