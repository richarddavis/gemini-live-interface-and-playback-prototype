from google.cloud import storage
import os

os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/app/gcp-key.json'
client = storage.Client()
bucket = client.bucket('cursor-test-llm-assets')
blobs = list(bucket.list_blobs())
print(f'Found {len(blobs)} objects remaining in bucket')

if len(blobs) > 0:
    print('Deleting remaining objects...')
    for blob in blobs:
        try:
            blob.delete()
            print(f'Deleted: {blob.name}')
        except Exception as e:
            print(f'Failed to delete {blob.name}: {e}')
    print('✅ GCS cleanup completed')
else:
    print('✅ Bucket is already empty!') 