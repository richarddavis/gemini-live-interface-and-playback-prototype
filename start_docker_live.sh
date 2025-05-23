#!/bin/bash

echo "🧹 Stopping existing containers..."
docker-compose down

echo "🔨 Building containers..."
docker-compose build

echo "🚀 Starting containers with live chat support..."
docker-compose up

echo "✅ Services should be running on:"
echo "   Frontend: http://localhost:3000"
echo "   Backend: http://localhost:5001"
echo "   WebSocket Proxy: ws://localhost:8080" 