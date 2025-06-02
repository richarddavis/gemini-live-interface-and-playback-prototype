from flask import request, jsonify, redirect, url_for, current_app, session
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from authlib.integrations.flask_client import OAuth
from datetime import datetime, timedelta
import requests
import os

from ..models import db, User, OAuthAccount
from . import api

# Initialize OAuth
oauth = OAuth()

# OAuth provider configurations
OAUTH_PROVIDERS = {
    'google': {
        'client_id': lambda: current_app.config.get('OAUTH_GOOGLE_CLIENT_ID'),
        'client_secret': lambda: current_app.config.get('OAUTH_GOOGLE_CLIENT_SECRET'),
        'server_metadata_url': 'https://accounts.google.com/.well-known/openid_connect_configuration',
        'client_kwargs': {
            'scope': 'openid email profile'
        },
        'userinfo_endpoint': 'https://www.googleapis.com/oauth2/v2/userinfo',
        'display_name': 'Google'
    },
    'github': {
        'client_id': lambda: current_app.config.get('OAUTH_GITHUB_CLIENT_ID'),
        'client_secret': lambda: current_app.config.get('OAUTH_GITHUB_CLIENT_SECRET'),
        'access_token_url': 'https://github.com/login/oauth/access_token',
        'authorize_url': 'https://github.com/login/oauth/authorize',
        'api_base_url': 'https://api.github.com/',
        'client_kwargs': {
            'scope': 'user:email'
        },
        'userinfo_endpoint': 'https://api.github.com/user',
        'display_name': 'GitHub'
    },
    'microsoft': {
        'client_id': lambda: current_app.config.get('OAUTH_MICROSOFT_CLIENT_ID'),
        'client_secret': lambda: current_app.config.get('OAUTH_MICROSOFT_CLIENT_SECRET'),
        'server_metadata_url': 'https://login.microsoftonline.com/common/v2.0/.well-known/openid_connect_configuration',
        'client_kwargs': {
            'scope': 'openid email profile'
        },
        'userinfo_endpoint': 'https://graph.microsoft.com/v1.0/me',
        'display_name': 'Microsoft'
    }
}

def init_oauth_providers(app):
    """Initialize OAuth providers with app context"""
    with app.app_context():
        for provider_name, config in OAUTH_PROVIDERS.items():
            client_id = config['client_id']()
            client_secret = config['client_secret']()
            
            if client_id and client_secret:
                oauth_config = {
                    'client_id': client_id,
                    'client_secret': client_secret,
                }
                
                # Add provider-specific configuration
                if 'server_metadata_url' in config:
                    oauth_config['server_metadata_url'] = config['server_metadata_url']
                else:
                    oauth_config.update({
                        'access_token_url': config.get('access_token_url'),
                        'authorize_url': config.get('authorize_url'),
                        'api_base_url': config.get('api_base_url'),
                    })
                
                oauth_config['client_kwargs'] = config.get('client_kwargs', {})
                
                oauth.register(provider_name, **oauth_config)

# Initialize OAuth when module is imported
def register_oauth(app):
    oauth.init_app(app)
    init_oauth_providers(app)

@api.route('/auth/providers', methods=['GET'])
def get_auth_providers():
    """Get list of available OAuth providers"""
    available_providers = []
    
    for provider_name, config in OAUTH_PROVIDERS.items():
        client_id = config['client_id']()
        if client_id:  # Only include providers that are configured
            available_providers.append({
                'name': provider_name,
                'display_name': config['display_name'],
                'authorize_url': f'/api/auth/login/{provider_name}'
            })
    
    return jsonify({
        'providers': available_providers,
        'total': len(available_providers)
    })

@api.route('/auth/login/<provider>', methods=['GET'])
def oauth_login(provider):
    """Initiate OAuth login with specified provider"""
    if provider not in OAUTH_PROVIDERS:
        return jsonify({'error': 'Provider not supported'}), 400
    
    client_id = OAUTH_PROVIDERS[provider]['client_id']()
    if not client_id:
        return jsonify({'error': 'Provider not configured'}), 400
    
    try:
        oauth_client = oauth.create_client(provider)
        redirect_uri = url_for('api.oauth_callback', provider=provider, _external=True)
        return oauth_client.authorize_redirect(redirect_uri)
    except Exception as e:
        current_app.logger.error(f"OAuth login error for {provider}: {str(e)}")
        return jsonify({'error': 'OAuth initialization failed'}), 500

@api.route('/auth/callback/<provider>', methods=['GET'])
def oauth_callback(provider):
    """Handle OAuth callback and create/login user"""
    if provider not in OAUTH_PROVIDERS:
        return jsonify({'error': 'Provider not supported'}), 400
    
    try:
        oauth_client = oauth.create_client(provider)
        token = oauth_client.authorize_access_token()
        
        # Get user info from provider
        user_info = get_user_info_from_provider(provider, token)
        if not user_info:
            return jsonify({'error': 'Failed to get user information'}), 400
        
        # Find or create user
        user, oauth_account = find_or_create_user(provider, user_info, token)
        
        # Update last login time
        user.last_login_at = datetime.utcnow()
        oauth_account.last_used_at = datetime.utcnow()
        db.session.commit()
        
        # Create JWT token
        access_token = create_access_token(identity=user.id)
        
        # Redirect to frontend with token
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
        return redirect(f"{frontend_url}/auth/callback?token={access_token}&user_id={user.id}")
        
    except Exception as e:
        current_app.logger.error(f"OAuth callback error for {provider}: {str(e)}")
        return jsonify({'error': 'Authentication failed'}), 500

def get_user_info_from_provider(provider, token):
    """Get user information from OAuth provider"""
    try:
        config = OAUTH_PROVIDERS[provider]
        userinfo_url = config['userinfo_endpoint']
        
        headers = {'Authorization': f"Bearer {token['access_token']}"}
        response = requests.get(userinfo_url, headers=headers)
        
        if response.status_code != 200:
            current_app.logger.error(f"Failed to get user info from {provider}: {response.text}")
            return None
        
        user_data = response.json()
        
        # Normalize user data based on provider
        if provider == 'google':
            return {
                'provider_id': user_data.get('id'),
                'email': user_data.get('email'),
                'name': user_data.get('name'),
                'username': user_data.get('email', '').split('@')[0],
                'avatar_url': user_data.get('picture'),
                'verified': user_data.get('verified_email', False)
            }
        elif provider == 'github':
            # For GitHub, we might need to get email separately
            email = user_data.get('email')
            if not email:
                # Get primary email from GitHub
                email_response = requests.get('https://api.github.com/user/emails', headers=headers)
                if email_response.status_code == 200:
                    emails = email_response.json()
                    primary_email = next((e['email'] for e in emails if e['primary']), None)
                    email = primary_email
            
            return {
                'provider_id': str(user_data.get('id')),
                'email': email,
                'name': user_data.get('name') or user_data.get('login'),
                'username': user_data.get('login'),
                'avatar_url': user_data.get('avatar_url'),
                'verified': True  # GitHub accounts are considered verified
            }
        elif provider == 'microsoft':
            return {
                'provider_id': user_data.get('id'),
                'email': user_data.get('mail') or user_data.get('userPrincipalName'),
                'name': user_data.get('displayName'),
                'username': user_data.get('userPrincipalName', '').split('@')[0],
                'avatar_url': None,  # Microsoft Graph doesn't provide avatar in basic profile
                'verified': True  # Microsoft accounts are considered verified
            }
        
        return None
        
    except Exception as e:
        current_app.logger.error(f"Error getting user info from {provider}: {str(e)}")
        return None

def find_or_create_user(provider, user_info, token):
    """Find existing user or create new one"""
    provider_id = user_info['provider_id']
    email = user_info['email']
    
    if not email:
        raise ValueError("Email is required for user creation")
    
    # First, try to find existing OAuth account
    oauth_account = OAuthAccount.query.filter_by(
        provider=provider,
        provider_id=provider_id
    ).first()
    
    if oauth_account:
        # Update OAuth account with latest info
        oauth_account.provider_email = email
        oauth_account.provider_username = user_info.get('username')
        oauth_account.access_token = token.get('access_token')
        oauth_account.refresh_token = token.get('refresh_token')
        if token.get('expires_at'):
            oauth_account.token_expires_at = datetime.fromtimestamp(token['expires_at'])
        oauth_account.provider_data = user_info
        
        return oauth_account.user, oauth_account
    
    # Try to find user by email
    user = User.query.filter_by(email=email).first()
    
    if not user:
        # Create new user
        username = user_info.get('username', email.split('@')[0])
        
        # Ensure username is unique
        base_username = username
        counter = 1
        while User.query.filter_by(username=username).first():
            username = f"{base_username}_{counter}"
            counter += 1
        
        user = User(
            email=email,
            username=username,
            display_name=user_info.get('name'),
            avatar_url=user_info.get('avatar_url'),
            is_verified=user_info.get('verified', False),
            created_at=datetime.utcnow()
        )
        db.session.add(user)
        db.session.flush()  # Get user ID
    
    # Create OAuth account
    oauth_account = OAuthAccount(
        user_id=user.id,
        provider=provider,
        provider_id=provider_id,
        provider_email=email,
        provider_username=user_info.get('username'),
        access_token=token.get('access_token'),
        refresh_token=token.get('refresh_token'),
        provider_data=user_info
    )
    
    if token.get('expires_at'):
        oauth_account.token_expires_at = datetime.fromtimestamp(token['expires_at'])
    
    db.session.add(oauth_account)
    
    return user, oauth_account

@api.route('/auth/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current authenticated user"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user or not user.is_active:
        return jsonify({'error': 'User not found or inactive'}), 404
    
    return jsonify({
        'user': user.to_dict(),
        'oauth_accounts': [account.to_dict() for account in user.oauth_accounts]
    })

@api.route('/auth/logout', methods=['POST'])
@jwt_required()
def logout():
    """Logout user (client-side token removal)"""
    # In a stateless JWT system, logout is primarily handled client-side
    # We could implement token blacklisting here if needed
    return jsonify({'message': 'Logged out successfully'})

@api.route('/auth/user/update', methods=['PUT'])
@jwt_required()
def update_user():
    """Update user profile"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    data = request.get_json()
    
    # Update allowed fields
    if 'display_name' in data:
        user.display_name = data['display_name']
    if 'timezone' in data:
        user.timezone = data['timezone']
    if 'language' in data:
        user.language = data['language']
    
    user.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({'user': user.to_dict()}) 