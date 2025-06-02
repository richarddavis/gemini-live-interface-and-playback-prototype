# Authentication System Setup

This document explains how to set up the OAuth authentication system for the webapp.

## Overview

The authentication system supports multiple OAuth providers:
- **Google OAuth 2.0**
- **GitHub OAuth**
- **Microsoft OAuth (Azure AD)**

Users can sign in with any configured provider, and their chat history will be isolated to their account.

## Environment Configuration

Add the following environment variables to your `.env` file:

```bash
# JWT Secret Key (change this in production!)
JWT_SECRET_KEY=your-super-secret-jwt-key-change-in-production

# Frontend URL for OAuth redirects
FRONTEND_URL=http://localhost:3000

# Google OAuth (get from Google Cloud Console)
OAUTH_GOOGLE_CLIENT_ID=your-google-client-id
OAUTH_GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth (get from GitHub Developer Settings)
OAUTH_GITHUB_CLIENT_ID=your-github-client-id
OAUTH_GITHUB_CLIENT_SECRET=your-github-client-secret

# Microsoft OAuth (get from Azure App Registrations)
OAUTH_MICROSOFT_CLIENT_ID=your-microsoft-client-id
OAUTH_MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
```

## Setting Up OAuth Providers

### Google OAuth Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set application type to "Web application"
6. Add authorized redirect URIs:
   - `http://localhost:8080/api/auth/callback/google` (development)
   - `https://yourdomain.com/api/auth/callback/google` (production)
7. Copy the Client ID and Client Secret to your `.env` file

### GitHub OAuth Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the application details:
   - **Application name**: Your app name
   - **Homepage URL**: `http://localhost:3000` (development)
   - **Authorization callback URL**: `http://localhost:8080/api/auth/callback/github`
4. Copy the Client ID and Client Secret to your `.env` file

### Microsoft OAuth Setup

1. Go to the [Azure Portal](https://portal.azure.com/)
2. Navigate to "Azure Active Directory" → "App registrations"
3. Click "New registration"
4. Fill in the application details:
   - **Name**: Your app name
   - **Supported account types**: Choose appropriate option
   - **Redirect URI**: `http://localhost:8080/api/auth/callback/microsoft`
5. Go to "Certificates & secrets" → "New client secret"
6. Copy the Application (client) ID and Client Secret to your `.env` file

## Database Migration

The authentication system requires database changes. Run the migration:

```bash
docker-compose exec backend flask db upgrade
```

## Testing the Authentication

1. Start the application:
   ```bash
   docker-compose up -d
   ```

2. Visit `http://localhost:3000`

3. You should be redirected to the login page

4. If OAuth providers are configured, you'll see login buttons for each provider

5. If no providers are configured, you'll see instructions on how to set them up

## API Endpoints

The authentication system adds the following API endpoints:

- `GET /api/auth/providers` - List available OAuth providers
- `GET /api/auth/login/<provider>` - Initiate OAuth flow
- `GET /api/auth/callback/<provider>` - OAuth callback handler
- `GET /api/auth/me` - Get current user info (requires authentication)
- `POST /api/auth/logout` - Logout user
- `PUT /api/auth/user/update` - Update user profile

## Security Notes

1. **Change the JWT secret key** in production to a strong, random value
2. **Use HTTPS** in production for all OAuth redirects
3. **Configure CORS** properly for your production domain
4. **Regularly rotate** OAuth client secrets
5. **Monitor** authentication logs for suspicious activity

## User Data Isolation

With authentication enabled:
- Each user can only see their own chat sessions
- Chat history is isolated by user ID
- API endpoints require authentication tokens
- Users cannot access other users' data

## Troubleshooting

### "No Authentication Providers Configured"
- Check that OAuth environment variables are set correctly
- Restart the backend container after changing environment variables
- Verify OAuth app configurations in provider consoles

### OAuth Callback Errors
- Ensure redirect URIs match exactly in provider settings
- Check that the backend is accessible at the configured URL
- Verify client IDs and secrets are correct

### Token Errors
- Check that JWT_SECRET_KEY is set
- Ensure tokens haven't expired
- Verify Authorization headers are being sent correctly

## Development vs Production

### Development
- Use `http://localhost:3000` for frontend URL
- Use `http://localhost:8080` for backend OAuth callbacks
- OAuth providers should allow localhost redirects

### Production
- Use your actual domain for all URLs
- Ensure HTTPS is enabled
- Update OAuth provider settings with production URLs
- Use strong, unique JWT secret keys 