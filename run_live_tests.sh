#!/bin/bash

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Gemini Live API Test Runner for Docker${NC}"
echo "=========================================="

# Function to check if services are running
check_services() {
    echo -e "\n${YELLOW}Checking Docker services...${NC}"
    
    if ! docker-compose ps | grep -q "backend.*Up"; then
        echo -e "${RED}❌ Backend service is not running${NC}"
        echo -e "${YELLOW}Starting services...${NC}"
        docker-compose up -d backend db
        sleep 5  # Wait for services to start
    else
        echo -e "${GREEN}✅ Backend service is running${NC}"
    fi
}

# Function to run tests
run_tests() {
    echo -e "\n${BLUE}Running Gemini Live Text Communication Tests${NC}"
    echo "============================================"

    # Create test results directory
    mkdir -p test_results

    # Build the test container if needed
    echo -e "${YELLOW}Building test container...${NC}"
    docker-compose -f docker-compose.yml -f docker-compose.test.yml build test

    # Run the tests
    echo -e "${YELLOW}Executing tests...${NC}"
    docker-compose -f docker-compose.yml -f docker-compose.test.yml run \
        --rm \
        -e GEMINI_API_KEY="$GEMINI_API_KEY" \
        test

    # Copy results out of container
    echo -e "\n${YELLOW}Test results saved to: ./test_results/${NC}"
}

# Main script
main() {
    # Check for API key
    if [ -z "$GEMINI_API_KEY" ]; then
        echo -e "${RED}❌ Error: GEMINI_API_KEY environment variable is not set${NC}"
        echo "Please set it before running tests:"
        echo "  export GEMINI_API_KEY='your-api-key-here'"
        exit 1
    fi

    # Check if docker-compose is installed
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}❌ Error: docker-compose is not installed${NC}"
        exit 1
    fi

    # Parse command line arguments
    case "${1:-}" in
        --no-check)
            echo -e "${YELLOW}Skipping service check...${NC}"
            ;;
        *)
            check_services
            ;;
    esac

    # Run the tests
    run_tests

    echo -e "\n${GREEN}✅ Test run completed!${NC}"
}

# Run main function
main "$@" 