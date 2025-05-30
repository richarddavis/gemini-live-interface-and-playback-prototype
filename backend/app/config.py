import os

class Config:
    """Application configuration"""
    
    # Google Cloud Storage settings
    GCS_BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME', 'your-gcs-bucket-name')
    
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