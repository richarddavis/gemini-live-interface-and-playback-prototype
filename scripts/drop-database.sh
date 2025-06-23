#!/bin/bash
set -e

# Always operate from project root
cd "$(dirname "$0")/.."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🗄️  Database Drop Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}⚠️  This will completely remove the PostgreSQL database${NC}"
echo -e "${YELLOW}⚠️  All data will be lost and the database will be rebuilt fresh${NC}"
echo ""

# Ask for confirmation
read -p "Are you sure you want to drop the database? (yes/no): " -r
echo
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo -e "${RED}❌ Operation cancelled${NC}"
    exit 1
fi

echo -e "${YELLOW}🛑 Stopping all services...${NC}"
docker-compose --profile dev down >/dev/null 2>&1 || true
docker-compose --profile proxy down >/dev/null 2>&1 || true  
docker-compose down >/dev/null 2>&1 || true

echo -e "${YELLOW}🗑️  Removing PostgreSQL data volume...${NC}"
docker volume rm webapp_starter_cursor_postgres_data >/dev/null 2>&1 || true

echo -e "${GREEN}✅ Database dropped successfully!${NC}"
echo ""
echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "  1. Run ${GREEN}scripts/start-app.sh${NC} to start the application"
echo -e "  2. The database will be automatically recreated with migrations"
echo -e "  3. All tables will be fresh and empty"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" 