#!/bin/bash

# OpenAI Codex Setup Script for React/Flask/PostgreSQL Webapp
# This script sets up the development environment for the Gemini Live API webapp

# Exit on any error
set -e

echo "🚀 Setting up Gemini Live API WebApp environment for OpenAI Codex..."

# Install system dependencies (no sudo needed - script runs as root)
echo "📦 Installing system dependencies..."
apt-get update
apt-get install -y \
  postgresql postgresql-contrib \
  redis-server \
  build-essential \
  libpq-dev \
  curl \
  python3 \
  python3-pip \
  python3-venv

# Install Node.js (LTS version)
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt-get install -y nodejs

# Setup PostgreSQL
echo "🗄️ Setting up PostgreSQL..."
service postgresql start
sudo -u postgres createdb webapp 2>/dev/null || echo "Database 'webapp' already exists"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" 2>/dev/null || echo "Password already set"

# Start Redis
echo "🔴 Starting Redis..."
service redis-server start

# Setup Python backend
echo "🐍 Setting up Python backend..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Run database migrations
echo "🔄 Running database migrations..."
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/webapp
flask db upgrade || echo "Migration completed or not needed"

# Setup React frontend
echo "⚛️ Setting up React frontend..."
cd ../frontend
npm install

echo "✅ Setup complete!"
echo ""
echo "Environment is ready for development."
echo "Backend: Python Flask with PostgreSQL"
echo "Frontend: React with Node.js"
echo "Services: PostgreSQL and Redis are running" 