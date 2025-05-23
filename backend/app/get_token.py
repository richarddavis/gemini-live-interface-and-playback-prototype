import os
import subprocess
import json
from google.oauth2 import service_account
from google.auth.transport.requests import Request

def get_access_token():
    """
    Gets an access token using the GCP service account credentials.
    
    Returns:
        str: The access token.
    """
    # Check for Docker environment first (key is mounted at /app/gcp-key.json)
    docker_key_path = "/app/gcp-key.json"
    
    if os.path.exists(docker_key_path):
        key_file_path = docker_key_path
    else:
        # Use the new local development path
        key_file_path = "/Users/rldavis/Development/webapp_starter_cursor/.secrets/gcp/generative-fashion-355408-d2acee530882.json"
    
    if not os.path.exists(key_file_path):
        raise FileNotFoundError(f"Service account key file not found at: {key_file_path}")
    
    try:
        # Load service account credentials
        credentials = service_account.Credentials.from_service_account_file(
            key_file_path,
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        
        # Get the access token
        request = Request()
        credentials.refresh(request)
        
        return credentials.token
        
    except Exception as e:
        print(f"Error getting access token with service account: {e}")
        raise e

if __name__ == "__main__":
    token = get_access_token()
    print(token) 