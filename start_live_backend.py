#!/usr/bin/env python3
"""
Start Live API Backend Server
============================

This script starts the Flask backend with Live API integration.
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add backend to path
sys.path.append('backend')

def main():
    """Start the backend server."""
    
    # Check for required environment variables
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("❌ GEMINI_API_KEY not found in environment")
        print("   Get your API key from: https://aistudio.google.com/app/apikey")
        print("   Add it to your .env file: GEMINI_API_KEY=your_key_here")
        return 1
    
    print("🚀 Starting Live API Backend Server...")
    print(f"   API Key: {api_key[:10]}...{api_key[-4:]}")
    
    try:
        # Import and start the app
        from backend.app import create_app, socketio
        
        app = create_app()
        
        print("✅ Flask app created successfully")
        print("🔧 Live API routes registered at /api/live/")
        print("📡 WebSocket handlers registered")
        print("\n🌐 Server starting on http://localhost:5000")
        print("   Health check: http://localhost:5000/api/live/health")
        print("   API docs: http://localhost:5000/api/live/example")
        
        # Start the server
        socketio.run(
            app,
            host='0.0.0.0',
            port=5000,
            debug=True,
            allow_unsafe_werkzeug=True
        )
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("   Make sure all dependencies are installed:")
        print("   pip install -r backend/requirements.txt")
        return 1
        
    except Exception as e:
        print(f"❌ Failed to start server: {e}")
        return 1

if __name__ == "__main__":
    exit(main()) 