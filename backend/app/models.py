from datetime import datetime
from . import db

# User Authentication Models

class User(db.Model):
    """User model for authentication"""
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), nullable=False, unique=True, index=True)
    username = db.Column(db.String(80), nullable=True, unique=True, index=True)
    display_name = db.Column(db.String(100), nullable=True)
    avatar_url = db.Column(db.String(500), nullable=True)
    
    # Account status
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    is_verified = db.Column(db.Boolean, default=False, nullable=False)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_login_at = db.Column(db.DateTime, nullable=True)
    
    # User preferences
    timezone = db.Column(db.String(50), nullable=True, default='UTC')
    language = db.Column(db.String(10), nullable=True, default='en')
    
    # Relationships
    oauth_accounts = db.relationship('OAuthAccount', backref='user', lazy=True, cascade='all, delete-orphan')
    chat_sessions = db.relationship('ChatSession', backref='user', lazy=True, cascade='all, delete-orphan')
    tasks = db.relationship('Task', backref='user', lazy=True, cascade='all, delete-orphan')
    interaction_logs = db.relationship('InteractionLog', backref='user', lazy=True, cascade='all, delete-orphan')
    interaction_session_summaries = db.relationship('InteractionSessionSummary', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'username': self.username,
            'display_name': self.display_name,
            'avatar_url': self.avatar_url,
            'is_active': self.is_active,
            'is_verified': self.is_verified,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'last_login_at': self.last_login_at.isoformat() if self.last_login_at else None,
            'timezone': self.timezone,
            'language': self.language
        }

class OAuthAccount(db.Model):
    """OAuth account linking for various providers"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # Provider information
    provider = db.Column(db.String(50), nullable=False, index=True)  # 'github', 'google', etc.
    provider_id = db.Column(db.String(100), nullable=False)  # User ID from provider
    provider_email = db.Column(db.String(120), nullable=True)
    provider_username = db.Column(db.String(100), nullable=True)
    
    # OAuth tokens
    access_token = db.Column(db.Text, nullable=True)
    refresh_token = db.Column(db.Text, nullable=True)
    token_expires_at = db.Column(db.DateTime, nullable=True)
    
    # Additional provider data (stored as JSON)
    provider_data = db.Column(db.JSON, nullable=True)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_used_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    # Unique constraint for provider + provider_id combination
    __table_args__ = (
        db.UniqueConstraint('provider', 'provider_id', name='unique_provider_account'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'provider': self.provider,
            'provider_id': self.provider_id,
            'provider_email': self.provider_email,
            'provider_username': self.provider_username,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'last_used_at': self.last_used_at.isoformat()
        }

# Existing models with user relationships added

class ChatSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=True) # Optional name for the chat
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    provider = db.Column(db.String(50), nullable=True, default='openai')  # AI provider for this chat
    
    # Link to user
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    
    # Define relationship with cascade delete
    messages = db.relationship('ChatMessage', backref='chat_session', 
                               lazy='dynamic', cascade='all, delete-orphan')
    
    # New relationship for interaction logs
    interaction_logs = db.relationship('InteractionLog', backref='chat_session',
                                     lazy='dynamic', cascade='all, delete-orphan')
    
    # Relationship for interaction session summaries - add cascade delete
    interaction_session_summaries = db.relationship('InteractionSessionSummary', backref='chat_session',
                                                   lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name or f"Chat {self.id}", # Default name if not set
            'created_at': self.created_at.isoformat(),
            'provider': self.provider,
            'user_id': self.user_id
        }

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    completed = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Link to user
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'completed': self.completed,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'user_id': self.user_id
        }

class ChatMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    text = db.Column(db.Text, nullable=True)  # Text can be null for image-only messages
    sender = db.Column(db.String(50), nullable=False)  # 'user' or 'bot'
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    chat_session_id = db.Column(db.Integer, db.ForeignKey('chat_session.id'), nullable=False)
    
    # New fields for multimodal support
    media_type = db.Column(db.String(50), nullable=True)  # 'image', 'audio', etc.
    media_url = db.Column(db.String(2000), nullable=True)  # URL to the media file

    def to_dict(self):
        result = {
            'id': self.id,
            'text': self.text,
            'sender': self.sender,
            'timestamp': self.timestamp.isoformat(),
            'chat_session_id': self.chat_session_id
        }
        
        # Include media fields if they exist
        if self.media_type:
            result['media_type'] = self.media_type
        if self.media_url:
            result['media_url'] = self.media_url
            
        # Handle live session placeholder data stored in text field as JSON
        if self.media_type == 'live_session_placeholder' and self.text:
            try:
                import json
                result['sessionData'] = json.loads(self.text)
                result['type'] = 'live_session_placeholder'
            except (json.JSONDecodeError, TypeError):
                # Fallback if JSON parsing fails
                result['type'] = 'live_session_placeholder'
                result['sessionData'] = {}
            
        return result

# New models for interaction logging

class InteractionLog(db.Model):
    """Main interaction log table for tracking all user interactions"""
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(100), nullable=False, index=True)  # Frontend session ID
    chat_session_id = db.Column(db.Integer, db.ForeignKey('chat_session.id'), nullable=True)  # Link to chat session if applicable
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True, index=True)  # Link to user
    interaction_type = db.Column(db.String(50), nullable=False, index=True)  # 'video_frame', 'audio_chunk', 'text_input', 'api_response'
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # User context
    user_agent = db.Column(db.String(500), nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)  # IPv6 compatible
    
    # Interaction metadata
    interaction_metadata = db.relationship('InteractionMetadata', backref='interaction_log',
                              uselist=False, cascade='all, delete-orphan')
    
    # Media data (if applicable)
    media_data = db.relationship('InteractionMediaData', backref='interaction_log',
                                uselist=False, cascade='all, delete-orphan')
    
    def to_dict(self, include_media=False):
        result = {
            'id': self.id,
            'session_id': self.session_id,
            'chat_session_id': self.chat_session_id,
            'user_id': self.user_id,
            'interaction_type': self.interaction_type,
            'timestamp': self.timestamp.isoformat(),
            'user_agent': self.user_agent,
            'ip_address': self.ip_address
        }
        
        if self.interaction_metadata:
            result['interaction_metadata'] = self.interaction_metadata.to_dict()
        
        if include_media and self.media_data:
            result['media_data'] = self.media_data.to_dict(include_data=True)
            
        return result

class InteractionMetadata(db.Model):
    """Metadata for each interaction (technical details, quality metrics, etc.)"""
    id = db.Column(db.Integer, primary_key=True)
    interaction_log_id = db.Column(db.Integer, db.ForeignKey('interaction_log.id'), nullable=False)
    
    # Audio/Video technical metadata
    frame_rate = db.Column(db.Float, nullable=True)
    audio_sample_rate = db.Column(db.Integer, nullable=True)
    video_resolution_width = db.Column(db.Integer, nullable=True)
    video_resolution_height = db.Column(db.Integer, nullable=True)
    audio_format = db.Column(db.String(50), nullable=True)  # 'pcm_16bit', etc.
    video_format = db.Column(db.String(50), nullable=True)  # 'jpeg', 'base64_jpeg', etc.
    compression_quality = db.Column(db.Float, nullable=True)  # 0.0-1.0 for compression quality
    
    # Size and performance metrics
    data_size_bytes = db.Column(db.BigInteger, nullable=True)
    processing_time_ms = db.Column(db.Integer, nullable=True)
    
    # API interaction metadata
    api_endpoint = db.Column(db.String(200), nullable=True)
    api_response_time_ms = db.Column(db.Integer, nullable=True)
    api_status_code = db.Column(db.Integer, nullable=True)
    
    # UI state metadata
    camera_on = db.Column(db.Boolean, nullable=True)
    microphone_on = db.Column(db.Boolean, nullable=True)
    is_connected = db.Column(db.Boolean, nullable=True)
    
    # Custom metadata (JSON for flexibility)
    custom_metadata = db.Column(db.JSON, nullable=True)
    
    def to_dict(self):
        return {
            'frame_rate': self.frame_rate,
            'audio_sample_rate': self.audio_sample_rate,
            'video_resolution': {
                'width': self.video_resolution_width,
                'height': self.video_resolution_height
            } if self.video_resolution_width and self.video_resolution_height else None,
            'audio_format': self.audio_format,
            'video_format': self.video_format,
            'compression_quality': self.compression_quality,
            'data_size_bytes': self.data_size_bytes,
            'processing_time_ms': self.processing_time_ms,
            'api_endpoint': self.api_endpoint,
            'api_response_time_ms': self.api_response_time_ms,
            'api_status_code': self.api_status_code,
            'camera_on': self.camera_on,
            'microphone_on': self.microphone_on,
            'is_connected': self.is_connected,
            'custom_metadata': self.custom_metadata
        }

class InteractionMediaData(db.Model):
    """Store actual media data for interactions (with privacy considerations)"""
    id = db.Column(db.Integer, primary_key=True)
    interaction_log_id = db.Column(db.Integer, db.ForeignKey('interaction_log.id'), nullable=False)
    
    # Storage options
    storage_type = db.Column(db.String(50), nullable=False)  # 'inline', 'file_path', 'cloud_storage', 'hash_only'
    
    # Actual data storage (choose based on privacy/storage requirements)
    data_inline = db.Column(db.LargeBinary, nullable=True)  # For small data directly in DB
    file_path = db.Column(db.String(500), nullable=True)  # Local file system path
    cloud_storage_url = db.Column(db.String(1000), nullable=True)  # Cloud storage URL
    data_hash = db.Column(db.String(128), nullable=True)  # SHA-256 hash for verification/deduplication
    
    # Privacy and retention
    is_anonymized = db.Column(db.Boolean, default=False)
    retention_until = db.Column(db.DateTime, nullable=True)  # Auto-delete date
    
    # Encryption metadata
    is_encrypted = db.Column(db.Boolean, default=False)
    encryption_key_id = db.Column(db.String(100), nullable=True)
    
    def to_dict(self, include_data=False):
        result = {
            'storage_type': self.storage_type,
            'data_hash': self.data_hash,
            'is_anonymized': self.is_anonymized,
            'retention_until': self.retention_until.isoformat() if self.retention_until else None,
            'is_encrypted': self.is_encrypted
        }
        
        if include_data and not self.is_encrypted:
            if self.storage_type == 'inline' and self.data_inline:
                # Only include if specifically requested and not encrypted
                result['data_size'] = len(self.data_inline)
            elif self.storage_type == 'file_path':
                result['file_path'] = self.file_path
            elif self.storage_type == 'cloud_storage':
                result['cloud_storage_url'] = self.cloud_storage_url
                
        return result

class InteractionSessionSummary(db.Model):
    """Summary statistics for each interaction session"""
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(100), nullable=False, unique=True, index=True)
    chat_session_id = db.Column(db.Integer, db.ForeignKey('chat_session.id'), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True, index=True)  # Link to user
    
    # Session timing
    started_at = db.Column(db.DateTime, nullable=False)
    ended_at = db.Column(db.DateTime, nullable=True)
    duration_seconds = db.Column(db.Integer, nullable=True)
    
    # Interaction counts
    total_interactions = db.Column(db.Integer, default=0)
    video_frames_sent = db.Column(db.Integer, default=0)
    audio_chunks_sent = db.Column(db.Integer, default=0)
    text_messages_sent = db.Column(db.Integer, default=0)
    api_responses_received = db.Column(db.Integer, default=0)
    
    # Quality metrics
    average_video_frame_rate = db.Column(db.Float, nullable=True)
    total_data_sent_bytes = db.Column(db.BigInteger, default=0)
    average_api_response_time_ms = db.Column(db.Float, nullable=True)
    
    # Error tracking
    total_errors = db.Column(db.Integer, default=0)
    last_error_timestamp = db.Column(db.DateTime, nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'chat_session_id': self.chat_session_id,
            'user_id': self.user_id,
            'started_at': self.started_at.isoformat(),
            'ended_at': self.ended_at.isoformat() if self.ended_at else None,
            'duration_seconds': self.duration_seconds,
            'total_interactions': self.total_interactions,
            'video_frames_sent': self.video_frames_sent,
            'audio_chunks_sent': self.audio_chunks_sent,
            'text_messages_sent': self.text_messages_sent,
            'api_responses_received': self.api_responses_received,
            'average_video_frame_rate': self.average_video_frame_rate,
            'total_data_sent_bytes': self.total_data_sent_bytes,
            'average_api_response_time_ms': self.average_api_response_time_ms,
            'total_errors': self.total_errors,
            'last_error_timestamp': self.last_error_timestamp.isoformat() if self.last_error_timestamp else None
        } 