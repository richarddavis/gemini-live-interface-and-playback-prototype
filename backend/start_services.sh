#!/bin/bash

# Start the WebSocket proxy in the background
echo "Starting WebSocket proxy..."
cd /app && python run_live_proxy.py &
PROXY_PID=$!

# Wait a moment for proxy to start
sleep 2

# Start the Flask application
echo "Starting Flask backend..."
exec gunicorn --bind 0.0.0.0:5000 wsgi:app

# If Flask stops, kill the proxy too
kill $PROXY_PID 2>/dev/null 