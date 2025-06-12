#!/usr/bin/env python3
"""Fast cleanup script to remove all local database tables and
Google Cloud Storage objects. This version uses more efficient
commands to speed up removal compared to clear_all_data.py.
"""

import os
from concurrent.futures import ThreadPoolExecutor
import psycopg2
from google.cloud import storage
from dotenv import load_dotenv

load_dotenv()

DB_PARAMS = {
    'host': 'db',  # Docker service name
    'port': '5432',
    'database': 'webapp',
    'user': 'postgres',
    'password': 'postgres'
}

CHUNK_SIZE = 100  # Batch size for GCS deletions


def fast_clear_database() -> bool:
    """Drop and recreate the public schema to quickly remove all tables."""
    print("\U0001f5c4  Quickly dropping database schema...")
    try:
        with psycopg2.connect(**DB_PARAMS) as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
        print("\u2705 Database schema recreated")
        return True
    except Exception as exc:
        print(f"\u274c Failed to clear database: {exc}")
        return False


def _delete_blob(blob):
    """Helper to delete a single blob."""
    try:
        blob.delete()
    except Exception as exc:
        print(f"Failed to delete {blob.name}: {exc}")


def fast_clear_gcs_bucket() -> bool:
    """Delete all objects in the configured GCS bucket using batching."""
    bucket_name = os.getenv('GCS_BUCKET_NAME')
    if not bucket_name:
        print("\u274c GCS_BUCKET_NAME not set")
        return False

    gcp_key_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    if gcp_key_path and os.path.exists(gcp_key_path):
        os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = gcp_key_path

    print("\n\u2601\ufe0f  Removing objects from GCS bucket...")
    try:
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blobs = list(bucket.list_blobs())
        total = len(blobs)
        print(f"Found {total} objects in '{bucket_name}'")
        if total == 0:
            print("Bucket already empty")
            return True

        # Use batching for faster deletion
        for i in range(0, total, CHUNK_SIZE):
            chunk = blobs[i:i + CHUNK_SIZE]
            bucket.delete_blobs(chunk)
            print(f"Deleted {min(i + CHUNK_SIZE, total)}/{total} objects", end="\r")
        print("\n\u2705 All objects removed")
        return True
    except Exception as exc:
        print(f"\u274c Failed to clear bucket: {exc}")
        return False


def main():
    print("\n\u26a0\ufe0f  THIS WILL DELETE ALL DATA!")
    confirm = input("Type 'yes' to continue: ")
    if confirm.lower() != 'yes':
        print("Operation cancelled")
        return

    db_ok = fast_clear_database()
    gcs_ok = fast_clear_gcs_bucket()

    if db_ok and gcs_ok:
        print("\n\u2705 Cleanup finished successfully")
    else:
        print("\n\u274c Cleanup completed with errors")


if __name__ == "__main__":
    main()
