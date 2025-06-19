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
    
    # ------------------------------------------------------------------
    # Gemini model configuration (chat – NOT Live API)
    # ------------------------------------------------------------------
    # GEMINI_DEFAULT_MODEL lets ops pick the preferred model without code
    # changes. When unset, the backend falls back to gemini-2.5-flash.
    # Set ENABLE_LEGACY_MODEL=true to force-use the deprecated
    # gemini-1.5-flash-latest build in regression test environments.
    # ------------------------------------------------------------------

    GEMINI_DEFAULT_MODEL = os.environ.get('GEMINI_DEFAULT_MODEL', 'gemini-2.5-flash')
    ENABLE_LEGACY_MODEL = os.environ.get('ENABLE_LEGACY_MODEL', 'false').lower() in {'1', 'true', 'yes'}
    
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