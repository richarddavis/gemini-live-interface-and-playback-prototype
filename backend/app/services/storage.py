import os
import uuid
from werkzeug.utils import secure_filename
from flask import current_app
from google.cloud import storage
import datetime

class GCSStorageService:
    """Google Cloud Storage service for file uploads"""
    
    # Default bucket name - replace with your actual bucket name
    BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME', 'your-gcs-bucket-name')

    @staticmethod
    def upload_file(file, custom_filename=None):
        """
        Upload a file to Google Cloud Storage and generate a signed URL
        
        Args:
            file: File object from request.files
            custom_filename: Optional custom filename, if None will generate UUID
            
        Returns:
            Tuple of (signed_url, content_type)
        """
        if not file:
            raise ValueError("No file provided")
            
        try:
            # Create a client
            storage_client = storage.Client()
            
            # Get bucket
            bucket = storage_client.bucket(GCSStorageService.BUCKET_NAME)
            
            # Generate a secure unique filename if not provided
            if custom_filename:
                blob_name = secure_filename(custom_filename)
            else:
                original_filename = secure_filename(file.filename)
                blob_name = f"{uuid.uuid4()}_{original_filename}"
            
            # Create blob
            blob = bucket.blob(blob_name)
            
            # Set content type
            content_type = file.content_type
            
            # Upload file
            file.seek(0)  # Ensure we're at the start of the file
            blob.upload_from_file(file, content_type=content_type)
            
            # Generate a signed URL that expires in 1 hour
            expiration = datetime.timedelta(hours=1)
            signed_url = blob.generate_signed_url(
                version="v4",
                expiration=expiration,
                method="GET"
            )
            
            # For debugging
            print(f"[DEBUG] Generated signed URL (expires in 1 hour): {signed_url}")
            
            return signed_url, content_type
            
        except Exception as e:
            print(f"[ERROR] GCS upload error: {str(e)}")
            import traceback
            traceback.print_exc()
            raise 