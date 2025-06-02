from flask import Blueprint, request, jsonify, session, redirect, current_app
from ..services.auth_service import auth_service
from functools import wraps

auth_bp = Blueprint('auth', __name__)

def require_auth(f):
    """Decorator to require authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not auth_service.is_authenticated():
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

@auth_bp.route('/login', methods=['GET'])
def login():
    """Initiate OAuth login flow"""
    try:
        auth_url, state, code_verifier = auth_service.get_authorization_url()
        if not auth_url:
            return jsonify({'error': 'Failed to generate authorization URL'}), 500
        
        return jsonify({
            'auth_url': auth_url,
            'state': state
        })
    except Exception as e:
        current_app.logger.error(f"Login error: {e}")
        return jsonify({'error': 'Login failed'}), 500

@auth_bp.route('/callback', methods=['POST'])
def callback():
    """Handle OAuth callback"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        code = data.get('code')
        state = data.get('state')
        
        if not code or not state:
            return jsonify({'error': 'Missing code or state parameter'}), 400
        
        # Exchange code for tokens
        tokens = auth_service.exchange_code_for_tokens(code, state)
        if not tokens:
            return jsonify({'error': 'Token exchange failed'}), 400
        
        # Get user info
        access_token = tokens.get('access_token')
        if not access_token:
            return jsonify({'error': 'No access token received'}), 400
        
        user_info = auth_service.get_user_info(access_token)
        if not user_info:
            return jsonify({'error': 'Failed to get user info'}), 400
        
        # Create or update user
        user = auth_service.create_or_update_user(user_info, tokens)
        if not user:
            return jsonify({'error': 'Failed to create user'}), 500
        
        # Log in user
        auth_service.login_user(user)
        
        return jsonify({
            'success': True,
            'user': user.to_dict()
        })
    
    except Exception as e:
        current_app.logger.error(f"Callback error: {e}")
        return jsonify({'error': 'Authentication failed'}), 500

@auth_bp.route('/logout', methods=['POST'])
@require_auth
def logout():
    """Log out user"""
    try:
        auth_service.logout_user()
        return jsonify({'success': True})
    except Exception as e:
        current_app.logger.error(f"Logout error: {e}")
        return jsonify({'error': 'Logout failed'}), 500

@auth_bp.route('/user', methods=['GET'])
@require_auth
def get_current_user():
    """Get current user information"""
    try:
        user = auth_service.get_current_user()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'user': user.to_dict()
        })
    except Exception as e:
        current_app.logger.error(f"Get user error: {e}")
        return jsonify({'error': 'Failed to get user'}), 500

@auth_bp.route('/status', methods=['GET'])
def get_auth_status():
    """Get authentication status"""
    try:
        is_authenticated = auth_service.is_authenticated()
        user = auth_service.get_current_user() if is_authenticated else None
        
        return jsonify({
            'authenticated': is_authenticated,
            'user': user.to_dict() if user else None
        })
    except Exception as e:
        current_app.logger.error(f"Auth status error: {e}")
        return jsonify({'error': 'Failed to get auth status'}), 500 