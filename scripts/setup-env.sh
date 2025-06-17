#!/bin/bash
# Auto-configure .env based on current git branch
# Usage: ./scripts/setup-env.sh [branch-name]

set -e

# Change to project root directory (parent of scripts)
cd "$(dirname "$0")/.."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get current branch if not provided as argument
BRANCH=${1:-$(git branch --show-current)}

echo -e "${BLUE}🔧 Environment Setup for Branch: ${GREEN}$BRANCH${NC}"

# Backup existing .env if it exists
if [ -f ".env" ]; then
    echo -e "${YELLOW}📦 Backing up existing .env to .env.backup${NC}"
    cp .env .env.backup
fi

# Determine which template to use based on branch
case "$BRANCH" in
    main)
        TEMPLATE=".env.main"
        echo -e "${GREEN}📝 Using localhost configuration (main branch)${NC}"
        ;;
    *nginx* | *proxy*)
        TEMPLATE=".env.nginx"
        echo -e "${GREEN}📝 Using nginx proxy configuration${NC}"
        ;;
    *network* | *accessible*)
        TEMPLATE=".env.network"
        echo -e "${GREEN}📝 Using network-accessible configuration${NC}"
        ;;
    *)
        # Default to main branch template
        TEMPLATE=".env.main"
        echo -e "${YELLOW}⚠️  Unknown branch, defaulting to localhost configuration${NC}"
        ;;
esac

# Copy the appropriate template
if [ -f "$TEMPLATE" ]; then
    cp "$TEMPLATE" .env
    echo -e "${GREEN}✅ Environment configured from $TEMPLATE${NC}"
else
    echo -e "${RED}❌ Template $TEMPLATE not found!${NC}"
    exit 1
fi

# Check if this is the network branch and needs IP replacement
if [[ "$TEMPLATE" == ".env.network" ]]; then
    echo -e "${YELLOW}🌐 Network branch detected - you may need to update YOUR_LOCAL_IP${NC}"
    
    # Try to auto-detect local IP
    LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
    if [ ! -z "$LOCAL_IP" ]; then
        echo -e "${BLUE}💡 Detected local IP: $LOCAL_IP${NC}"
        read -p "Replace YOUR_LOCAL_IP with $LOCAL_IP? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sed -i '' "s/YOUR_LOCAL_IP/$LOCAL_IP/g" .env
            echo -e "${GREEN}✅ Updated .env with local IP: $LOCAL_IP${NC}"
        fi
    fi
fi

# Load secrets if .secrets file exists
if [ -f ".secrets" ]; then
    echo -e "${BLUE}🔐 Loading secrets from .secrets file${NC}"
    
    # Read environment variables and replace placeholders in .env
    while IFS='=' read -r key value || [[ -n "$key" ]]; do
        # Skip comments and empty lines
        if [[ $key =~ ^[[:space:]]*# ]] || [[ -z "$key" ]]; then
            continue
        fi
        
        # Remove any whitespace
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)
        
        # Skip if value is still a placeholder
        if [[ "$value" == *"your_actual_"* ]] || [[ "$value" == *"your_"* ]]; then
            continue
        fi
        
        # Replace in .env file
        if grep -q "^${key}=" .env; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                # macOS
                sed -i '' "s|^${key}=.*|${key}=${value}|" .env
            else
                # Linux
                sed -i "s|^${key}=.*|${key}=${value}|" .env
            fi
            echo -e "${GREEN}  ✅ Updated ${key}${NC}"
        fi
    done < .secrets
    
else
    echo -e "${YELLOW}💡 Create .secrets file for automatic secret loading${NC}"
fi

# Check for GCP key file
if [ -f ".gcp-key.json" ]; then
    echo -e "${GREEN}  ✅ GCP service account key found (.gcp-key.json)${NC}"
else
    echo -e "${YELLOW}💡 GCP service account key not found - ensure .gcp-key.json exists${NC}"
fi

echo -e "${BLUE}📋 Next steps:${NC}"
if [ -f ".secrets" ]; then
    echo "1. Update .secrets with your actual API keys (edit the 'your_actual_*' values)"
    echo "2. Re-run this script to load secrets: ./scripts/setup-env.sh"
    echo "3. Start your services: docker-compose up"
else
    echo "1. Create .secrets file with your API keys and GCP JSON"
    echo "2. Or manually update .env placeholder values"
    echo "3. Start your services: docker-compose up"
fi
echo -e "${YELLOW}💡 Tip: Add this to your git hooks or aliases for automatic setup!${NC}" 