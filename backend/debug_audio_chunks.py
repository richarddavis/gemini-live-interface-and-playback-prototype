#!/usr/bin/env python3

import sys
sys.path.append('/app')

from app import create_app
from app.models import InteractionLog

# Create Flask app context
app = create_app()
with app.app_context():
    # Get the session logs directly from model
    session_id = 'session_1748731008522_zafso79ru'
    logs = InteractionLog.query.filter_by(session_id=session_id).order_by(InteractionLog.timestamp.asc()).all()

    print(f'Found {len(logs)} logs for session {session_id}')

    # Filter audio chunks specifically
    audio_chunks = [log for log in logs if log.interaction_type == 'audio_chunk']
    print(f'Found {len(audio_chunks)} audio chunks')

    # Show details of first few audio chunks
    for i, chunk in enumerate(audio_chunks[:3]):
        chunk_dict = chunk.to_dict(include_media=True)
        print(f'Audio chunk {i+1}: ID={chunk.id}')
        print(f'  - media_data: {chunk_dict.get("media_data", {})}')
        print(f'  - interaction_metadata: {chunk_dict.get("interaction_metadata", {})}')
        
        # Check if media_data has cloud_storage_url
        media_data = chunk_dict.get("media_data", {})
        if media_data and isinstance(media_data, dict):
            print(f'  - has cloud_storage_url: {bool(media_data.get("cloud_storage_url"))}')
            if media_data.get("cloud_storage_url"):
                url = media_data.get("cloud_storage_url")
                print(f'  - URL: {url[:100]}...')
        print() 