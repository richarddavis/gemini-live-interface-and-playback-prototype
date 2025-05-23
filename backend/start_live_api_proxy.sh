#!/bin/bash

# Make sure we're in the correct directory
cd "$(dirname "$0")"

# Install required packages if not already installed
pip install websockets

# Start the proxy server
python app/live_api_proxy.py 