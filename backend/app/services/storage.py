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
    def upload_file(file, custom_filename=None, expiration_hours=None):
        """
        Upload a file to Google Cloud Storage and generate a signed URL
        
        Args:
            file: File object from request.files
            custom_filename: Optional custom filename, if None will generate UUID
            expiration_hours: Optional custom expiration in hours. 
                             Defaults to 1 hour for regular uploads, 
                             but can be set much longer for replay data (e.g., 8760 = 1 year)
            
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
            
            # Determine expiration based on use case
            if expiration_hours is None:
                # Default to 1 hour for regular uploads
                expiration_hours = 1
                
            # For replay data, use much longer expiration (but within GCS limits)
            if custom_filename and 'interactions/' in custom_filename:
                # This is replay data - use maximum allowed GCS expiration: 7 days
                expiration_hours = 168  # 7 days = 7 * 24 hours (max allowed by GCS)
                current_app.logger.info(f"Setting long-lived URL for replay data: {custom_filename} (expires in {expiration_hours} hours)")
            
            expiration = datetime.timedelta(hours=expiration_hours)
            signed_url = blob.generate_signed_url(
                version="v4",
                expiration=expiration,
                method="GET"
            )
            
            # For debugging
            if expiration_hours > 24:
                print(f"[DEBUG] Generated long-lived signed URL (expires in {expiration_hours} hours / {expiration_hours//24} days): {blob_name}")
            else:
                print(f"[DEBUG] Generated signed URL (expires in {expiration_hours} hour(s)): {blob_name}")
            
            return signed_url, content_type
            
        except Exception as e:
            print(f"[ERROR] GCS upload error: {str(e)}")
            import traceback
            traceback.print_exc()
            raise

    @staticmethod
    def regenerate_signed_url(blob_name, expiration_hours=168):
        """
        Regenerate a signed URL for an existing blob (useful for expired URLs)
        
        Args:
            blob_name: The name of the blob in GCS
            expiration_hours: Hours until expiration (default: 7 days - max allowed by GCS)
            
        Returns:
            New signed URL string
        """
        try:
            # Create a client
            storage_client = storage.Client()
            
            # Get bucket and blob
            bucket = storage_client.bucket(GCSStorageService.BUCKET_NAME)
            blob = bucket.blob(blob_name)
            
            # Check if blob exists
            if not blob.exists():
                raise ValueError(f"Blob {blob_name} does not exist in bucket {GCSStorageService.BUCKET_NAME}")
            
            # Generate new signed URL
            expiration = datetime.timedelta(hours=expiration_hours)
            signed_url = blob.generate_signed_url(
                version="v4",
                expiration=expiration,
                method="GET"
            )
            
            print(f"[DEBUG] Regenerated signed URL for {blob_name} (expires in {expiration_hours} hours)")
            return signed_url
            
        except Exception as e:
            print(f"[ERROR] Failed to regenerate signed URL for {blob_name}: {str(e)}")
            raise 