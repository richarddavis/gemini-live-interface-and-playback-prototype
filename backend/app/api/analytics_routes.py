"""
Simple Analytics API for Live API Usage Tracking
================================================

This module provides endpoints for logging and tracking Live API usage.
Frontend connects directly to Google; backend just logs for analytics.
"""

import logging
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_cors import cross_origin

logger = logging.getLogger(__name__)

# Create Blueprint for analytics
analytics_bp = Blueprint('analytics', __name__)

@analytics_bp.route('/health', methods=['GET'])
@cross_origin()
def health_check():
    """Simple health check"""
    return jsonify({
        "status": "healthy",
        "service": "analytics",
        "message": "Analytics service is running"
    })

@analytics_bp.route('/log-session-start', methods=['POST'])
@cross_origin()
def log_session_start():
    """Log when a user starts a Live API session"""
    try:
        data = request.get_json() or {}
        
        session_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "session_type": data.get("session_type", "unknown"),
            "voice": data.get("voice", "unknown"),
            "model": data.get("model", "unknown"),
            "user_agent": request.headers.get("User-Agent", "unknown"),
            "ip_address": request.remote_addr
        }
        
        logger.info(f"Live API session started: {session_data}")
        
        return jsonify({
            "success": True,
            "message": "Session start logged",
            "timestamp": session_data["timestamp"]
        })
        
    except Exception as e:
        logger.error(f"Error logging session start: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@analytics_bp.route('/log-session-end', methods=['POST'])
@cross_origin()
def log_session_end():
    """Log when a user ends a Live API session"""
    try:
        data = request.get_json() or {}
        
        session_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "session_duration": data.get("duration_seconds", 0),
            "messages_sent": data.get("messages_sent", 0),
            "audio_chunks_sent": data.get("audio_chunks_sent", 0),
            "video_frames_sent": data.get("video_frames_sent", 0),
            "ip_address": request.remote_addr
        }
        
        logger.info(f"Live API session ended: {session_data}")
        
        return jsonify({
            "success": True,
            "message": "Session end logged",
            "timestamp": session_data["timestamp"]
        })
        
    except Exception as e:
        logger.error(f"Error logging session end: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@analytics_bp.route('/log-interaction', methods=['POST'])
@cross_origin()
def log_interaction():
    """Log user interactions for analytics"""
    try:
        data = request.get_json() or {}
        
        interaction_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "interaction_type": data.get("type", "unknown"),  # text, audio, video
            "content_length": data.get("content_length", 0),
            "response_time_ms": data.get("response_time_ms", 0),
            "ip_address": request.remote_addr
        }
        
        logger.info(f"Live API interaction: {interaction_data}")
        
        return jsonify({
            "success": True,
            "message": "Interaction logged"
        })
        
    except Exception as e:
        logger.error(f"Error logging interaction: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@analytics_bp.route('/stats', methods=['GET'])
@cross_origin()
def get_stats():
    """Get basic usage statistics"""
    try:
        # In a real app, you'd query a database here
        # For now, return mock stats
        stats = {
            "total_sessions_today": 0,
            "active_sessions": 0,
            "total_interactions": 0,
            "average_session_duration": 0,
            "popular_voices": {
                "Puck": 45,
                "Aoede": 32,
                "Kore": 23
            }
        }
        
        return jsonify({
            "success": True,
            "stats": stats,
            "timestamp": datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500 