from flask_socketio import emit, join_room, leave_room
from flask import request, current_app
from app import socketio
import google.genai as genai
import threading
import asyncio
import time
import os
import concurrent.futures
from app.llm_providers.gemini_provider import GeminiProvider

# Dictionary to store active Gemini sessions per client SID
active_gemini_sessions = {}
# Thread-local event loops
thread_local = threading.local()

def get_event_loop():
    """Get or create an event loop for the current thread."""
    if not hasattr(thread_local, 'loop'):
        thread_local.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(thread_local.loop)
    return thread_local.loop

@socketio.on('connect')
def handle_connect():
    current_app.logger.info(f'Client connected to root namespace: {request.sid}')

@socketio.on('connect', namespace='/live')
def handle_live_connect():
    current_app.logger.info(f'Client connected to /live namespace: {request.sid}')
    # We will initialize the Gemini session when the client sends configuration

@socketio.on('disconnect', namespace='/live')
def handle_live_disconnect():
    current_app.logger.info(f'Client disconnected from /live: {request.sid}')
    if request.sid in active_gemini_sessions:
        try:
            gemini_session_data = active_gemini_sessions.pop(request.sid)
            current_app.logger.info(f'Removed session data for {request.sid} from active_gemini_sessions')
            
            # Note: The actual Gemini session cleanup happens within the async context
            # manager when the session is exited. We don't need to explicitly close it here.
            current_app.logger.info(f'Cleaned up Gemini session for {request.sid}')
        except Exception as e:
            current_app.logger.error(f'Error cleaning up session for {request.sid}: {str(e)}')
    else:
        current_app.logger.info(f'No Gemini session found for {request.sid} on disconnect')

@socketio.on('start_gemini_session', namespace='/live')
def handle_start_gemini_session(data):
    api_key = data.get('apiKey')
    # Use the correct model for the Live API from our provider class
    model_name = GeminiProvider.LIVE_MODEL_NAME  # This model is supported for the Live API with v1alpha
    
    if not api_key:
        emit('gemini_error', {'error': 'API key is required to start Gemini session.'}, room=request.sid)
        return

    current_app.logger.info(f'Attempting to start Gemini session for {request.sid} with model {model_name}')
    
    # Capture the current application instance and sid for use in the thread
    app = current_app._get_current_object()
    sid = request.sid

    # Function to run in the executor
    def run_async_gemini_session():
        # Create a new application context for this thread
        with app.app_context():
            try:
                # Create a new event loop for this thread
                loop = get_event_loop()
                
                # Define the async functions
                async def initialize_session():
                    # Create a client for the Live API using our provider helper
                    provider = GeminiProvider()
                    client = provider._configure_client(api_key, for_live=True)
                    
                    # Live API configuration
                    config = {
                        "response_modalities": ["TEXT", "AUDIO"],
                    }
                    
                    try:
                        # Store client in active sessions before establishing connection
                        session_data = {'client': client}
                        active_gemini_sessions[sid] = session_data
                        
                        # Emit starting status
                        socketio.emit('gemini_session_starting', 
                                    {'message': 'Connecting to Gemini...'}, 
                                    room=sid, namespace='/live')
                        
                        # Use async with to properly manage the context manager
                        async with client.aio.live.connect(model=model_name, config=config) as gemini_session:
                            # Store the session in our tracking dict
                            session_data['session'] = gemini_session
                            
                            socketio.emit('gemini_session_started', 
                                        {'message': 'Gemini session started successfully.'}, 
                                        room=sid, namespace='/live')
                            app.logger.info(f'Gemini session started for {sid}')
                            
                            # Start listening for responses in the same context
                            try:
                                async for response in gemini_session.receive():
                                    # Check if client is still connected
                                    if sid not in active_gemini_sessions:
                                        app.logger.info(f'Client {sid} disconnected, stopping Gemini listener.')
                                        break
                                    
                                    if response.text:
                                        app.logger.debug(f'Gemini text for {sid}: {response.text}')
                                        socketio.emit('gemini_text_response', 
                                                    {'text': response.text}, 
                                                    room=sid, namespace='/live')
                                    if response.audio:
                                        app.logger.debug(f'Gemini audio chunk received for {sid}, size: {len(response.audio)}')
                                        socketio.emit('gemini_audio_response', 
                                                    {'audio': response.audio}, 
                                                    room=sid, namespace='/live')
                                    if response.error:
                                        app.logger.error(f'Gemini API error for {sid}: {response.error.message}')
                                        socketio.emit('gemini_error', 
                                                    {'error': response.error.message}, 
                                                    room=sid, namespace='/live')
                                        break
                            except Exception as e:
                                app.logger.error(f'Error in Gemini listener for {sid}: {str(e)}')
                                socketio.emit('gemini_error', 
                                            {'error': f'Listener error: {str(e)}'}, 
                                            room=sid, namespace='/live')
                            # Context manager has exited, session is now closed
                    except Exception as e:
                        app.logger.error(f'Error starting Gemini session for {sid}: {str(e)}')
                        socketio.emit('gemini_error', 
                                    {'error': f'Failed to start Gemini session: {str(e)}'}, 
                                    room=sid, namespace='/live')
                    finally:
                        # When done, clean up session data
                        if sid in active_gemini_sessions:
                            del active_gemini_sessions[sid]
                
                # Run the async function
                task = asyncio.run_coroutine_threadsafe(initialize_session(), loop)
                try:
                    # This will block until the coroutine completes
                    task.result()
                except Exception as e:
                    app.logger.error(f'Error in asyncio task for {sid}: {str(e)}')
                    socketio.emit('gemini_error', {'error': f'Task error: {str(e)}'}, 
                                room=sid, namespace='/live')
            except Exception as e:
                app.logger.error(f'Thread error for {sid}: {str(e)}')
                socketio.emit('gemini_error', {'error': f'Thread error: {str(e)}'}, 
                            room=sid, namespace='/live')
    
    # Use a ThreadPoolExecutor to run the async function
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    executor.submit(run_async_gemini_session)
    current_app.logger.info(f'Started Gemini session executor for {sid}')

@socketio.on('client_audio_input', namespace='/live')
def handle_client_audio_input(data):
    audio_chunk = data.get('audio')
    sid = request.sid

    if sid not in active_gemini_sessions:
        emit('gemini_error', {'error': 'Gemini session not active.'}, room=sid)
        return

    gemini_session_data = active_gemini_sessions[sid]
    gemini_session = gemini_session_data.get('session')

    if not audio_chunk or not gemini_session:
        return

    # Get the current app and sid for use in the thread
    app = current_app._get_current_object()
    sid_copy = sid

    # Function to run in the executor
    def send_audio_async():
        with app.app_context():
            try:
                loop = get_event_loop()
                
                async def send_audio():
                    try:
                        # Use the correct parameter name
                        await gemini_session.send(audio=audio_chunk)
                        app.logger.debug(f'Sent audio chunk to Gemini for {sid_copy}, size: {len(audio_chunk)}')
                    except Exception as e:
                        app.logger.error(f'Error sending audio to Gemini for {sid_copy}: {str(e)}')
                        socketio.emit('gemini_error', {'error': f'Failed to send audio: {str(e)}'}, 
                                    room=sid_copy, namespace='/live')
                
                # Replace loop.run_until_complete with run_coroutine_threadsafe
                task = asyncio.run_coroutine_threadsafe(send_audio(), loop)
                try:
                    # This will block until the coroutine completes
                    task.result()
                except Exception as e:
                    app.logger.error(f'Error in audio task for {sid_copy}: {str(e)}')
                    socketio.emit('gemini_error', {'error': f'Audio task error: {str(e)}'}, 
                                room=sid_copy, namespace='/live')
            except Exception as e:
                app.logger.error(f'Error in audio thread for {sid_copy}: {str(e)}')
                socketio.emit('gemini_error', {'error': f'Audio thread error: {str(e)}'}, 
                            room=sid_copy, namespace='/live')

    # Use a ThreadPoolExecutor to run the async function
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    executor.submit(send_audio_async)

@socketio.on('client_text_input', namespace='/live')
def handle_client_text_input(data):
    text_input = data.get('text')
    sid = request.sid

    if sid not in active_gemini_sessions:
        emit('gemini_error', {'error': 'Gemini session not active.'}, room=sid)
        return

    gemini_session_data = active_gemini_sessions[sid]
    gemini_session = gemini_session_data.get('session')

    if not text_input or not gemini_session:
        emit('gemini_error', {'error': 'No text data or inactive session.'}, room=sid)
        return
    
    # Get the current app for use in the thread
    app = current_app._get_current_object()
    sid_copy = sid

    # Function to run in the executor
    def send_text_async():
        with app.app_context():
            try:
                loop = get_event_loop()
                
                async def send_text():
                    try:
                        # Use the correct parameter name (input instead of text)
                        await gemini_session.send(input=text_input, end_of_turn=data.get('end_of_turn', True))
                        app.logger.info(f'Sent text to Gemini for {sid_copy}: {text_input}')
                    except Exception as e:
                        app.logger.error(f'Error sending text to Gemini for {sid_copy}: {str(e)}')
                        socketio.emit('gemini_error', {'error': f'Failed to send text: {str(e)}'}, 
                                    room=sid_copy, namespace='/live')
                
                # Replace loop.run_until_complete with run_coroutine_threadsafe
                task = asyncio.run_coroutine_threadsafe(send_text(), loop)
                try:
                    # This will block until the coroutine completes
                    task.result()
                except Exception as e:
                    app.logger.error(f'Error in text task for {sid_copy}: {str(e)}')
                    socketio.emit('gemini_error', {'error': f'Text task error: {str(e)}'}, 
                                room=sid_copy, namespace='/live')
            except Exception as e:
                app.logger.error(f'Error in text thread for {sid_copy}: {str(e)}')
                socketio.emit('gemini_error', {'error': f'Text thread error: {str(e)}'}, 
                            room=sid_copy, namespace='/live')

    # Use a ThreadPoolExecutor to run the async function
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    executor.submit(send_text_async)

# Placeholder for client video input, if we decide to implement it
# @socketio.on('client_video_input', namespace='/live')
# def handle_client_video_input(data):
#     video_chunk = data.get('video') # Assuming video is sent as bytes
#     sid = request.sid
#     # ... similar logic to audio ...

