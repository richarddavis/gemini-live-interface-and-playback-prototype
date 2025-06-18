# Docker Compose Profiles

This project supports three different development approaches through Docker Compose profiles and override files.

## 🎯 Three Development Modes

### 1. **Development Mode** (`dev`)
**Best for:** Local development, debugging, service isolation

**Features:**
- Direct port access to all services
- Individual service debugging
- No nginx complexity
- Traditional Docker development approach

**Access:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8080/api
- OAuth: http://localhost:5556/dex
- Database: localhost:5432

**Start:** `./scripts/start-app.sh dev`

### 2. **Proxy Mode** (`proxy`)
**Best for:** Production-like development, clean URLs, OAuth simplicity

**Features:**
- Nginx reverse proxy
- Single entry point (port 80)
- Production-like architecture
- Clean URLs with `/api` prefix

**Access:**
- App: http://auth.localhost
- Alternative: http://localhost

**Start:** `./scripts/start-app.sh proxy`

### 3. **Ngrok Mode** (`ngrok`)
**Best for:** Public access, mobile testing, sharing with others

**Features:**
- Public internet access
- Mobile device testing
- Demo/sharing capabilities
- HTTPS with valid certificates

**Access:**
- Public: https://civil-entirely-rooster.ngrok-free.app
- Local: http://localhost

**Prerequisites:** Start ngrok first:
```bash
ngrok http 80 --domain=civil-entirely-rooster.ngrok-free.app
```

**Start:** `./scripts/start-app.sh ngrok`

## 📁 File Structure

```
webapp_starter_cursor/
├── docker-compose.yml          # Base configuration with profiles
├── docker-compose.dev.yml      # Development mode overrides
├── docker-compose.proxy.yml    # Proxy mode overrides  
├── docker-compose.ngrok.yml    # Ngrok mode overrides
└── scripts/
    ├── start-app.sh            # Main startup script
    └── stop-app.sh             # Stop all services
```

## 🔧 How It Works

### Profile System
Services are assigned to profiles in `docker-compose.yml`:
- `nginx`: Only in `proxy` profile
- `frontend`, `backend`, `db`, `oauth-server`: In both `dev` and `proxy` profiles

### Override Files
Each mode uses override files to configure environment variables:
- **dev.yml**: Configures localhost URLs for direct access
- **proxy.yml**: Configures nginx routing with auth.localhost
- **ngrok.yml**: Configures public ngrok URLs

### Environment Variables
Each mode sets different environment variables:

#### Development Mode
```bash
REACT_APP_API_URL=http://localhost:8080/api
REACT_APP_OAUTH_ISSUER=http://localhost:5556/dex
OAUTH_ISSUER=http://oauth-server:5556/dex
OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback
```

#### Proxy Mode
```bash
REACT_APP_API_URL=/api
REACT_APP_OAUTH_ISSUER=http://auth.localhost/dex
OAUTH_ISSUER=http://auth.localhost/dex
OAUTH_REDIRECT_URI=http://auth.localhost/auth/callback
```

#### Ngrok Mode
```bash
REACT_APP_API_URL=/api
REACT_APP_OAUTH_ISSUER=https://civil-entirely-rooster.ngrok-free.app/dex
OAUTH_ISSUER=https://civil-entirely-rooster.ngrok-free.app/dex
OAUTH_REDIRECT_URI=https://civil-entirely-rooster.ngrok-free.app/auth/callback
```

## 🚀 Quick Start

```bash
# Show available modes
./scripts/start-app.sh

# Start development mode
./scripts/start-app.sh dev

# Start proxy mode
./scripts/start-app.sh proxy

# Start ngrok mode (after starting ngrok tunnel)
./scripts/start-app.sh ngrok

# Stop everything
./scripts/stop-app.sh
```

## 🔍 Validation Commands

Test each mode after starting:

```bash
# Development mode
curl http://localhost:8080/api/health
curl http://localhost:5556/dex/.well-known/openid_configuration

# Proxy mode
curl http://auth.localhost/api/health
curl http://auth.localhost/dex/.well-known/openid_configuration

# Ngrok mode
curl https://civil-entirely-rooster.ngrok-free.app/api/health
curl https://civil-entirely-rooster.ngrok-free.app/dex/.well-known/openid_configuration
```

## 💡 Best Practices

1. **Default to proxy mode** for daily development
2. **Use dev mode** for debugging specific services
3. **Use ngrok mode** for mobile testing and demos
4. **Always stop services** before switching modes
5. **Check port availability** if startup fails

## 🐛 Troubleshooting

### Port Conflicts
```bash
# Check what's using a port
lsof -i :PORT_NUMBER

# Kill processes on a port
lsof -ti:PORT_NUMBER | xargs kill -9
```

### Service Health
```bash
# Check running containers
docker-compose ps

# View logs
docker-compose logs -f

# Check specific service
docker-compose logs SERVICE_NAME
```

### OAuth Issues
- **Dev mode**: Use http://localhost:3000/auth/callback
- **Proxy mode**: Use http://auth.localhost/auth/callback  
- **Ngrok mode**: Use https://civil-entirely-rooster.ngrok-free.app/auth/callback 