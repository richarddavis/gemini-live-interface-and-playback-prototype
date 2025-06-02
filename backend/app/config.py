import os
import secrets

class Config:
    """Application configuration"""
    
    # Google Cloud Storage settings
    GCS_BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME', 'your-gcs-bucket-name')
    
    # Session configuration for authentication
    SECRET_KEY = os.environ.get('SECRET_KEY', secrets.token_hex(32))
    SESSION_TYPE = 'filesystem'
    SESSION_PERMANENT = False
    SESSION_USE_SIGNER = True
    SESSION_KEY_PREFIX = 'chat_app:'
    
    # Session cookie settings for cross-origin requests
    SESSION_COOKIE_NAME = 'session'
    SESSION_COOKIE_SECURE = False  # Set to True in production with HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'  # Allows cookies in top-level navigation
    SESSION_COOKIE_PATH = '/'
    
    # Set GOOGLE_APPLICATION_CREDENTIALS in environment or configure here
    # Example: 
    # os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/path/to/service-account-key.json'


class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'  # In-memory database for testing
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    WTF_CSRF_ENABLED = False
    SECRET_KEY = 'testing-secret-key'
    
    # Mock GCS settings for testing
    GCS_BUCKET_NAME = 'test-bucket'
    GOOGLE_APPLICATION_CREDENTIALS = None  # Will be mocked in tests 