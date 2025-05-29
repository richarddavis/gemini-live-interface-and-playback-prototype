#!/bin/bash

echo "🧪 Running Gemini Live Text Communication Tests in Docker"
echo "========================================================"

# Check if GEMINI_API_KEY is set
if [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ Error: GEMINI_API_KEY environment variable is not set"
    echo "Please set it before running tests:"
    echo "  export GEMINI_API_KEY='your-api-key-here'"
    exit 1
fi

# Copy test script to backend directory if not already there
if [ ! -f "./backend/test_live_text_communication.py" ]; then
    echo "📋 Copying test script to backend directory..."
    cp test_live_text_communication.py ./backend/
fi

# Run tests inside the backend container
echo "🐳 Executing tests in Docker container..."
docker-compose run --rm \
    -e GEMINI_API_KEY="$GEMINI_API_KEY" \
    backend \
    python test_live_text_communication.py

# Check exit code
if [ $? -eq 0 ]; then
    echo "✅ Tests completed successfully!"
else
    echo "❌ Tests failed!"
    exit 1
fi 