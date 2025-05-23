FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Install an asynchronous worker for Gunicorn with SocketIO
RUN pip install --no-cache-dir eventlet

COPY . .

# Make startup script executable
RUN chmod +x start_services.sh

EXPOSE 5000 8080

# Use the startup script to run both services
CMD ["./start_services.sh"] 