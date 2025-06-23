#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to display usage
show_usage() {
    echo -e "${BLUE}🚀 Chat Application Startup Script${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Usage: $0 [MODE] [--model MODEL_NAME]"
    echo ""
    echo "Available modes:"
    echo -e "  ${GREEN}dev${NC}     - Development mode with direct port access"
    echo -e "           Frontend: http://localhost:3000"
    echo -e "           Backend:  http://localhost:8080/api"
    echo -e "           OAuth:    http://localhost:5556/dex"
    echo ""
    echo -e "  ${GREEN}proxy${NC}   - Nginx reverse proxy mode (local)"
    echo -e "           App:      http://auth.localhost"
    echo -e "           Alt:      http://localhost"
    echo ""
    echo -e "  ${GREEN}ngrok${NC}   - Public access with ngrok tunnel"
    echo -e "           App:      https://civil-entirely-rooster.ngrok-free.app"
    echo -e "           Note:     Requires ngrok to be running separately"
    echo ""
    echo "Options:"
    echo -e "  --model MODEL   Override the chat model (e.g., gemini-1.5-flash-latest) for this run"
    echo ""
    echo "Examples:"
    echo "  $0 dev        # Start in development mode"
    echo "  $0 proxy      # Start with nginx proxy"
    echo "  $0 ngrok      # Start for public access"
    echo ""
}

# Function to check if ports are available
check_ports() {
    local ports=("$@")
    for port in "${ports[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            echo -e "${RED}❌ Port $port is already in use.${NC}"
            echo -e "   To free it: ${YELLOW}lsof -ti:$port | xargs kill -9${NC}"
            return 1
        fi
    done
    return 0
}

# Function to stop existing services
stop_services() {
    echo -e "${YELLOW}🛑 Stopping any existing services...${NC}"
    docker-compose down >/dev/null 2>&1 || true
    docker-compose --profile dev down >/dev/null 2>&1 || true
    docker-compose --profile proxy down >/dev/null 2>&1 || true
}

# Function to start development mode
start_dev() {
    echo -e "${BLUE}🚀 Starting Development Mode (Direct Port Access)${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Check required ports
    echo -e "${YELLOW}🔍 Checking port availability...${NC}"
    if ! check_ports 3000 8080 5432 5556; then
        exit 1
    fi
    echo -e "${GREEN}✅ All ports available${NC}"
    
    # Start services
    echo -e "${YELLOW}🐳 Starting services...${NC}"
    docker-compose --profile dev -f docker-compose.yml -f docker-compose.dev.yml up --build
}

# Function to start proxy mode
start_proxy() {
    echo -e "${BLUE}🌐 Starting Proxy Mode (Nginx Reverse Proxy)${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Check required port
    echo -e "${YELLOW}🔍 Checking port 80 availability...${NC}"
    if ! check_ports 80; then
        echo -e "${RED}💡 Tip: You may need sudo to free port 80${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Port 80 available${NC}"
    
    # Start services
    echo -e "${YELLOW}🐳 Starting services...${NC}"
    docker-compose --profile proxy -f docker-compose.yml -f docker-compose.proxy.yml up --build -d
    
    echo ""
    echo -e "${GREEN}🎉 Proxy mode started successfully!${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🌍 App:       http://auth.localhost${NC}"
    echo -e "${GREEN}🔧 Alt URL:   http://localhost${NC}"
    echo ""
    echo -e "${YELLOW}📊 View logs: docker-compose logs -f${NC}"
    echo -e "${YELLOW}🛑 Stop:      docker-compose --profile proxy down${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Function to start ngrok mode
start_ngrok() {
    echo -e "${BLUE}🌍 Starting Ngrok Mode (Public Access)${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Check if ngrok is running
    if ! pgrep -f "ngrok.*80.*civil-entirely-rooster" >/dev/null; then
        echo -e "${RED}❌ ngrok is not running on port 80 with the reserved domain${NC}"
        echo -e "${YELLOW}💡 Please start ngrok first:${NC}"
        echo -e "   ${GREEN}ngrok http 80 --domain=civil-entirely-rooster.ngrok-free.app${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ ngrok tunnel detected${NC}"
    
    # Check required port
    echo -e "${YELLOW}🔍 Checking port 80 availability...${NC}"
    if ! check_ports 80; then
        exit 1
    fi
    echo -e "${GREEN}✅ Port 80 available${NC}"
    
    # Start services
    echo -e "${YELLOW}🐳 Starting services...${NC}"
    docker-compose --profile proxy -f docker-compose.yml -f docker-compose.ngrok.yml up --build -d
    
    echo ""
    echo -e "${GREEN}🎉 Ngrok mode started successfully!${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🌍 Public URL: https://civil-entirely-rooster.ngrok-free.app${NC}"
    echo -e "${GREEN}🏠 Local URL:  http://localhost${NC}"
    echo ""
    echo -e "${YELLOW}📊 View logs: docker-compose logs -f${NC}"
    echo -e "${YELLOW}🛑 Stop:      docker-compose --profile proxy down${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# -----------------------------------------------------------------------------
# Parse CLI arguments: MODE (dev|proxy|ngrok) and optional --model <model-name>
# -----------------------------------------------------------------------------

MODE="proxy"   # default
MODEL_OVERRIDE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        dev|proxy|ngrok)
            MODE="$1";
            shift ;;
        --model)
            MODEL_OVERRIDE="$2";
            shift 2 ;;
        -h|--help|help)
            show_usage; exit 0 ;;
        *)
            echo -e "${RED}❌ Unknown option or mode: $1${NC}"; show_usage; exit 1 ;;
    esac
done

echo -e "${BLUE}📦 Launch mode: ${GREEN}$MODE${NC}"

# If a model override was provided, patch .env so the backend sees it.
if [ -n "$MODEL_OVERRIDE" ]; then
    echo -e "${YELLOW}🧠 Overriding Gemini model -> $MODEL_OVERRIDE${NC}"
    # Ensure GEMINI_DEFAULT_MODEL line is present/updated in .env
    if grep -q "^GEMINI_DEFAULT_MODEL=" .env 2>/dev/null; then
        sed -i '' "s/^GEMINI_DEFAULT_MODEL=.*/GEMINI_DEFAULT_MODEL=$MODEL_OVERRIDE/" .env || true
    else
        echo "GEMINI_DEFAULT_MODEL=$MODEL_OVERRIDE" >> .env
    fi
fi

# Stop any existing services first
stop_services

case $MODE in
    "dev")
        start_dev
        ;;
    "proxy")
        start_proxy
        ;;
    "ngrok")
        start_ngrok
        ;;
    "-h"|"--help"|"help")
        show_usage
        ;;
    *)
        echo -e "${RED}❌ Unknown mode: $MODE${NC}"
        echo ""
        show_usage
        exit 1
        ;;
esac 