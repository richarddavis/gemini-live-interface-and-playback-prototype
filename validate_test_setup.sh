#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Validating Gemini Live Test Harness Setup${NC}"
echo "============================================="

# Track validation results
ISSUES=0

# Function to check file
check_file() {
    local file=$1
    local desc=$2
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $desc exists${NC}"
        return 0
    else
        echo -e "${RED}❌ $desc missing: $file${NC}"
        ISSUES=$((ISSUES + 1))
        return 1
    fi
}

# Function to check executable
check_executable() {
    local file=$1
    local desc=$2
    if [ -f "$file" ] && [ -x "$file" ]; then
        echo -e "${GREEN}✅ $desc is executable${NC}"
        return 0
    else
        echo -e "${RED}❌ $desc is not executable: $file${NC}"
        ISSUES=$((ISSUES + 1))
        return 1
    fi
}

# Function to check command
check_command() {
    local cmd=$1
    local desc=$2
    if command -v $cmd &> /dev/null; then
        echo -e "${GREEN}✅ $desc is installed${NC}"
        return 0
    else
        echo -e "${RED}❌ $desc is not installed${NC}"
        ISSUES=$((ISSUES + 1))
        return 1
    fi
}

echo -e "\n${YELLOW}1. Checking required commands...${NC}"
check_command "docker" "Docker"
check_command "docker-compose" "Docker Compose"
check_command "python3" "Python 3"

echo -e "\n${YELLOW}2. Checking test files...${NC}"
check_file "test_live_text_communication.py" "Main test script"
check_file "docker-compose.yml" "Docker Compose configuration"
check_file "docker-compose.test.yml" "Docker Compose test configuration"
check_file "backend/Dockerfile" "Backend Dockerfile"

echo -e "\n${YELLOW}3. Checking test runner scripts...${NC}"
check_executable "run_live_tests.sh" "Main test runner"
check_executable "test_live_docker.sh" "Simple test runner"
check_executable "start_docker_live.sh" "Docker startup script"

echo -e "\n${YELLOW}4. Checking Docker setup...${NC}"
# Check if backend Dockerfile has test dependencies
if grep -q "google-genai" backend/Dockerfile && grep -q "colorama" backend/Dockerfile; then
    echo -e "${GREEN}✅ Backend Dockerfile has test dependencies${NC}"
else
    echo -e "${RED}❌ Backend Dockerfile missing test dependencies (google-genai, colorama)${NC}"
    ISSUES=$((ISSUES + 1))
fi

# Check if test results directory can be created
if mkdir -p test_results 2>/dev/null; then
    echo -e "${GREEN}✅ Test results directory can be created${NC}"
else
    echo -e "${RED}❌ Cannot create test results directory${NC}"
    ISSUES=$((ISSUES + 1))
fi

echo -e "\n${YELLOW}5. Checking environment configuration...${NC}"
# Check for authentication methods (both API key and Vertex AI)
has_api_key=false
has_vertex_ai=false

# Check for .env file approach (preferred for Docker)
if [ -f ".env" ]; then
    echo -e "${GREEN}✅ .env file found${NC}"
    
    # Check for API key
    if grep -q "^GEMINI_API_KEY=" .env && ! grep -q "^GEMINI_API_KEY=your-" .env; then
        echo -e "${GREEN}✅ Gemini Developer API (API Key) configured in .env${NC}"
        has_api_key=true
    fi
    
    # Check for Vertex AI
    if grep -q "^GOOGLE_CLOUD_PROJECT=" .env && ! grep -q "^GOOGLE_CLOUD_PROJECT=your-" .env; then
        echo -e "${GREEN}✅ Vertex AI (Service Account) configured in .env${NC}"
        has_vertex_ai=true
    fi
    
    # If neither found in .env, show what's needed
    if [ "$has_api_key" = false ] && [ "$has_vertex_ai" = false ]; then
        echo -e "${YELLOW}⚠️  No authentication configured in .env file${NC}"
        echo "   Please configure ONE of these options in .env:"
        echo "   Option A: GEMINI_API_KEY=your-actual-api-key"
        echo "   Option B: GOOGLE_CLOUD_PROJECT=your-project-id"
    fi
    
elif [ -f ".env.example" ]; then
    echo -e "${YELLOW}⚠️  .env file not found, but .env.example exists${NC}"
    echo "   Copy .env.example to .env and configure authentication"
    echo "   Run: cp .env.example .env"
else
    echo -e "${RED}❌ No .env or .env.example file found${NC}"
    ISSUES=$((ISSUES + 1))
fi

# Also check if manual environment variables are set (alternative approach)
if [ ! -z "$GEMINI_API_KEY" ]; then
    echo -e "${GREEN}✅ GEMINI_API_KEY also set in current environment${NC}"
    has_api_key=true
fi

if [ ! -z "$GOOGLE_CLOUD_PROJECT" ]; then
    echo -e "${GREEN}✅ GOOGLE_CLOUD_PROJECT set in current environment${NC}"
    has_vertex_ai=true
fi

# Final authentication check
if [ "$has_api_key" = false ] && [ "$has_vertex_ai" = false ]; then
    echo -e "${RED}❌ No authentication method properly configured${NC}"
    ISSUES=$((ISSUES + 1))
fi

# Check GCP credentials
if [ -f "./.secrets/gcp/generative-fashion-355408-d2acee530882.json" ]; then
    echo -e "${GREEN}✅ GCP service account key found${NC}"
else
    echo -e "${RED}❌ GCP service account key not found at expected path${NC}"
    echo "   Expected: ./.secrets/gcp/generative-fashion-355408-d2acee530882.json"
    ISSUES=$((ISSUES + 1))
fi

echo -e "\n${YELLOW}6. Testing Docker build...${NC}"
# Try to build the test service
if docker-compose -f docker-compose.yml -f docker-compose.test.yml build test &>/dev/null; then
    echo -e "${GREEN}✅ Test container builds successfully${NC}"
else
    echo -e "${RED}❌ Test container build failed${NC}"
    echo "   Run 'docker-compose -f docker-compose.yml -f docker-compose.test.yml build test' to see errors"
    ISSUES=$((ISSUES + 1))
fi

echo -e "\n${YELLOW}7. Checking Python test script syntax...${NC}"
if python3 -m py_compile test_live_text_communication.py 2>/dev/null; then
    echo -e "${GREEN}✅ Test script has valid Python syntax${NC}"
    rm -f __pycache__/test_live_text_communication.cpython-*.pyc
else
    echo -e "${RED}❌ Test script has syntax errors${NC}"
    ISSUES=$((ISSUES + 1))
fi

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Validation Summary${NC}"
echo -e "${BLUE}========================================${NC}"

if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! The test harness is properly set up.${NC}"
    echo -e "\nTo run the actual tests:"
    echo -e "1. Set your API key: export GEMINI_API_KEY='your-api-key'"
    echo -e "2. Run tests: ./run_live_tests.sh"
else
    echo -e "${RED}❌ Found $ISSUES issues that need to be fixed.${NC}"
    echo -e "\nPlease fix the issues above before running tests."
fi

exit $ISSUES 