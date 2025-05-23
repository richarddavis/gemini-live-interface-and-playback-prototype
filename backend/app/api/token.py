import sys
import os
import time
from pathlib import Path
from datetime import datetime

# Add the parent directory to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from flask import Blueprint, jsonify, request
from ..get_token import get_access_token

token_bp = Blueprint('token', __name__)

# Simple rate limiting
TOKEN_REQUESTS = {}
RATE_LIMIT = 5  # requests per minute
RATE_WINDOW = 60  # seconds

@token_bp.route('/token', methods=['GET'])
def get_token():
    """
    Get a GCP access token.
    
    Returns:
        A JSON response with the access token.
    """
    # Get client IP
    client_ip = request.remote_addr
    current_time = time.time()
    
    # Initialize if this is first request from this IP
    if client_ip not in TOKEN_REQUESTS:
        TOKEN_REQUESTS[client_ip] = []
    
    # Remove requests older than the rate window
    TOKEN_REQUESTS[client_ip] = [t for t in TOKEN_REQUESTS[client_ip] if current_time - t < RATE_WINDOW]
    
    # Check if rate limit is exceeded
    if len(TOKEN_REQUESTS[client_ip]) >= RATE_LIMIT:
        return jsonify({
            'error': 'Rate limit exceeded. Please try again later.',
            'retry_after': RATE_WINDOW - (current_time - TOKEN_REQUESTS[client_ip][0])
        }), 429
    
    # Add current request time
    TOKEN_REQUESTS[client_ip].append(current_time)
    
    try:
        token = get_access_token()
        # Add timestamp for debugging/logging
        response_data = {
            'token': token,
            'timestamp': datetime.now().isoformat(),
            'expires_in': 3600  # Tokens typically expire in 1 hour
        }
        return jsonify(response_data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500 