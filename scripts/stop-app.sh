#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 Stopping Chat Application...${NC}"

# Stop all possible configurations
docker-compose down 2>/dev/null || true
docker-compose --profile dev down 2>/dev/null || true
docker-compose --profile proxy down 2>/dev/null || true

echo -e "${GREEN}✅ All services stopped${NC}"

# Show any remaining containers
RUNNING=$(docker ps --filter "name=webapp_starter_cursor" --format "table {{.Names}}\t{{.Status}}" | tail -n +2)
if [ -n "$RUNNING" ]; then
    echo -e "${RED}⚠️  Some containers may still be running:${NC}"
    echo "$RUNNING"
    echo -e "${YELLOW}Run 'docker ps' to check or 'docker stop \$(docker ps -q)' to force stop all${NC}"
fi 