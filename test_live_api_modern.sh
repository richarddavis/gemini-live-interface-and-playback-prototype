#!/bin/bash

# Modern Gemini Live API Test Runner
# ===================================
# 
# This script runs Live API tests using the official google-genai SDK
# and proper Vertex AI authentication with the correct model names.
#
# Requirements:
# - Docker and docker-compose
# - Service account JSON in .secrets/gcp/
# - Project ID: generative-fashion-355408

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
    print_status $PURPLE "======================================"
    print_status $PURPLE "$1"
    print_status $PURPLE "======================================"
    echo
}

print_success() {
    print_status $GREEN "✓ $1"
}

print_error() {
    print_status $RED "✗ $1"
}

print_warning() {
    print_status $YELLOW "⚠ $1"
}

print_info() {
    print_status $BLUE "ℹ $1"
}

# Function to check dependencies
check_dependencies() {
    print_header "Checking Dependencies"
    
    # Check Docker
    if command -v docker &> /dev/null; then
        print_success "Docker is installed"
        docker --version
    else
        print_error "Docker is not installed"
        return 1
    fi
    
    # Check docker-compose
    if command -v docker-compose &> /dev/null; then
        print_success "docker-compose is installed"
        docker-compose --version
    else
        print_error "docker-compose is not installed"
        return 1
    fi
    
    # Check service account file
    SERVICE_ACCOUNT_FILE=".secrets/gcp/generative-fashion-355408-d2acee530882.json"
    if [[ -f "$SERVICE_ACCOUNT_FILE" ]]; then
        print_success "Service account file found"
    else
        print_error "Service account file not found at: $SERVICE_ACCOUNT_FILE"
        return 1
    fi
    
    # Check .env file
    if [[ -f ".env" ]]; then
        print_success ".env file found"
    else
        print_warning ".env file not found, will use environment defaults"
    fi
    
    return 0
}

# Function to show test information
show_test_info() {
    print_header "Modern Live API Test Configuration"
    
    print_info "Test Framework: Modern Gemini Live API (2025)"
    print_info "SDK: google-genai (v1.0+)"
    print_info "Model: gemini-2.0-flash-live-preview-04-09"
    print_info "Authentication: Vertex AI Service Account"
    print_info "Project ID: generative-fashion-355408"
    print_info "Location: global"
    echo
    print_info "Tests to run:"
    print_info "  1. Text Communication (WebSocket Live API)"
    print_info "  2. Audio Communication (Text-to-Speech)"
    print_info "  3. Conversation Memory (Multi-turn)"
    echo
}

# Function to build and run tests
run_tests() {
    print_header "Building and Running Live API Tests"
    
    # Build the backend service with updated dependencies
    print_info "Building backend service with google-genai SDK..."
    if docker-compose -f docker-compose.test.yml build backend; then
        print_success "Backend service built successfully"
    else
        print_error "Failed to build backend service"
        return 1
    fi
    
    # Run the modern Live API tests
    print_info "Running Modern Live API tests..."
    if docker-compose -f docker-compose.test.yml run --rm backend python test_modern_gemini_live.py; then
        print_success "Live API tests completed successfully"
    else
        print_error "Live API tests failed"
        return 1
    fi
    
    return 0
}

# Function to show results
show_results() {
    print_header "Test Results"
    
    # Check if results directory exists
    if [[ -d "test_results" ]]; then
        print_info "Results directory: test_results/"
        
        # Find the most recent results file
        LATEST_RESULT=$(find test_results -name "modern_live_api_results_*.json" -type f -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)
        
        if [[ -n "$LATEST_RESULT" && -f "$LATEST_RESULT" ]]; then
            print_success "Latest results: $LATEST_RESULT"
            
            # Show summary if jq is available
            if command -v jq &> /dev/null; then
                echo
                print_info "Test Summary:"
                jq -r '.results | to_entries[] | "\(.key): \(.value.status // "unknown")"' "$LATEST_RESULT" | while read line; do
                    if [[ "$line" == *"success"* ]]; then
                        print_success "$line"
                    else
                        print_error "$line"
                    fi
                done
            else
                print_warning "Install 'jq' to see formatted results summary"
            fi
        else
            print_warning "No results files found"
        fi
    else
        print_warning "No test_results directory found"
    fi
}

# Function to run validation
run_validation() {
    print_header "Running Pre-Test Validation"
    
    print_info "Validating authentication setup..."
    if docker-compose -f docker-compose.test.yml run --rm backend python validate_test_setup.sh; then
        print_success "Validation passed"
        return 0
    else
        print_warning "Validation failed, but continuing with tests"
        return 0  # Don't fail here, just warn
    fi
}

# Function to cleanup
cleanup() {
    print_header "Cleanup"
    
    print_info "Stopping any running containers..."
    docker-compose -f docker-compose.test.yml down
    
    print_info "Pruning unused Docker images..."
    docker image prune -f
    
    print_success "Cleanup completed"
}

# Main execution
main() {
    print_header "Modern Gemini Live API Test Runner"
    print_info "Starting comprehensive Live API testing with google-genai SDK"
    
    # Check if help was requested
    if [[ "$1" == "--help" || "$1" == "-h" ]]; then
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --validate     Run validation only"
        echo "  --cleanup      Run cleanup only"
        echo "  --info         Show test configuration only"
        echo
        echo "This script tests the modern Gemini Live API using:"
        echo "  - google-genai SDK (v1.0+)"
        echo "  - Vertex AI authentication"
        echo "  - Model: gemini-2.0-flash-live-preview-04-09"
        echo
        return 0
    fi
    
    # Handle specific options
    if [[ "$1" == "--validate" ]]; then
        check_dependencies && run_validation
        return $?
    fi
    
    if [[ "$1" == "--cleanup" ]]; then
        cleanup
        return $?
    fi
    
    if [[ "$1" == "--info" ]]; then
        show_test_info
        return $?
    fi
    
    # Run full test suite
    if ! check_dependencies; then
        print_error "Dependency check failed"
        exit 1
    fi
    
    show_test_info
    
    if ! run_validation; then
        print_warning "Validation had issues, but continuing..."
    fi
    
    if ! run_tests; then
        print_error "Tests failed"
        show_results
        exit 1
    fi
    
    show_results
    
    print_header "All Tests Complete!"
    print_success "Modern Gemini Live API tests completed successfully"
    print_info "Check test_results/ directory for detailed results"
    
    # Optional cleanup
    read -p "$(echo -e ${YELLOW}⚠ Run cleanup? [y/N]: ${NC})" -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cleanup
    fi
}

# Run main function with all arguments
main "$@" 