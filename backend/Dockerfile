FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install additional packages for testing
RUN pip install --no-cache-dir google-genai colorama

# Copy application code
COPY . .

# Expose port
EXPOSE 5000

# Default command
CMD ["gunicorn", "-k", "eventlet", "--bind", "0.0.0.0:5000", "wsgi:app"] 