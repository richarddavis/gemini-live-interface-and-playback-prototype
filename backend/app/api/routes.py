from flask import jsonify, request, Response, stream_with_context, current_app
from . import api
from .. import db
from ..models import Task, ChatMessage, ChatSession, InteractionLog, InteractionMetadata, InteractionMediaData, InteractionSessionSummary
from app.llm_providers import OpenAIProvider, GeminiProvider
from app.services.storage import GCSStorageService
import json
import os
from werkzeug.utils import secure_filename
import base64
import hashlib
from datetime import datetime, timedelta
from sqlalchemy import func
from io import BytesIO
import requests

# Helper function to check if file type is allowed
def allowed_file(filename):
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@api.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "timestamp": datetime.utcnow().isoformat()}), 200

@api.route('/tasks', methods=['GET'])
def get_tasks():
    tasks = Task.query.all()
    return jsonify([task.to_dict() for task in tasks]), 200

@api.route('/tasks/<int:task_id>', methods=['GET'])
def get_task(task_id):
    task = Task.query.get_or_404(task_id)
    return jsonify(task.to_dict()), 200

@api.route('/tasks', methods=['POST'])
def create_task():
    data = request.get_json()
    
    if not data or not data.get('title'):
        return jsonify({"error": "Title is required"}), 400
    
    task = Task(
        title=data.get('title'),
        description=data.get('description', ''),
        completed=data.get('completed', False)
    )
    
    db.session.add(task)
    db.session.commit()
    
    return jsonify(task.to_dict()), 201

@api.route('/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    task = Task.query.get_or_404(task_id)
    data = request.get_json()
    
    if 'title' in data:
        task.title = data['title']
    if 'description' in data:
        task.description = data['description']
    if 'completed' in data:
        task.completed = data['completed']
    
    db.session.commit()
    
    return jsonify(task.to_dict()), 200

@api.route('/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    task = Task.query.get_or_404(task_id)
    
    db.session.delete(task)
    db.session.commit()
    
    return jsonify({"message": "Task deleted successfully"}), 200

# Chat Message Routes
@api.route('/messages', methods=['GET'])
def get_messages():
    messages = ChatMessage.query.order_by(ChatMessage.timestamp.asc()).all()
    return jsonify([message.to_dict() for message in messages]), 200

@api.route('/messages', methods=['POST'])
def create_message():
    data = request.get_json()
    
    if not data or not data.get('text') or not data.get('sender'):
        return jsonify({"error": "Text and sender are required"}), 400
    
    if not data.get('chat_session_id'):
        return jsonify({"error": "chat_session_id is required for this endpoint"}), 400

    message = ChatMessage(
        text=data.get('text'),
        sender=data.get('sender'),
        chat_session_id=data.get('chat_session_id')
    )
    
    db.session.add(message)
    db.session.commit()
    
    return jsonify(message.to_dict()), 201

# Chat Session Routes
@api.route('/chat_sessions', methods=['GET'])
def get_chat_sessions():
    sessions = ChatSession.query.order_by(ChatSession.created_at.desc()).all()
    return jsonify([session.to_dict() for session in sessions]), 200

@api.route('/chat_sessions', methods=['POST'])
def create_chat_session():
    data = request.get_json() or {}
    provider = data.get('provider', 'openai')
    
    session = ChatSession(provider=provider)
    db.session.add(session)
    db.session.commit()
    db.session.refresh(session)
    return jsonify(session.to_dict()), 201

@api.route('/chat_sessions/<int:session_id>', methods=['DELETE'])
def delete_chat_session(session_id):
    session = ChatSession.query.get_or_404(session_id)
    
    # No need to manually delete messages, the cascade will handle it
    db.session.delete(session)
    db.session.commit()
    
    return jsonify({"message": "Chat session deleted successfully"}), 200

@api.route('/chat_sessions/<int:session_id>/update_provider', methods=['POST'])
def update_chat_session_provider(session_id):
    session = ChatSession.query.get_or_404(session_id)
    data = request.get_json()
    
    if not data or 'provider' not in data:
        return jsonify({"error": "Provider field is required"}), 400
    
    session.provider = data['provider']
    db.session.commit()
    
    return jsonify(session.to_dict()), 200

# Session-Specific Message Routes
@api.route('/chat_sessions/<int:session_id>/messages', methods=['GET'])
def get_session_messages(session_id):
    session = ChatSession.query.get_or_404(session_id)
    messages = session.messages.order_by(ChatMessage.timestamp.asc()).all()
    return jsonify([message.to_dict() for message in messages]), 200

@api.route('/chat_sessions/<int:session_id>/messages', methods=['POST'])
def create_session_message(session_id):
    ChatSession.query.get_or_404(session_id)
    data = request.get_json()

    if not data or not data.get('text') or not data.get('sender'):
        return jsonify({"error": "Text and sender are required"}), 400

    message = ChatMessage(
        text=data.get('text'),
        sender=data.get('sender'),
        chat_session_id=session_id
    )

    db.session.add(message)
    db.session.commit()

    return jsonify(message.to_dict()), 201

@api.route('/chat_sessions/<int:session_id>/respond_llm', methods=['POST'])
def respond_llm(session_id):
    data = request.get_json()
    provider_name = data.get('provider', 'openai')
    api_key = data.get('api_key')
    user_text = data.get('text')
    media_url = data.get('media_url')
    media_type = data.get('media_type')

    if (not user_text and not media_url) or not api_key:
        return jsonify({"error": "Either text or media content, and api_key are required"}), 400

    session = ChatSession.query.get_or_404(session_id)
    
    user_message = ChatMessage(
        text=user_text,
        sender='user',
        chat_session_id=session_id,
        media_url=media_url,
        media_type=media_type
    )
    db.session.add(user_message)
    db.session.commit()

    messages_from_db = session.messages.order_by(ChatMessage.timestamp.asc()).all()
    
    # Prepare messages differently based on provider
    provider_messages = []
    for m in messages_from_db:
        if provider_name == 'openai':
            # OpenAI expects role (user/assistant) and content
            role = 'user' if m.sender == 'user' else 'assistant'
            msg_dict = {"role": role, "content": m.text or ""}
            if m.media_url and m.media_type:
                msg_dict['media_url'] = m.media_url
                msg_dict['media_type'] = m.media_type
        else:
            # Gemini expects sender (user/bot) and text
            msg_dict = {"sender": m.sender, "text": m.text}
            if m.media_url and m.media_type:
                msg_dict['media_url'] = m.media_url
                msg_dict['media_type'] = m.media_type
        provider_messages.append(msg_dict)

    if provider_name == 'openai':
        provider_instance = OpenAIProvider()
    elif provider_name == 'gemini':
        provider_instance = GeminiProvider()
    else:
        return jsonify({"error": f"Unknown provider: {provider_name}"}), 400

    try:
        ai_response_text = provider_instance.get_response(provider_messages, api_key)
        
        if ai_response_text is None or "Error:" in ai_response_text or "blocked by Gemini" in ai_response_text or "Provider error" in ai_response_text:
             current_app.logger.error(f"Provider {provider_name} returned an error or no content: {ai_response_text}")
             return jsonify({"error": ai_response_text or f"Provider {provider_name} returned no content or an error."}), 500

    except Exception as e:
        current_app.logger.error(f"LLM Provider error ({provider_name}): {str(e)}")
        return jsonify({"error": f"LLM Provider error ({provider_name}): {str(e)}"}), 500

    ai_message = ChatMessage(text=ai_response_text, sender='bot', chat_session_id=session_id)
    db.session.add(ai_message)
    db.session.commit()
    return jsonify(ai_message.to_dict()), 200

@api.route('/chat_sessions/<int:session_id>/respond_llm_stream', methods=['GET'])
def respond_llm_stream(session_id):
    session = ChatSession.query.get_or_404(session_id)
    provider_name = request.args.get('provider')
    
    # If provider is specified in request, update the session's provider
    if provider_name:
        session.provider = provider_name
        db.session.commit()
    # Otherwise use the session's saved provider (fallback to openai)
    else:
        provider_name = session.provider or 'openai'
    
    api_key = request.args.get('api_key')
    user_text = request.args.get('text')
    media_url = request.args.get('media_url')
    media_type = request.args.get('media_type')
    
    current_app.logger.debug(f"[STREAM DEBUG] Called: session_id={session_id}, provider={provider_name}, has_text={bool(user_text)}, has_media={bool(media_url)}")
    
    if (not user_text and not media_url) or not api_key:
        return jsonify({"error": "Either text or media content, and api_key are required"}), 400

    user_message = ChatMessage(
        text=user_text,
        sender='user',
        chat_session_id=session_id,
        media_url=media_url,
        media_type=media_type
    )
    db.session.add(user_message)
    db.session.commit()
    current_app.logger.debug(f"[STREAM DEBUG] User message saved: id={user_message.id}")

    session = ChatSession.query.get_or_404(session_id)
    messages_from_db = session.messages.order_by(ChatMessage.timestamp.asc()).all()
    current_app.logger.debug(f"[STREAM DEBUG] Fetched {len(messages_from_db)} messages for provider history.")
    
    # Prepare messages differently based on provider
    provider_messages = []
    for m in messages_from_db:
        if provider_name == 'openai':
            # OpenAI expects role (user/assistant) and content
            role = 'user' if m.sender == 'user' else 'assistant'
            msg_dict = {"role": role, "content": m.text or ""}
            if m.media_url and m.media_type:
                msg_dict['media_url'] = m.media_url
                msg_dict['media_type'] = m.media_type
        else:
            # Gemini expects sender (user/bot) and text 
            msg_dict = {"sender": m.sender, "text": m.text}
            if m.media_url and m.media_type:
                msg_dict['media_url'] = m.media_url
                msg_dict['media_type'] = m.media_type
        provider_messages.append(msg_dict)
    
    current_app.logger.debug(f"[STREAM DEBUG] Prepared provider_messages with {len(provider_messages)} entries for {provider_name}")

    if provider_name == 'openai':
        provider_instance = OpenAIProvider()
    elif provider_name == 'gemini':
        provider_instance = GeminiProvider()
    else:
        current_app.logger.error(f"[STREAM DEBUG] Unsupported provider: {provider_name}")
        return jsonify({"error": f"Streaming is not supported for provider: {provider_name}"}), 400

    if not hasattr(provider_instance, 'stream_response'):
        current_app.logger.error(f"[STREAM DEBUG] Provider {provider_name} does not support streaming method.")
        return jsonify({"error": f"Provider {provider_name} does not have a stream_response method."}), 400

    def event_stream():
        full_response = ""
        try:
            current_app.logger.debug(f"[STREAM DEBUG] Starting stream from {provider_name}...")
            for chunk_text in provider_instance.stream_response(provider_messages, api_key):
                if chunk_text: 
                    full_response += chunk_text
                    yield f"data: {json.dumps({'delta': chunk_text})}\n\n"
            
            current_app.logger.debug(f"[STREAM DEBUG] Stream complete from {provider_name}. Full response length: {len(full_response)}")
            
            if "Error streaming from" in full_response or "Content stream blocked" in full_response or "Error communicating with Gemini" in full_response:
                 current_app.logger.warning(f"Stream from {provider_name} ended with an error message in content: {full_response}")
            else:
                ai_message = ChatMessage(text=full_response, sender='bot', chat_session_id=session_id)
                db.session.add(ai_message)
                db.session.commit()
                current_app.logger.debug(f"[STREAM DEBUG] Bot message saved: id={ai_message.id}")
            
            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as e:
            current_app.logger.error(f"Error during {provider_name} event_stream generation: {str(e)}")
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'error': f'Stream generation error with {provider_name}: {str(e)}'})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"

    return Response(stream_with_context(event_stream()), mimetype='text/event-stream')

# File upload endpoint
@api.route('/uploads', methods=['POST'])
def upload_file():
    print("[DEBUG] upload_file route called")
    
    if 'file' not in request.files:
        print("[DEBUG] No file part in request")
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    print(f"[DEBUG] File received: {file.filename}, type: {file.content_type}")
    
    if file.filename == '':
        print("[DEBUG] Empty filename")
        return jsonify({"error": "No selected file"}), 400
    
    if file and allowed_file(file.filename):
        try:
            # Use Google Cloud Storage to upload the file
            print("[DEBUG] Uploading to GCS...")
            url, media_type = GCSStorageService.upload_file(file)
            print(f"[DEBUG] GCS upload successful, url: {url}")
            
            # For debugging and communication of status
            filename = os.path.basename(url)
            
            response_data = {
                "url": url,
                "filename": filename,
                "media_type": media_type
            }
            print(f"[DEBUG] Response data: {response_data}")
            
            return jsonify(response_data), 201
        except Exception as e:
            print(f"[DEBUG] Error uploading file: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": f"Error uploading file: {str(e)}"}), 500
    else:
        print(f"[DEBUG] File type not allowed: {file.filename}")
        return jsonify({"error": "File type not allowed"}), 400 

# ===========================
# INTERACTION LOGGING ENDPOINTS
# ===========================

@api.route('/interaction-logs', methods=['POST'])
def log_interaction():
    """Log a user interaction with optional media data"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data or not data.get('session_id') or not data.get('interaction_type'):
            return jsonify({"error": "session_id and interaction_type are required"}), 400
        
        # Extract user context from request
        user_agent = request.headers.get('User-Agent')
        ip_address = request.environ.get('HTTP_X_FORWARDED_FOR', request.environ.get('REMOTE_ADDR'))
        
        # Create main interaction log
        interaction_log = InteractionLog(
            session_id=data['session_id'],
            chat_session_id=data.get('chat_session_id'),
            interaction_type=data['interaction_type'],
            user_agent=user_agent,
            ip_address=ip_address
        )
        
        db.session.add(interaction_log)
        db.session.flush()  # Get the ID
        
        # Add metadata if provided
        metadata_data = data.get('metadata', {})
        if metadata_data:
            interaction_metadata = InteractionMetadata(
                interaction_log_id=interaction_log.id,
                frame_rate=metadata_data.get('frame_rate'),
                audio_sample_rate=metadata_data.get('audio_sample_rate'),
                video_resolution_width=metadata_data.get('video_resolution', {}).get('width'),
                video_resolution_height=metadata_data.get('video_resolution', {}).get('height'),
                audio_format=metadata_data.get('audio_format'),
                video_format=metadata_data.get('video_format'),
                compression_quality=metadata_data.get('compression_quality'),
                data_size_bytes=metadata_data.get('data_size_bytes'),
                processing_time_ms=metadata_data.get('processing_time_ms'),
                api_endpoint=metadata_data.get('api_endpoint'),
                api_response_time_ms=metadata_data.get('api_response_time_ms'),
                api_status_code=metadata_data.get('api_status_code'),
                camera_on=metadata_data.get('camera_on'),
                microphone_on=metadata_data.get('microphone_on'),
                is_connected=metadata_data.get('is_connected'),
                custom_metadata=metadata_data.get('custom_metadata')
            )
            db.session.add(interaction_metadata)
        
        # Handle media data if provided
        media_data_info = data.get('media_data')
        if media_data_info:
            storage_type = media_data_info.get('storage_type', 'hash_only')
            
            # Get interaction type for file extension logic (move this outside nested blocks)
            interaction_type = data['interaction_type']
            
            media_data = InteractionMediaData(
                interaction_log_id=interaction_log.id,
                storage_type=storage_type,
                is_anonymized=media_data_info.get('is_anonymized', False),
                retention_until=datetime.utcnow() + timedelta(days=media_data_info.get('retention_days', 7))
            )
            
            # Handle different storage types
            if (storage_type == 'inline' or storage_type == 'cloud_storage') and 'data' in media_data_info:
                # For replay mode, upload to GCS instead of storing inline
                if isinstance(media_data_info['data'], str):
                    try:
                        # For API responses that are JSON, handle differently
                        if interaction_type == 'api_response':
                            # Try to parse as JSON first to extract base64 data
                            try:
                                json_data = json.loads(media_data_info['data'])
                                if isinstance(json_data, dict) and 'data' in json_data:
                                    # Extract the actual base64 data from JSON
                                    base64_data = json_data['data']
                                    
                                    # Validate and fix base64 padding if necessary
                                    # Base64 strings should be multiples of 4 characters
                                    missing_padding = len(base64_data) % 4
                                    if missing_padding != 0:
                                        padding_needed = 4 - missing_padding
                                        base64_data += '=' * padding_needed
                                        current_app.logger.warning(f"Fixed base64 padding: added {padding_needed} '=' characters")
                                    
                                    try:
                                        decoded_data = base64.b64decode(base64_data)
                                    except Exception as b64_error:
                                        current_app.logger.error(f"Failed to decode base64 data: {str(b64_error)}")
                                        # Fallback: store as text if base64 decode fails
                                        decoded_data = media_data_info['data'].encode('utf-8')
                                        file_extension = 'json'
                                        content_type = 'application/json'
                                    else:
                                        file_extension = 'pcm'  # Based on the mimeType
                                        content_type = json_data.get('mimeType', 'audio/pcm')
                                else:
                                    # Store as JSON if it's not media data
                                    decoded_data = media_data_info['data'].encode('utf-8')
                                    file_extension = 'json'
                                    content_type = 'application/json'
                            except (json.JSONDecodeError, KeyError):
                                # If not JSON, try as regular base64
                                try:
                                    # Validate and fix base64 padding if necessary
                                    base64_data = media_data_info['data']
                                    missing_padding = len(base64_data) % 4
                                    if missing_padding != 0:
                                        padding_needed = 4 - missing_padding
                                        base64_data += '=' * padding_needed
                                        current_app.logger.warning(f"Fixed non-JSON base64 padding: added {padding_needed} '=' characters")
                                    
                                    decoded_data = base64.b64decode(base64_data)
                                    file_extension = 'json'
                                    content_type = 'application/json'
                                except Exception as b64_error:
                                    current_app.logger.error(f"Failed to decode non-JSON base64: {str(b64_error)}")
                                    # Final fallback: store as text
                                    decoded_data = media_data_info['data'].encode('utf-8')
                                    file_extension = 'txt'
                                    content_type = 'text/plain'
                        else:
                            # For non-API responses, decode base64 data directly
                            try:
                                # Validate and fix base64 padding if necessary
                                base64_data = media_data_info['data']
                                missing_padding = len(base64_data) % 4
                                if missing_padding != 0:
                                    padding_needed = 4 - missing_padding
                                    base64_data += '=' * padding_needed
                                    current_app.logger.warning(f"Fixed {interaction_type} base64 padding: added {padding_needed} '=' characters")
                                
                                decoded_data = base64.b64decode(base64_data)
                                
                                # Determine file extension based on interaction type
                                if interaction_type == 'audio_chunk':
                                    file_extension = 'pcm'
                                    content_type = 'audio/pcm'
                                elif interaction_type == 'video_frame':
                                    file_extension = 'jpg'
                                    content_type = 'image/jpeg'
                                else:
                                    file_extension = 'bin'
                                    content_type = 'application/octet-stream'
                            except Exception as b64_error:
                                current_app.logger.error(f"Failed to decode {interaction_type} base64: {str(b64_error)}")
                                # Fallback: store as text
                                decoded_data = media_data_info['data'].encode('utf-8')
                                file_extension = 'txt'
                                content_type = 'text/plain'
                        
                        # Create a unique filename
                        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                        session_short = data['session_id'][-8:]  # Last 8 chars of session ID
                        filename = f"interactions/{timestamp}_{session_short}_{interaction_type}_{interaction_log.id}.{file_extension}"
                        
                        # Create a temporary file-like object for GCS upload
                        temp_file = BytesIO(decoded_data)
                        temp_file.name = filename
                        temp_file.content_type = content_type
                        
                        # Upload to GCS
                        try:
                            gcs_url, _ = GCSStorageService.upload_file(temp_file, filename)
                            
                            # Store GCS URL and hash
                            media_data.cloud_storage_url = gcs_url
                            media_data.data_hash = hashlib.sha256(decoded_data).hexdigest()
                            media_data.storage_type = 'cloud_storage'  # Update storage type
                            
                            current_app.logger.info(f"Uploaded {interaction_type} to GCS: {filename}")
                            
                        except Exception as gcs_error:
                            current_app.logger.error(f"GCS upload failed: {str(gcs_error)}")
                            # Fallback to hash-only storage
                            media_data.data_hash = hashlib.sha256(decoded_data).hexdigest()
                            media_data.storage_type = 'hash_only'
                            
                    except Exception as e:
                        return jsonify({"error": f"Invalid base64 data: {str(e)}"}), 400
            
            elif storage_type == 'hash_only' and 'data' in media_data_info:
                # Only store hash for privacy
                if isinstance(media_data_info['data'], str):
                    try:
                        decoded_data = base64.b64decode(media_data_info['data'])
                        media_data.data_hash = hashlib.sha256(decoded_data).hexdigest()
                    except:
                        # Assume it's already text, hash directly
                        media_data.data_hash = hashlib.sha256(media_data_info['data'].encode()).hexdigest()
            
            elif storage_type == 'file_path' and 'file_path' in media_data_info:
                media_data.file_path = media_data_info['file_path']
                # Generate hash if data is provided
                if 'data' in media_data_info:
                    try:
                        decoded_data = base64.b64decode(media_data_info['data'])
                        media_data.data_hash = hashlib.sha256(decoded_data).hexdigest()
                    except:
                        pass
            
            db.session.add(media_data)
        
        db.session.commit()
        
        # Update session summary
        _update_session_summary(data['session_id'], data['interaction_type'], metadata_data)
        
        return jsonify({
            "message": "Interaction logged successfully",
            "interaction_id": interaction_log.id
        }), 201
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error logging interaction: {str(e)}")
        return jsonify({"error": f"Failed to log interaction: {str(e)}"}), 500

@api.route('/interaction-logs/<session_id>', methods=['GET'])
def get_interaction_logs(session_id):
    """Get interaction logs for a specific session"""
    try:
        # Query parameters
        interaction_type = request.args.get('interaction_type')
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        include_media = request.args.get('include_media', 'false').lower() == 'true'
        
        # Build query
        query = InteractionLog.query.filter_by(session_id=session_id)
        
        if interaction_type:
            query = query.filter_by(interaction_type=interaction_type)
        
        # Get total count
        total_count = query.count()
        
        # Apply pagination
        logs = query.order_by(InteractionLog.timestamp.desc())\
                   .offset(offset)\
                   .limit(limit)\
                   .all()
        
        return jsonify({
            "logs": [log.to_dict(include_media=include_media) for log in logs],
            "total_count": total_count,
            "limit": limit,
            "offset": offset
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error retrieving interaction logs: {str(e)}")
        return jsonify({"error": f"Failed to retrieve logs: {str(e)}"}), 500

@api.route('/interaction-logs/analytics/<session_id>', methods=['GET'])
def get_session_analytics(session_id):
    """Get analytics for a specific session"""
    try:
        # Get session summary
        summary = InteractionSessionSummary.query.filter_by(session_id=session_id).first()
        
        if not summary:
            return jsonify({"error": "Session not found"}), 404
        
        # Get interaction type breakdown
        interaction_counts = db.session.query(
            InteractionLog.interaction_type,
            func.count(InteractionLog.id).label('count')
        ).filter_by(session_id=session_id)\
         .group_by(InteractionLog.interaction_type)\
         .all()
        
        # Get recent errors (if any)
        recent_errors = InteractionLog.query\
            .join(InteractionMetadata)\
            .filter(
                InteractionLog.session_id == session_id,
                InteractionMetadata.api_status_code >= 400
            )\
            .order_by(InteractionLog.timestamp.desc())\
            .limit(10)\
            .all()
        
        # Calculate quality metrics
        avg_processing_time = db.session.query(func.avg(InteractionMetadata.processing_time_ms))\
            .join(InteractionLog)\
            .filter(InteractionLog.session_id == session_id)\
            .scalar()
        
        avg_data_size = db.session.query(func.avg(InteractionMetadata.data_size_bytes))\
            .join(InteractionLog)\
            .filter(InteractionLog.session_id == session_id)\
            .scalar()
        
        return jsonify({
            "session_summary": summary.to_dict(),
            "interaction_breakdown": {item.interaction_type: item.count for item in interaction_counts},
            "quality_metrics": {
                "average_processing_time_ms": float(avg_processing_time) if avg_processing_time else None,
                "average_data_size_bytes": float(avg_data_size) if avg_data_size else None
            },
            "recent_errors": [log.to_dict() for log in recent_errors]
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting session analytics: {str(e)}")
        return jsonify({"error": f"Failed to get analytics: {str(e)}"}), 500

@api.route('/interaction-logs/sessions', methods=['GET'])
def get_interaction_sessions():
    """Get all interaction sessions with summaries"""
    try:
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        sessions = InteractionSessionSummary.query\
            .order_by(InteractionSessionSummary.started_at.desc())\
            .offset(offset)\
            .limit(limit)\
            .all()
        
        total_count = InteractionSessionSummary.query.count()
        
        return jsonify({
            "sessions": [session.to_dict() for session in sessions],
            "total_count": total_count,
            "limit": limit,
            "offset": offset
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting interaction sessions: {str(e)}")
        return jsonify({"error": f"Failed to get sessions: {str(e)}"}), 500

@api.route('/interaction-logs/session/<session_id>/start', methods=['POST'])
def start_interaction_session(session_id):
    """Start a new interaction session or resume existing one"""
    try:
        data = request.get_json() or {}
        chat_session_id = data.get('chat_session_id')
        
        # Check if session already exists
        existing_summary = InteractionSessionSummary.query.filter_by(session_id=session_id).first()
        
        if existing_summary and not existing_summary.ended_at:
            # Session already active
            return jsonify({
                "message": "Session already active",
                "session": existing_summary.to_dict()
            }), 200
        
        if existing_summary:
            # Update the existing session to restart it
            existing_summary.ended_at = None
            existing_summary.duration_seconds = None
            existing_summary.started_at = datetime.utcnow()
            existing_summary.chat_session_id = chat_session_id
            # Reset counters for new session
            existing_summary.total_interactions = 0
            existing_summary.video_frames_sent = 0
            existing_summary.audio_chunks_sent = 0
            existing_summary.text_messages_sent = 0
            existing_summary.api_responses_received = 0
            existing_summary.total_data_sent_bytes = 0
            existing_summary.total_errors = 0
            existing_summary.last_error_timestamp = None
            
            db.session.commit()
            session_summary = existing_summary
        else:
            # Create new session summary
            session_summary = InteractionSessionSummary(
                session_id=session_id,
                chat_session_id=chat_session_id,
                started_at=datetime.utcnow()
            )
            
            db.session.add(session_summary)
            db.session.commit()
        
        return jsonify({
            "message": "Session started",
            "session": session_summary.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error starting session: {str(e)}")
        return jsonify({"error": f"Failed to start session: {str(e)}"}), 500

@api.route('/interaction-logs/session/<session_id>/end', methods=['POST'])
def end_interaction_session(session_id):
    """End an interaction session"""
    try:
        session_summary = InteractionSessionSummary.query.filter_by(session_id=session_id).first()
        
        if not session_summary:
            return jsonify({"error": "Session not found"}), 404
        
        if session_summary.ended_at:
            return jsonify({"message": "Session already ended"}), 200
        
        session_summary.ended_at = datetime.utcnow()
        session_summary.duration_seconds = int((session_summary.ended_at - session_summary.started_at).total_seconds())
        
        db.session.commit()
        
        return jsonify({
            "message": "Session ended",
            "session": session_summary.to_dict()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error ending session: {str(e)}")
        return jsonify({"error": f"Failed to end session: {str(e)}"}), 500

def _update_session_summary(session_id, interaction_type, metadata):
    """Helper function to update session summary statistics"""
    try:
        summary = InteractionSessionSummary.query.filter_by(session_id=session_id).first()
        
        if not summary:
            # Create if doesn't exist
            summary = InteractionSessionSummary(
                session_id=session_id,
                started_at=datetime.utcnow()
            )
            db.session.add(summary)
            db.session.flush()
        
        # Update counters
        summary.total_interactions += 1
        
        if interaction_type == 'video_frame':
            summary.video_frames_sent += 1
        elif interaction_type == 'audio_chunk':
            summary.audio_chunks_sent += 1
        elif interaction_type == 'text_input':
            summary.text_messages_sent += 1
        elif interaction_type == 'api_response':
            summary.api_responses_received += 1
        
        # Update metrics from metadata
        if metadata:
            if metadata.get('data_size_bytes'):
                summary.total_data_sent_bytes += metadata['data_size_bytes']
            
            if metadata.get('frame_rate') and interaction_type == 'video_frame':
                # Calculate running average
                if summary.average_video_frame_rate:
                    summary.average_video_frame_rate = (summary.average_video_frame_rate + metadata['frame_rate']) / 2
                else:
                    summary.average_video_frame_rate = metadata['frame_rate']
            
            if metadata.get('api_response_time_ms'):
                # Calculate running average
                if summary.average_api_response_time_ms:
                    summary.average_api_response_time_ms = (summary.average_api_response_time_ms + metadata['api_response_time_ms']) / 2
                else:
                    summary.average_api_response_time_ms = metadata['api_response_time_ms']
            
            # Track errors
            if metadata.get('api_status_code', 200) >= 400:
                summary.total_errors += 1
                summary.last_error_timestamp = datetime.utcnow()
        
        db.session.commit()
        
    except Exception as e:
        current_app.logger.error(f"Error updating session summary: {str(e)}")
        # Don't fail the main request if summary update fails
        db.session.rollback() 

@api.route('/interaction-logs/media/<int:interaction_id>', methods=['GET'])
def get_interaction_media(interaction_id):
    """Proxy media files from cloud storage to avoid CORS issues"""
    try:
        # Find the interaction log
        interaction_log = InteractionLog.query.get(interaction_id)
        if not interaction_log:
            return jsonify({"error": "Interaction not found"}), 404
        
        # Check if it has media data
        if not interaction_log.media_data:
            return jsonify({"error": "No media data for this interaction"}), 404
        
        media_data = interaction_log.media_data
        
        # Handle different storage types
        if media_data.storage_type == 'cloud_storage' and media_data.cloud_storage_url:
            try:
                # Fetch the file from GCS
                gcs_response = requests.get(media_data.cloud_storage_url, timeout=30)
                
                if gcs_response.status_code == 200:
                    # Determine content type based on interaction type
                    content_type = 'application/octet-stream'  # Default
                    if interaction_log.interaction_type == 'audio_chunk':
                        content_type = 'audio/pcm'
                    elif interaction_log.interaction_type == 'video_frame':
                        content_type = 'image/jpeg'
                    elif interaction_log.interaction_type == 'api_response':
                        # Check if it's audio or text
                        if media_data.cloud_storage_url.endswith('.pcm'):
                            content_type = 'audio/pcm'
                        elif media_data.cloud_storage_url.endswith('.json'):
                            content_type = 'application/json'
                        else:
                            # For API responses, check if it looks like audio data
                            if len(gcs_response.content) > 1000 and interaction_log.interaction_metadata and interaction_log.interaction_metadata.api_endpoint == 'gemini_live_api':
                                content_type = 'audio/pcm'
                    
                    # Return the file content with proper headers
                    response = Response(
                        gcs_response.content,
                        status=200,
                        headers={
                            'Content-Type': content_type,
                            'Access-Control-Allow-Origin': '*',
                            'Cache-Control': 'public, max-age=3600'
                        }
                    )
                    return response
                elif gcs_response.status_code in [400, 403]:
                    # URL likely expired - try to regenerate it
                    current_app.logger.warning(f"GCS URL expired for interaction {interaction_id}, attempting regeneration")
                    
                    try:
                        # Extract blob name from the URL
                        # URL format: https://storage.googleapis.com/bucket/path/file.ext?signature...
                        url_parts = media_data.cloud_storage_url.split('/')
                        bucket_name = url_parts[3]  # Should match our bucket
                        blob_path = '/'.join(url_parts[4:]).split('?')[0]  # Remove query parameters
                        
                        # Regenerate the signed URL
                        new_signed_url = GCSStorageService.regenerate_signed_url(blob_path, expiration_hours=168)
                        
                        # Update the database with new URL
                        media_data.cloud_storage_url = new_signed_url
                        db.session.commit()
                        
                        current_app.logger.info(f"Successfully regenerated URL for interaction {interaction_id}")
                        
                        # Try fetching with the new URL
                        gcs_response = requests.get(new_signed_url, timeout=30)
                        
                        if gcs_response.status_code == 200:
                            # Determine content type
                            content_type = 'application/octet-stream'
                            if interaction_log.interaction_type == 'audio_chunk':
                                content_type = 'audio/pcm'
                            elif interaction_log.interaction_type == 'video_frame':
                                content_type = 'image/jpeg'
                            elif interaction_log.interaction_type == 'api_response':
                                if blob_path.endswith('.pcm'):
                                    content_type = 'audio/pcm'
                                elif blob_path.endswith('.json'):
                                    content_type = 'application/json'
                                else:
                                    if len(gcs_response.content) > 1000 and interaction_log.interaction_metadata and interaction_log.interaction_metadata.api_endpoint == 'gemini_live_api':
                                        content_type = 'audio/pcm'
                            
                            response = Response(
                                gcs_response.content,
                                status=200,
                                headers={
                                    'Content-Type': content_type,
                                    'Access-Control-Allow-Origin': '*',
                                    'Cache-Control': 'public, max-age=3600',
                                    'X-URL-Regenerated': 'true'  # Indicate this was regenerated
                                }
                            )
                            return response
                        else:
                            current_app.logger.error(f"New URL also failed for interaction {interaction_id}: {gcs_response.status_code}")
                            return jsonify({"error": "Failed to fetch from regenerated cloud storage URL"}), 502
                            
                    except Exception as regen_error:
                        current_app.logger.error(f"URL regeneration failed for interaction {interaction_id}: {str(regen_error)}")
                        return jsonify({"error": f"URL expired and regeneration failed: {str(regen_error)}"}), 502
                else:
                    current_app.logger.error(f"GCS fetch failed: {gcs_response.status_code}")
                    return jsonify({"error": "Failed to fetch from cloud storage"}), 502
                    
            except Exception as e:
                current_app.logger.error(f"Error fetching from GCS: {str(e)}")
                return jsonify({"error": f"Cloud storage error: {str(e)}"}), 502
        
        elif media_data.storage_type == 'inline' and media_data.data_inline:
            # Return inline data
            content_type = 'application/octet-stream'
            if interaction_log.interaction_type == 'audio_chunk':
                content_type = 'audio/pcm'
            elif interaction_log.interaction_type == 'video_frame':
                content_type = 'image/jpeg'
            
            response = Response(
                media_data.data_inline,
                status=200,
                headers={
                    'Content-Type': content_type,
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=3600'
                }
            )
            return response
        
        elif media_data.storage_type == 'hash_only':
            return jsonify({"error": "Media data stored as hash only - no content available for replay"}), 404
        
        else:
            return jsonify({"error": "Unsupported storage type or no media URL"}), 404
            
    except Exception as e:
        current_app.logger.error(f"Error retrieving interaction media: {str(e)}")
        return jsonify({"error": f"Failed to retrieve media: {str(e)}"}), 500 

@api.route('/interaction-logs/regenerate-urls/<session_id>', methods=['POST'])
def regenerate_session_urls(session_id):
    """Regenerate all expired URLs for a session's media data"""
    try:
        # Find all interaction logs for this session that have cloud storage URLs
        interactions = InteractionLog.query.filter_by(session_id=session_id).all()
        
        if not interactions:
            return jsonify({"error": "Session not found"}), 404
        
        regenerated_count = 0
        failed_count = 0
        errors = []
        
        for interaction in interactions:
            if (interaction.media_data and 
                interaction.media_data.storage_type == 'cloud_storage' and 
                interaction.media_data.cloud_storage_url):
                
                try:
                    # Extract blob name from URL
                    url_parts = interaction.media_data.cloud_storage_url.split('/')
                    blob_path = '/'.join(url_parts[4:]).split('?')[0]
                    
                    # Regenerate URL with 1 year expiration
                    new_url = GCSStorageService.regenerate_signed_url(blob_path, expiration_hours=168)
                    
                    # Update database
                    interaction.media_data.cloud_storage_url = new_url
                    regenerated_count += 1
                    
                    current_app.logger.info(f"Regenerated URL for interaction {interaction.id}")
                    
                except Exception as e:
                    failed_count += 1
                    error_msg = f"Failed to regenerate URL for interaction {interaction.id}: {str(e)}"
                    errors.append(error_msg)
                    current_app.logger.error(error_msg)
        
        # Commit all changes
        if regenerated_count > 0:
            db.session.commit()
        
        return jsonify({
            "message": f"URL regeneration completed",
            "regenerated": regenerated_count,
            "failed": failed_count,
            "errors": errors if failed_count > 0 else None
        }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error regenerating URLs for session {session_id}: {str(e)}")
        return jsonify({"error": f"Failed to regenerate URLs: {str(e)}"}), 500 