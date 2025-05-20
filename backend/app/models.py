from datetime import datetime
from . import db

class ChatSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=True) # Optional name for the chat
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Define relationship with cascade delete
    messages = db.relationship('ChatMessage', backref='chat_session', 
                               lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name or f"Chat {self.id}", # Default name if not set
            'created_at': self.created_at.isoformat()
        }

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    completed = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'completed': self.completed,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
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
            
        return result 