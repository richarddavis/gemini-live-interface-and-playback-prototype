#!/bin/bash
# Quick environment status check
# Usage: ./scripts/check-env.sh

# Change to project root directory (parent of scripts)
cd "$(dirname "$0")/.."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Get current branch
BRANCH=$(git branch --show-current)

echo -e "${BLUE}📊 Environment Status Check${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Current branch
echo -e "${YELLOW}Current branch:${NC} $BRANCH"

# Check if .env exists
if [ -f ".env" ]; then
    echo -e "${GREEN}✅ .env file exists${NC}"
    
    # Show first few lines (config info)
    echo -e "${YELLOW}Configuration:${NC}"
    head -3 .env | sed 's/^/  /'
    
    # Check key URLs
    API_URL=$(grep "^REACT_APP_API_URL=" .env | cut -d'=' -f2)
    OAUTH_URL=$(grep "^REACT_APP_OAUTH_ISSUER=" .env | cut -d'=' -f2)
    
    echo -e "${YELLOW}Frontend URLs:${NC}"
    echo -e "  API: ${API_URL}"
    echo -e "  OAuth: ${OAUTH_URL}"
    
    # Detect configuration type
    if [[ "$API_URL" == *"localhost:8080"* ]]; then
        echo -e "${GREEN}📝 Type: Localhost (main branch)${NC}"
    elif [[ "$API_URL" == "http://auth.localhost/api" ]]; then
        echo -e "${GREEN}📝 Type: Nginx proxy${NC}"
    elif [[ "$API_URL" == *"YOUR_LOCAL_IP"* ]]; then
        echo -e "${RED}⚠️  Type: Network (needs IP configuration)${NC}"
    else
        echo -e "${YELLOW}📝 Type: Custom/Network${NC}"
    fi
    
    # Check for placeholder values
    if grep -q "your_key_here\|your_bucket_name\|YOUR_LOCAL_IP" .env; then
        echo -e "${RED}⚠️  Placeholder values detected - update with real values${NC}"
    else
        echo -e "${GREEN}✅ No obvious placeholder values${NC}"
    fi
    
else
    echo -e "${RED}❌ .env file missing${NC}"
    echo -e "${YELLOW}💡 Run: ./scripts/setup-env.sh${NC}"
fi

# Check for available templates
echo -e "\n${YELLOW}Available templates:${NC}"
for template in .env.main .env.nginx .env.network; do
    if [ -f "$template" ]; then
        echo -e "  ${GREEN}✅ $template${NC}"
    else
        echo -e "  ${RED}❌ $template${NC}"
    fi
done

# Check secrets file
echo -e "\n${YELLOW}Secrets Management:${NC}"
if [ -f ".secrets" ]; then
    echo -e "  ${GREEN}✅ .secrets file exists${NC}"
    
    # Check if secrets have placeholder values (ignore commented lines)
    if grep -v "^#" .secrets | grep -q "your_actual_\|your_" 2>/dev/null; then
        echo -e "  ${YELLOW}⚠️  Some secrets still have placeholder values${NC}"
    else
        echo -e "  ${GREEN}✅ All secrets appear to be configured${NC}"
    fi
    
    # Check if GCP key file exists
    if [ -f ".gcp-key.json" ]; then
        echo -e "  ${GREEN}✅ GCP service account key (.gcp-key.json) exists${NC}"
    else
        echo -e "  ${YELLOW}⚠️  GCP service account key (.gcp-key.json) not found${NC}"
    fi
else
    echo -e "  ${RED}❌ .secrets file missing${NC}"
    echo -e "  ${YELLOW}💡 Create .secrets file for automatic secret loading${NC}"
fi

# Suggest actions
echo -e "\n${BLUE}💡 Quick Actions:${NC}"
echo "  ./scripts/setup-env.sh       # Auto-configure for current branch"
echo "  ./scripts/setup-env.sh nginx # Use nginx configuration"
if [ -f ".secrets" ]; then
    echo "  nano .secrets                # Edit secrets file"
fi
echo "  docker-compose up            # Start services" 