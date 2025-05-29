#!/bin/bash

# Google AI Studio API Key Setup Script
# =====================================

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Google AI Studio API Key Setup${NC}"
echo -e "${BLUE}=================================${NC}"
echo

echo -e "${YELLOW}📋 Step 1: Get your API key${NC}"
echo "1. Go to: https://aistudio.google.com/apikey"
echo "2. Sign in with your Google account"
echo "3. Click 'Create API Key'"
echo "4. Copy the API key (starts with 'AIza...')"
echo

# Prompt for API key
echo -e "${YELLOW}🔑 Step 2: Enter your API key${NC}"
read -p "Paste your Google AI Studio API key here: " GEMINI_API_KEY

# Validate API key format
if [[ ! $GEMINI_API_KEY =~ ^AIza.* ]]; then
    echo -e "${RED}❌ Warning: API key should start with 'AIza'${NC}"
    echo -e "${YELLOW}Are you sure this is correct? (y/n)${NC}"
    read -p "" confirm
    if [[ $confirm != "y" && $confirm != "Y" ]]; then
        echo "Exiting. Please run the script again with the correct API key."
        exit 1
    fi
fi

# Add to .env file
echo -e "${YELLOW}📝 Step 3: Adding to .env file${NC}"

# Check if .env exists
if [[ ! -f .env ]]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
fi

# Add or update GEMINI_API_KEY in .env
if grep -q "GEMINI_API_KEY=" .env; then
    # Update existing
    sed -i.bak "s/GEMINI_API_KEY=.*/GEMINI_API_KEY=\"$GEMINI_API_KEY\"/" .env
    echo "Updated existing GEMINI_API_KEY in .env"
else
    # Add new
    echo "" >> .env
    echo "# Google AI Studio API Key (added by setup script)" >> .env
    echo "GEMINI_API_KEY=\"$GEMINI_API_KEY\"" >> .env
    echo "Added GEMINI_API_KEY to .env"
fi

echo -e "${GREEN}✅ API key added successfully!${NC}"
echo

# Test the API key
echo -e "${YELLOW}🧪 Step 4: Testing the API key${NC}"
echo "Running test to verify your API key works..."

export GEMINI_API_KEY="$GEMINI_API_KEY"

if python3 test_google_ai_studio_live_api.py; then
    echo -e "${GREEN}🎉 SUCCESS! Your Google AI Studio API key is working!${NC}"
    echo -e "${GREEN}You can now use camera and microphone streaming with Live API!${NC}"
else
    echo -e "${RED}❌ API key test failed. Please check:${NC}"
    echo "1. The API key is correct"
    echo "2. You have internet connection"
    echo "3. The API key has proper permissions"
fi

echo
echo -e "${BLUE}📖 Next Steps:${NC}"
echo "1. ✅ API key is set up"
echo "2. 🔄 Update your frontend to use Google AI Studio for Live API"
echo "3. 📱 Keep Vertex AI for other enterprise features"
echo "4. 🎥 Start building camera/microphone streaming!"
echo
echo -e "${YELLOW}📚 Documentation: LIVE_API_PLATFORM_COMPARISON.md${NC}" 