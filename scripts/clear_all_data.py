#!/usr/bin/env python3
"""
Script to completely clear the database and Google Cloud Storage bucket.
This will delete ALL data - use with caution!
"""

import os
import psycopg2
from google.cloud import storage
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def clear_database():
    """Drop all tables and recreate the database schema."""
    print("🗄️  Clearing PostgreSQL database...")
    
    # Database connection parameters (using Docker service names)
    db_params = {
        'host': 'db',  # Use Docker service name instead of localhost
        'port': '5432',
        'database': 'webapp',
        'user': 'postgres',
        'password': 'postgres'
    }
    
    try:
        # Connect to database
        conn = psycopg2.connect(**db_params)
        conn.autocommit = True
        cursor = conn.cursor()
        
        # Get all table names
        cursor.execute("""
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'public' 
            AND tablename != 'alembic_version'
        """)
        tables = cursor.fetchall()
        
        print(f"Found {len(tables)} tables to drop:")
        for table in tables:
            print(f"  - {table[0]}")
        
        # Drop all tables except alembic_version
        for table in tables:
            cursor.execute(f'DROP TABLE IF EXISTS "{table[0]}" CASCADE')
            print(f"✅ Dropped table: {table[0]}")
        
        # Also clear alembic_version to reset migrations
        cursor.execute('DROP TABLE IF EXISTS "alembic_version" CASCADE')
        print("✅ Dropped alembic_version table")
        
        cursor.close()
        conn.close()
        print("✅ Database cleared successfully!")
        
    except Exception as e:
        print(f"❌ Error clearing database: {e}")
        return False
    
    return True

def clear_gcs_bucket():
    """Delete all objects in the Google Cloud Storage bucket."""
    print("\n☁️  Clearing Google Cloud Storage bucket...")
    
    bucket_name = os.getenv('GCS_BUCKET_NAME')
    if not bucket_name:
        print("❌ GCS_BUCKET_NAME not found in environment variables")
        return False
    
    # Set up authentication
    gcp_key_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    if gcp_key_path and os.path.exists(gcp_key_path):
        os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = gcp_key_path
    
    try:
        # Initialize the GCS client
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        
        # List all blobs in the bucket
        blobs = list(bucket.list_blobs())
        print(f"Found {len(blobs)} objects in bucket '{bucket_name}':")
        
        if len(blobs) == 0:
            print("✅ Bucket is already empty!")
            return True
        
        # Delete all blobs
        for blob in blobs:
            print(f"  Deleting: {blob.name}")
            blob.delete()
        
        print("✅ All objects deleted from GCS bucket!")
        
    except Exception as e:
        print(f"❌ Error clearing GCS bucket: {e}")
        return False
    
    return True

def main():
    print("🚨 WARNING: This will delete ALL data from:")
    print("  - PostgreSQL database (all tables)")
    print("  - Google Cloud Storage bucket (all files)")
    print()
    
    response = input("Are you sure you want to continue? Type 'yes' to confirm: ")
    if response.lower() != 'yes':
        print("❌ Operation cancelled.")
        return
    
    print("\n🧹 Starting data cleanup...")
    
    # Clear database
    db_success = clear_database()
    
    # Clear GCS bucket
    gcs_success = clear_gcs_bucket()
    
    print("\n" + "="*50)
    if db_success and gcs_success:
        print("✅ ALL DATA CLEARED SUCCESSFULLY!")
        print("\nNext steps:")
        print("1. Restart the backend container to run migrations")
        print("2. The database will be recreated with fresh tables")
        print("3. The GCS bucket is now empty and ready for new uploads")
    else:
        print("❌ Some operations failed. Check the output above.")
    print("="*50)

if __name__ == "__main__":
    main() 