from flask import jsonify, request, Response, stream_with_context
from . import api
from .. import db
from ..models import Task, ChatMessage, ChatSession
from app.llm_providers import OpenAIProvider, GeminiProvider
import openai
import json

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
    session = ChatSession()
    db.session.add(session)
    db.session.commit()
    db.session.refresh(session)
    return jsonify(session.to_dict()), 201

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
    if not api_key or not user_text:
        return jsonify({"error": "api_key and text are required"}), 400

    # Verify session exists
    session = ChatSession.query.get_or_404(session_id)
    
    # Save user message
    user_message = ChatMessage(
        text=user_text,
        sender='user',
        chat_session_id=session_id
    )
    db.session.add(user_message)
    db.session.commit()

    # Get all messages for this session, ordered
    messages = session.messages.order_by(ChatMessage.timestamp.asc()).all()
    # Convert to OpenAI/Gemini format
    chat_history = [
        {"role": 'user' if m.sender == 'user' else 'assistant', "content": m.text}
        for m in messages
    ]

    # Select provider
    if provider_name == 'openai':
        provider = OpenAIProvider()
    elif provider_name == 'gemini':
        provider = GeminiProvider()
    else:
        return jsonify({"error": f"Unknown provider: {provider_name}"}), 400

    try:
        ai_response_text = provider.get_response(chat_history, api_key)
    except openai.RateLimitError:
        return jsonify({"error": "Rate limit exceeded. Please try again later."}), 429
    except openai.AuthenticationError:
        return jsonify({"error": "Authentication failed. Check your API key."}), 401
    except openai.APIError as e:
        return jsonify({"error": f"OpenAI API Error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Provider error: {str(e)}"}), 500

    # Save AI message
    ai_message = ChatMessage(
        text=ai_response_text,
        sender='bot',
        chat_session_id=session_id
    )
    db.session.add(ai_message)
    db.session.commit()

    return jsonify(ai_message.to_dict()), 200

@api.route('/chat_sessions/<int:session_id>/respond_llm_stream', methods=['GET'])
def respond_llm_stream(session_id):
    # Read parameters from query string
    provider_name = request.args.get('provider', 'openai')
    api_key = request.args.get('api_key')
    user_text = request.args.get('text')

    if not api_key or not user_text:
        return jsonify({"error": "api_key and text are required"}), 400

    # Save user message
    user_message = ChatMessage(
        text=user_text,
        sender='user',
        chat_session_id=session_id
    )
    db.session.add(user_message)
    db.session.commit()

    # Get all messages for this session, ordered
    session = ChatSession.query.get_or_404(session_id)
    messages = session.messages.order_by(ChatMessage.timestamp.asc()).all()
    chat_history = [
        {"role": 'user' if m.sender == 'user' else 'assistant', "content": m.text}
        for m in messages
    ]

    if provider_name != 'openai':
        return jsonify({"error": "Streaming is only implemented for OpenAI provider."}), 400

    from app.llm_providers.openai_provider import OpenAIProvider
    provider = OpenAIProvider()

    def event_stream():
        full_response = ""
        try:
            for chunk in provider.stream_response(chat_history, api_key):
                full_response += chunk
                yield f"data: {json.dumps({'delta': chunk})}\n\n"
            # At the end, save the full bot message
            ai_message = ChatMessage(
                text=full_response,
                sender='bot',
                chat_session_id=session_id
            )
            db.session.add(ai_message)
            db.session.commit()
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(stream_with_context(event_stream()), mimetype='text/event-stream') 