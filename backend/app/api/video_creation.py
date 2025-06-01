from flask import Blueprint, request, jsonify, send_file
import logging
from ..services.video_processor import VideoProcessor, get_video_processor
from ..services.storage import GCSStorageService
from .. import db
from ..models import InteractionLog, InteractionSessionSummary
from sqlalchemy import func
import os
from datetime import datetime
import tempfile

logger = logging.getLogger(__name__)

# Create blueprint
video_creation_bp = Blueprint('video_creation', __name__)

def get_session_logs(session_id):
    """Get all interaction logs for a session"""
    logs = InteractionLog.query.filter_by(session_id=session_id).order_by(InteractionLog.timestamp.asc()).all()
    return [log.to_dict(include_media=True) for log in logs]

def get_session_replay_data(session_id):
    """Get session replay data directly from database"""
    try:
        # Get all interaction logs for this session with media data
        logs = InteractionLog.query.filter_by(session_id=session_id).order_by(InteractionLog.timestamp.asc()).all()
        
        if not logs:
            return None
        
        # Convert to dict format similar to frontend expectations
        logs_data = []
        for log in logs:
            log_dict = {
                'id': log.id,
                'session_id': log.session_id,
                'interaction_type': log.interaction_type,
                'timestamp': int(log.timestamp.timestamp() * 1000) if log.timestamp else None,  # Convert to milliseconds
                'interaction_metadata': log.interaction_metadata.to_dict() if log.interaction_metadata else {},
                'media_data': log.media_data.to_dict(include_data=True) if log.media_data else {}
            }
            logs_data.append(log_dict)
        
        return {
            'session_id': session_id,
            'logs': logs_data
        }
        
    except Exception as e:
        logger.error(f"Error getting session replay data for {session_id}: {e}")
        return None

@video_creation_bp.route('/create-session-video', methods=['POST'])
def create_session_video():
    """Create turn-based media files for a session"""
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        approach = data.get('approach', 'turn_based_segments')
        frontend_segments = data.get('segments', None)  # Accept segments from frontend
        
        if not session_id:
            return jsonify({'success': False, 'error': 'session_id is required'}), 400
        
        logger.info(f"Creating session video for {session_id} with approach: {approach}")
        
        if approach == 'turn_based_segments':
            # Get interaction logs for this session
            logs = get_session_logs(session_id)
            
            if not logs:
                return jsonify({'success': False, 'error': 'No logs found for session'}), 404
            
            # Use frontend segments if provided, otherwise create our own
            if frontend_segments:
                logger.info(f"Using frontend-provided segments: {len(frontend_segments)} segments")
                segments = frontend_segments
                
                # Convert frontend segment format to backend format if needed
                processed_segments = []
                for segment in segments:
                    # Map frontend segment to our expected format
                    processed_segment = {
                        'id': segment.get('id'),
                        'type': segment.get('type'),
                        'start_time': segment.get('startTime', segment.get('start_time')),
                        'end_time': segment.get('endTime', segment.get('end_time')),
                        'duration': segment.get('duration'),
                        'audio_chunks': segment.get('audioChunks', segment.get('audio_chunks', [])),
                        'video_frames': segment.get('videoFrames', segment.get('video_frames', []))
                    }
                    processed_segments.append(processed_segment)
                
                segments = processed_segments
            else:
                # Fallback to backend segmentation  
                processor = get_video_processor()
                segments = processor.group_into_conversation_segments(logs)
            
            # Create media files for segments
            processor = get_video_processor()
            result = processor.create_session_video(session_id, segments)
            
            if result:
                return jsonify({
                    'success': True,
                    'session_id': session_id,
                    'approach': approach,
                    'segment_media': result['segments'],
                    'total_logs': len(logs)
                })
            else:
                return jsonify({'success': False, 'error': 'Failed to create segment media files'}), 500
        
        else:
            return jsonify({'success': False, 'error': f'Unsupported approach: {approach}'}), 400
            
    except Exception as e:
        logger.error(f"Error creating session video: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@video_creation_bp.route('/session-video-status/<session_id>', methods=['GET'])
def get_session_video_status(session_id):
    """
    Get the video status for a session
    
    Returns:
        JSON response with video availability and URL if exists
    """
    try:
        # TODO: Implement video status tracking in database
        # For now, return basic session info
        session_data = get_session_replay_data(session_id)
        
        if not session_data:
            return jsonify({
                'error': 'Session not found',
                'session_id': session_id
            }), 404
        
        # TODO: Check if video exists in GCS
        # For now, return that video needs to be created
        return jsonify({
            'session_id': session_id,
            'video_available': False,
            'video_url': None,
            'can_create_video': bool(session_data.get('logs'))
        })
        
    except Exception as e:
        logger.error(f"Error getting video status for session {session_id}: {e}")
        return jsonify({
            'error': f'Failed to get video status: {str(e)}',
            'session_id': session_id
        }), 500

@video_creation_bp.route('/analyze-session/<session_id>', methods=['GET'])
def analyze_session_for_video(session_id):
    """Analyze a session to determine video creation viability"""
    try:
        logs = get_session_logs(session_id)
        
        if not logs:
            return jsonify({'error': 'Session not found'}), 404
        
        video_processor = get_video_processor()
        analysis = video_processor.analyze_session_quality(session_id, logs)
        
        return jsonify({
            'session_id': session_id,
            'analysis': analysis,
            'video_creation_recommended': analysis['overall_quality_score'] >= 70
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def analyze_session_data_coverage(logs):
    """
    Analyze session data to determine video creation viability
    """
    try:
        # Categorize logs
        audio_chunks = [log for log in logs if log.get('interaction_type') == 'audio_chunk']
        video_frames = [log for log in logs if log.get('interaction_type') == 'video_frame']
        api_responses = [log for log in logs if log.get('interaction_type') == 'api_response']
        
        # Check for media data availability
        audio_with_media = len([log for log in audio_chunks if log.get('media_data', {}).get('cloud_storage_url')])
        video_with_media = len([log for log in video_frames if log.get('media_data', {}).get('cloud_storage_url')])
        api_with_media = len([log for log in api_responses if log.get('media_data', {}).get('cloud_storage_url')])
        
        # Calculate coverage rates
        audio_coverage = (audio_with_media / len(audio_chunks) * 100) if audio_chunks else 0
        video_coverage = (video_with_media / len(video_frames) * 100) if video_frames else 0
        api_coverage = (api_with_media / len(api_responses) * 100) if api_responses else 0
        
        # Analyze temporal distribution
        if logs:
            logs_sorted = sorted(logs, key=lambda x: x.get('timestamp', 0))
            start_time = logs_sorted[0].get('timestamp')
            end_time = logs_sorted[-1].get('timestamp')
            
            if isinstance(start_time, str):
                start_time = datetime.fromisoformat(start_time.replace('Z', '+00:00')).timestamp() * 1000
            if isinstance(end_time, str):
                end_time = datetime.fromisoformat(end_time.replace('Z', '+00:00')).timestamp() * 1000
                
            session_duration_ms = end_time - start_time
            session_duration_seconds = session_duration_ms / 1000
        else:
            session_duration_seconds = 0
        
        # Calculate quality score
        quality_factors = {
            'audio_coverage': audio_coverage * 0.4,      # 40% weight
            'video_coverage': video_coverage * 0.3,      # 30% weight  
            'api_coverage': api_coverage * 0.2,          # 20% weight
            'sufficient_data': min(100, (len(logs) / 50) * 100) * 0.1  # 10% weight, 50+ logs = good
        }
        
        overall_quality_score = sum(quality_factors.values())
        
        # Generate recommendations
        recommendations = []
        if audio_coverage < 80:
            recommendations.append(f"Consider enabling full audio logging (current: {audio_coverage:.1f}%)")
        if video_coverage < 50 and video_frames:
            recommendations.append(f"Video coverage is low (current: {video_coverage:.1f}%)")
        if len(logs) < 30:
            recommendations.append("Session may be too short for meaningful video creation")
        if session_duration_seconds < 10:
            recommendations.append("Session duration is very short - video may not be worthwhile")
        
        return {
            'total_logs': len(logs),
            'session_duration_seconds': session_duration_seconds,
            'audio_chunks': {
                'total': len(audio_chunks),
                'with_media': audio_with_media,
                'coverage_percent': round(audio_coverage, 1)
            },
            'video_frames': {
                'total': len(video_frames),
                'with_media': video_with_media,
                'coverage_percent': round(video_coverage, 1)
            },
            'api_responses': {
                'total': len(api_responses),
                'with_media': api_with_media,
                'coverage_percent': round(api_coverage, 1)
            },
            'quality_factors': {k: round(v, 1) for k, v in quality_factors.items()},
            'overall_quality_score': round(overall_quality_score, 1),
            'recommendations': recommendations,
            'estimated_video_segments': len(process_logs_into_segments(logs))
        }
        
    except Exception as e:
        logger.error(f"Error in session data analysis: {e}")
        return {
            'error': str(e),
            'total_logs': len(logs) if logs else 0
        }

def process_logs_into_segments(logs):
    """
    Process interaction logs into conversation segments
    (Similar to frontend logic but simplified for backend use)
    """
    segments = []
    current_segment = None
    segment_id = 0
    
    for log in logs:
        interaction_type = log.get('interaction_type')
        timestamp = log.get('timestamp')
        metadata = log.get('interaction_metadata', {})
        
        # Determine if this starts a new segment
        is_user_audio = (interaction_type == 'audio_chunk' and 
                        metadata.get('microphone_on') == True)
        is_api_audio = (interaction_type == 'api_response' and
                       log.get('media_data', {}).get('cloud_storage_url', '').endswith('.pcm'))
        is_text_input = interaction_type == 'text_input'
        is_user_action = interaction_type == 'user_action'
        
        is_segment_start = (
            is_text_input or 
            is_user_action or
            (is_user_audio and (not current_segment or current_segment['type'] != 'user_speech')) or
            (is_api_audio and (not current_segment or current_segment['type'] != 'api_response'))
        )
        
        # Create new segment if needed
        if is_segment_start or not current_segment:
            # Finalize previous segment
            if current_segment:
                current_segment['endTime'] = current_segment['logs'][-1]['timestamp']
                current_segment['duration'] = (
                    timestamp - current_segment['startTime'] 
                    if isinstance(timestamp, (int, float)) and isinstance(current_segment['startTime'], (int, float))
                    else 1000  # Default 1 second
                )
            
            # Determine segment type
            if is_text_input:
                segment_type = 'user_text'
            elif is_user_audio:
                segment_type = 'user_speech'
            elif is_api_audio:
                segment_type = 'api_response'
            elif is_user_action:
                segment_type = 'user_action'
            else:
                segment_type = 'unknown'
            
            segment_id += 1
            current_segment = {
                'id': segment_id,
                'type': segment_type,
                'startTime': timestamp,
                'endTime': timestamp,
                'duration': 0,
                'logs': [],
                'audioChunks': [],
                'videoFrames': []
            }
            segments.append(current_segment)
        
        # Add log to current segment
        current_segment['logs'].append(log)
        
        # Categorize by type
        if interaction_type == 'audio_chunk' or is_api_audio:
            current_segment['audioChunks'].append(log)
        elif interaction_type == 'video_frame':
            current_segment['videoFrames'].append(log)
    
    # Finalize last segment
    if current_segment and current_segment['logs']:
        last_log = current_segment['logs'][-1]
        current_segment['endTime'] = last_log['timestamp']
        if current_segment['startTime'] and current_segment['endTime']:
            current_segment['duration'] = current_segment['endTime'] - current_segment['startTime']
        else:
            current_segment['duration'] = 1000  # Default
    
    logger.info(f"Created {len(segments)} segments from {len(logs)} logs")
    return segments 

@video_creation_bp.route('/segment-media/<session_id>/<segment_id>/<media_type>', methods=['GET'])
def serve_segment_media(session_id, segment_id, media_type):
    """Serve segment media files through backend proxy to avoid CORS issues"""
    try:
        video_processor = get_video_processor()
        
        # Get the blob from GCS
        blob_name = f"replay_videos/{session_id}/{media_type}_segments/{segment_id}_{media_type}_*.{'mp4' if media_type == 'video' else 'wav'}"
        
        # Find the actual blob (since we have timestamp in filename)
        blobs = list(video_processor.bucket.list_blobs(prefix=f"replay_videos/{session_id}/{media_type}_segments/{segment_id}_{media_type}_"))
        
        if not blobs:
            return jsonify({'error': f'No {media_type} file found for segment {segment_id}'}), 404
        
        blob = blobs[0]  # Take the first (should be only one)
        
        # Download to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{"mp4" if media_type == "video" else "wav"}') as temp_file:
            blob.download_to_filename(temp_file.name)
            
            # Determine content type
            content_type = 'video/mp4' if media_type == 'video' else 'audio/wav'
            
            # Serve the file
            return send_file(
                temp_file.name,
                mimetype=content_type,
                as_attachment=False,
                download_name=f"{segment_id}_{media_type}.{'mp4' if media_type == 'video' else 'wav'}"
            )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@video_creation_bp.route('/segment-info/<session_id>', methods=['GET'])
def get_segment_info(session_id):
    """Get information about available segment media for a session"""
    try:
        video_processor = get_video_processor()
        
        # List all segment files for this session
        audio_blobs = list(video_processor.bucket.list_blobs(prefix=f"replay_videos/{session_id}/audio_segments/"))
        video_blobs = list(video_processor.bucket.list_blobs(prefix=f"replay_videos/{session_id}/video_segments/"))
        
        segment_info = {
            'session_id': session_id,
            'audio_segments': [blob.name.split('/')[-1] for blob in audio_blobs],
            'video_segments': [blob.name.split('/')[-1] for blob in video_blobs],
            'total_segments': len(set([blob.name.split('/')[-1].split('_')[0] for blob in audio_blobs + video_blobs]))
        }
        
        return jsonify(segment_info)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500 