from flask import jsonify, request, Response, stream_with_context, url_for, current_app
from . import api
from .. import db
from ..models import Task, ChatMessage, ChatSession
from app.llm_providers import OpenAIProvider, GeminiProvider
from app.services.storage import GCSStorageService
import openai
import json
import os
from werkzeug.utils import secure_filename
import uuid
import base64

# Helper function to check if file type is allowed
def allowed_file(filename):
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@api.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy"}), 200

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