#!/bin/bash

# Minimal OpenAI Codex Setup Script for React/Flask WebApp
# Based on working examples from the Codex community

set -e

# Install system dependencies
apt-get update
apt-get install -y python3 python3-pip nodejs npm postgresql postgresql-contrib

# Start PostgreSQL
service postgresql start
sudo -u postgres createdb webapp || true
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" || true

# Install Python dependencies globally
cd backend && pip3 install -r requirements.txt && cd ..

# Install Node dependencies
cd frontend && npm install && cd ..

# Set up database
cd backend
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/webapp
export FLASK_APP=wsgi.py
flask db upgrade || true
cd .. 