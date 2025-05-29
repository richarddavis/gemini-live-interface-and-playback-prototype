#!/bin/bash

# Comprehensive Live API Test Runner
# ==================================
# 
# Runs all Live API tests needed for camera and microphone streaming
# including advanced features like VAD, function calling, etc.

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

print_header() {
    echo
    print_status $PURPLE "========================================"
    print_status $PURPLE "$1"
    print_status $PURPLE "========================================"
    echo
}

print_header "COMPREHENSIVE LIVE API TEST SUITE"

print_status $BLUE "This test suite validates ALL Live API capabilities needed for:"
print_status $BLUE "📷 Camera streaming"
print_status $BLUE "🎤 Microphone streaming" 
print_status $BLUE "🎭 Voice Activity Detection"
print_status $BLUE "🛠️ Function calling integration"
print_status $BLUE "🔧 System instructions"
print_status $BLUE "⚡ Real-time interruption handling"
echo

# Check if we should run in Docker or locally
if [[ "$1" == "--docker" ]]; then
    print_status $YELLOW "Running tests in Docker environment..."
    
    # Build and run in Docker
    print_status $BLUE "Building Docker image..."
    docker-compose -f docker-compose.test.yml build backend
    
    print_status $BLUE "Running comprehensive tests..."
    docker-compose -f docker-compose.test.yml run --rm backend python test_comprehensive_live_api.py
    
elif [[ "$1" == "--local" ]]; then
    print_status $YELLOW "Running tests locally..."
    
    # Check if environment is set up
    if [[ -z "$GOOGLE_APPLICATION_CREDENTIALS" ]]; then
        print_status $RED "ERROR: GOOGLE_APPLICATION_CREDENTIALS not set"
        print_status $YELLOW "Run: export GOOGLE_APPLICATION_CREDENTIALS=.secrets/gcp/generative-fashion-355408-new-key.json"
        exit 1
    fi
    
    # Set required environment variables
    export GOOGLE_CLOUD_PROJECT=generative-fashion-355408
    export GOOGLE_CLOUD_LOCATION=us-central1
    export GOOGLE_GENAI_USE_VERTEXAI=True
    
    # Run tests locally
    python3 test_comprehensive_live_api.py
    
else
    print_status $YELLOW "Usage:"
    print_status $BLUE "  $0 --docker    # Run in Docker (recommended)"
    print_status $BLUE "  $0 --local     # Run locally"
    echo
    print_status $YELLOW "Example:"
    print_status $GREEN "  $0 --docker"
    echo
    exit 1
fi

echo
if [[ $? -eq 0 ]]; then
    print_status $GREEN "✅ Comprehensive tests completed successfully!"
    print_status $GREEN "Check test_results/ for detailed results"
else
    print_status $RED "❌ Some tests failed. Check output above for details."
    exit 1
fi 