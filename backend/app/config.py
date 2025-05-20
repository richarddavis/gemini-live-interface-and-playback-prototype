import os

class Config:
    """Application configuration"""
    
    # Google Cloud Storage settings
    GCS_BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME', 'your-gcs-bucket-name')
    
    # Set GOOGLE_APPLICATION_CREDENTIALS in environment or configure here
    # Example: 
    # os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/path/to/service-account-key.json' 