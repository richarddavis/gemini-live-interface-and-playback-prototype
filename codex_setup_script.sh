#!/bin/bash

# OpenAI Codex Setup Script for React/Flask/PostgreSQL Webapp
# This script sets up the development environment for the Gemini Live API webapp
# 
# IMPORTANT: This script runs during environment setup while internet access is available.
# All dependencies must be installed here as the container loses internet access after setup.

# Exit on any error
set -e

echo "🚀 Setting up Gemini Live API WebApp environment for OpenAI Codex..."
echo "⚠️  IMPORTANT: Use 'Code' mode (not 'Ask' mode) to ensure environment setup runs properly"

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

# Install Python packages globally (CRITICAL for Codex - must be global, not in venv)
echo "🐍 Installing Python packages globally..."
pip3 install --upgrade pip
pip3 install -r requirements.txt

# Install testing dependencies explicitly
pip3 install pytest pytest-cov pytest-flask

# Install common development dependencies that might be needed
pip3 install python-dotenv requests psycopg2-binary

# Verify Python packages are installed and accessible
echo "🔍 Verifying Python package installation..."
python3 -c "import flask; print('✅ Flask installed and accessible')"
python3 -c "import requests; print('✅ Requests installed and accessible')"
python3 -c "import pytest; print('✅ Pytest installed and accessible')"
python3 -c "import psycopg2; print('✅ PostgreSQL adapter installed and accessible')"

# Run database migrations
echo "🔄 Running database migrations..."
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/webapp
export FLASK_APP=wsgi.py
flask db upgrade || echo "Migration completed or not needed"

# Setup React frontend
echo "⚛️ Setting up React frontend..."
cd ../frontend
npm install

# Create pytest configuration
echo "📋 Creating pytest configuration..."
cat > backend/pytest.ini << 'EOF'
[tool:pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = 
    -v
    --tb=short
    --strict-markers
    --disable-warnings
markers =
    unit: Unit tests
    integration: Integration tests
    auth: Authentication tests
    audio: Audio processing tests
    slow: Tests that take longer to run
EOF

# Create a comprehensive test runner script
echo "🧪 Creating comprehensive test runner..."
cat > run_all_tests.sh << 'EOF'
#!/bin/bash
set -e

echo "🧪 Running Comprehensive Test Suite for Gemini Live API WebApp"
echo "=============================================================="

# Check if we're in the right directory
if [[ ! -d "backend" || ! -d "frontend" ]]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Environment checks
echo "🔍 Environment verification..."
echo "📍 Current directory: $(pwd)"
echo "🐍 Python version: $(python3 --version)"
echo "📦 Node version: $(node --version)"

# Backend tests
echo ""
echo "🐍 Running Backend Tests..."
echo "----------------------------"
cd backend

# Check if pytest is available
if ! command -v pytest &> /dev/null; then
    echo "❌ pytest not found. Installing..."
    pip3 install pytest pytest-cov pytest-flask
fi

# Run backend tests with proper error handling
if python3 -m pytest tests/ -v --tb=short; then
    echo "✅ Backend tests passed!"
else
    echo "❌ Backend tests failed!"
    backend_failed=true
fi

# Frontend tests
echo ""
echo "⚛️ Running Frontend Tests..."
echo "-----------------------------"
cd ../frontend

# Check if dependencies are installed
if [[ ! -d "node_modules" ]]; then
    echo "⚠️  Node modules not found. Installing..."
    npm install
fi

# Run frontend tests with proper error handling
if npm test -- --watchAll=false --coverage=false --verbose; then
    echo "✅ Frontend tests passed!"
else
    echo "❌ Frontend tests failed!"
    frontend_failed=true
fi

# Final summary
echo ""
echo "📊 Test Summary"
echo "==============="
if [[ -z "$backend_failed" && -z "$frontend_failed" ]]; then
    echo "🎉 All tests completed successfully!"
    exit 0
else
    echo "❌ Some tests failed:"
    [[ -n "$backend_failed" ]] && echo "  • Backend tests failed"
    [[ -n "$frontend_failed" ]] && echo "  • Frontend tests failed"
    exit 1
fi
EOF

chmod +x run_all_tests.sh

echo "✅ Setup complete!"
echo ""
echo "Environment is ready for development."
echo "Backend: Python Flask with PostgreSQL"
echo "Frontend: React with Node.js"
echo "Services: PostgreSQL and Redis are running"
echo ""
echo "🧪 To run tests:"
echo "  ./run_all_tests.sh    # Run all tests"
echo "  cd backend && pytest  # Backend tests only"
echo "  cd frontend && npm test # Frontend tests only"
echo ""
echo "⚠️  CODEX USAGE NOTES:"
echo "  • Use 'Code' mode (not 'Ask' mode) for tasks that need the full environment"
echo "  • Python packages are installed globally (no virtual environment)"
echo "  • All dependencies are pre-installed during this setup phase"
echo "  • Network access is only available during environment setup" 