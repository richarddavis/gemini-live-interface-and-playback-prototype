#!/usr/bin/env python3
"""
Script to start both the WebSocket proxy and Flask backend for live chat functionality.
"""

import subprocess
import sys
import os
import time
import signal
from threading import Thread

def start_websocket_proxy():
    """Start the WebSocket proxy server."""
    print("🚀 Starting WebSocket proxy server...")
    cmd = [sys.executable, "backend/run_live_proxy.py"]
    return subprocess.Popen(cmd, cwd=".")

def start_flask_backend():
    """Start the Flask backend server."""
    print("🚀 Starting Flask backend server...")
    env = os.environ.copy()
    env["FLASK_APP"] = "app"
    env["FLASK_ENV"] = "development"
    
    cmd = [sys.executable, "-m", "flask", "run", "--host=0.0.0.0", "--port=5001"]
    return subprocess.Popen(cmd, cwd="backend", env=env)

def signal_handler(sig, frame):
    """Handle interrupt signal to cleanup processes."""
    print("\n🛑 Shutting down servers...")
    for process in processes:
        if process.poll() is None:  # Process is still running
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
    sys.exit(0)

if __name__ == "__main__":
    processes = []
    
    # Set up signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        # Start WebSocket proxy
        proxy_process = start_websocket_proxy()
        processes.append(proxy_process)
        time.sleep(2)  # Give it a moment to start
        
        # Start Flask backend
        flask_process = start_flask_backend()
        processes.append(flask_process)
        time.sleep(2)  # Give it a moment to start
        
        print("\n✅ Both servers are running!")
        print("📡 WebSocket Proxy: ws://localhost:8080")
        print("🌐 Flask Backend: http://localhost:5001")
        print("\nPress Ctrl+C to stop both servers")
        
        # Wait for processes to complete or be interrupted
        while True:
            time.sleep(1)
            # Check if any process has died
            for i, process in enumerate(processes):
                if process.poll() is not None:
                    print(f"❌ Process {i} has stopped unexpectedly")
                    signal_handler(signal.SIGTERM, None)
                    
    except KeyboardInterrupt:
        signal_handler(signal.SIGINT, None)
    except Exception as e:
        print(f"❌ Error: {e}")
        signal_handler(signal.SIGTERM, None) 