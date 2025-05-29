#!/bin/bash

# Script to set up GCP service account key for Docker

echo "🔧 Setting up GCP service account key for Docker..."

# Create the secrets directory structure
mkdir -p .secrets/gcp

# Check if the key exists in backend
if [ -f "backend/generative-fashion-355408-33bf54a8a28f.json" ]; then
    echo "✅ Found GCP key in backend directory"
    
    # Create a symlink or copy
    if [ ! -f ".secrets/gcp/generative-fashion-355408-d2acee530882.json" ]; then
        echo "📋 Copying GCP key to expected location..."
        cp backend/generative-fashion-355408-33bf54a8a28f.json .secrets/gcp/generative-fashion-355408-d2acee530882.json
        echo "✅ GCP key copied to .secrets/gcp/"
    else
        echo "✅ GCP key already exists in .secrets/gcp/"
    fi
else
    echo "❌ GCP key not found in backend directory"
    echo "Please ensure the service account key is available"
    exit 1
fi

echo "✅ Setup complete!" 