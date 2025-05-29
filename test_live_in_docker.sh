#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Running Gemini Live Tests in Docker Environment${NC}"
echo "=================================================="

# Check authentication setup
check_authentication() {
    local has_api_key=false
    local has_vertex_ai=false
    
    # Check for .env file and its contents
    if [ -f ".env" ]; then
        if grep -q "^GEMINI_API_KEY=" .env && ! grep -q "^GEMINI_API_KEY=your-" .env; then
            has_api_key=true
        fi
        if grep -q "^GOOGLE_CLOUD_PROJECT=" .env && ! grep -q "^GOOGLE_CLOUD_PROJECT=your-" .env; then
            has_vertex_ai=true
        fi
    fi
    
    # Check environment variables
    if [ ! -z "$GEMINI_API_KEY" ]; then
        has_api_key=true
    fi
    if [ ! -z "$GOOGLE_CLOUD_PROJECT" ]; then
        has_vertex_ai=true
    fi
    
    if [ "$has_api_key" = true ]; then
        echo -e "${GREEN}✅ Gemini Developer API (API Key) authentication found${NC}"
        return 0
    elif [ "$has_vertex_ai" = true ]; then
        echo -e "${GREEN}✅ Vertex AI authentication found${NC}"
        return 0
    else
        echo -e "${RED}❌ No authentication configured${NC}"
        return 1
    fi
}

# Check if authentication is properly configured
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found${NC}"
    echo "Please create a .env file with your authentication credentials:"
    echo ""
    echo "1. Copy the example: cp .env.example .env"
    echo "2. Edit .env and choose ONE of these options:"
    echo ""
    echo -e "${BLUE}Option A: Gemini Developer API (API Key)${NC}"
    echo "   GEMINI_API_KEY=your-actual-api-key-here"
    echo ""
    echo -e "${BLUE}Option B: Vertex AI (Service Account - RECOMMENDED)${NC}"
    echo "   GOOGLE_CLOUD_PROJECT=your-project-id"
    echo "   GOOGLE_CLOUD_LOCATION=us-central1"
    echo ""
    exit 1
fi

# Validate authentication
if ! check_authentication; then
    echo ""
    echo "Please configure authentication in your .env file:"
    echo ""
    echo -e "${BLUE}Option A: Gemini Developer API${NC}"
    echo "   Uncomment and set: GEMINI_API_KEY=your-actual-api-key"
    echo ""
    echo -e "${BLUE}Option B: Vertex AI (Recommended)${NC}"
    echo "   Set: GOOGLE_CLOUD_PROJECT=your-project-id"
    echo "   Set: GOOGLE_CLOUD_LOCATION=us-central1"
    echo ""
    exit 1
fi

# Create test results directory
mkdir -p test_results

# Run tests in existing backend service
echo -e "\n${BLUE}Running tests in backend service${NC}"
echo -e "${YELLOW}Starting backend service if not running...${NC}"

# Start backend service (will also start db due to dependencies)
docker-compose up -d backend

# Wait a moment for service to be ready
sleep 3

# Run the test in the backend container
echo -e "${YELLOW}Executing tests in backend container...${NC}"
docker-compose exec backend python test_live_text_communication.py

echo -e "\n${GREEN}✅ Tests completed!${NC}"
echo -e "${BLUE}Check test_results/ directory for detailed results${NC}" 