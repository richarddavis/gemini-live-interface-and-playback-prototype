# Environment Management Across Branches

This project uses different infrastructure setups across branches, requiring different `.env` configurations. Since `.env` files contain sensitive data and aren't tracked in git, we use a template-based system to manage configurations.

## The Problem

- Different branches have different infrastructure (localhost, nginx proxy, network-accessible)
- `.env` files can't be tracked in git (security)
- Switching branches leaves you with mismatched configurations
- Manual management is error-prone and frustrating

## The Solution

### Branch-Specific Templates

We maintain templates for each infrastructure type:

- **`.env.main`** - Localhost development (main branch)
- **`.env.nginx`** - Nginx reverse proxy setup
- **`.env.network`** - Network-accessible deployment

### Automatic Secrets Loading

The system now supports automatic secret loading with clean file separation:

- **`.secrets`** - Contains your actual API keys and environment variables
- **`.gcp-key.json`** - Contains your GCP service account key (proper JSON file)
- Clean separation of concerns - env vars and JSON files where they belong

### Automated Setup Script

Use the `setup-env.sh` script to automatically configure the right environment:

```bash
# Auto-detect current branch and set up .env
./scripts/setup-env.sh

# Or specify a branch explicitly
./scripts/setup-env.sh nginx
```

The script will automatically:
1. Choose the right template for your branch
2. Load secrets from `.secrets` if it exists
3. Verify `.gcp-key.json` exists for Docker usage

## Usage

### When Switching Branches

```bash
# Switch to a different branch
git checkout codex/add-nginx-reverse-proxy

# Automatically configure the environment
./scripts/setup-env.sh

# Start services
docker-compose up
```

### Quick Start on Any Branch

```bash
git clone <repo>
cd webapp_starter_cursor
git checkout <your-branch>
# Set up secrets (one-time)
nano .secrets  # Add your actual API keys and GCP JSON
./scripts/setup-env.sh
docker-compose up
```

## Configuration Details

### Main Branch (Localhost)
```bash
REACT_APP_API_URL=http://localhost:8080/api
REACT_APP_OAUTH_ISSUER=http://localhost:5556
```

### Nginx Branch (Proxy)
```bash
REACT_APP_API_URL=http://auth.localhost/api
REACT_APP_OAUTH_ISSUER=http://auth.localhost/dex
```
+> **Important:** When running the *nginx* branch, always open the app at
+> `http://auth.localhost` (not plain `localhost`).  The canonical host
+> ensures browser cookies and OAuth redirect URIs match, so the first login
+> attempt succeeds without the state-mismatch error.

### Network Branch (Remote Access)
```bash
REACT_APP_API_URL=http://YOUR_LOCAL_IP:8080/api
REACT_APP_OAUTH_ISSUER=http://YOUR_LOCAL_IP:5556
```

## Advanced Usage

### Manual Template Management

```bash
# Copy a specific template
cp .env.main .env

# Create a new template for a new branch type
cp .env.main .env.newbranch
# Edit .env.newbranch for your specific needs
```

### Git Hooks Integration

Add to `.git/hooks/post-checkout`:

```bash
#!/bin/bash
# Auto-setup environment after branch checkout
./scripts/setup-env.sh
```

### Shell Aliases

Add to your `.zshrc` or `.bashrc`:

```bash
alias envsetup="./scripts/setup-env.sh"
alias envcheck="echo 'Current branch:' && git branch --show-current && echo 'Environment:' && head -3 .env"
```

## Troubleshooting

### Template Not Found
```bash
❌ Template .env.newbranch not found!
```
**Solution**: Create the template or use default with `./scripts/setup-env.sh main`

### Wrong Configuration After Branch Switch
```bash
# Check current setup
./scripts/setup-env.sh --check

# Force reconfigure
./scripts/setup-env.sh
```

### Network Branch IP Issues
```bash
# Script will auto-detect and offer to replace YOUR_LOCAL_IP
# Or manually find your IP
ifconfig | grep "inet " | grep -v 127.0.0.1
```

## Best Practices

1. **Always run `setup-env.sh` after branch switches**
2. **Keep templates updated** when infrastructure changes
3. **Don't commit actual API keys** - use placeholders in templates
4. **Test your setup** with `docker-compose up` after configuration
5. **Document branch-specific requirements** in template comments

## File Structure

```
webapp_starter_cursor/
├── .env                 # Active environment (not tracked)
├── .env.main           # Main branch template (tracked)
├── .env.nginx          # Nginx branch template (tracked) 
├── .env.network        # Network branch template (tracked)
├── .env.backup         # Auto-backup (not tracked)
├── .secrets            # Single file with API keys AND GCP JSON (not tracked)
├── .gcp-key.json       # Extracted GCP key for Docker (not tracked)
└── scripts/
    ├── setup-env.sh    # Auto-configuration script
    └── check-env.sh    # Environment status checker
```

## Secrets Management Workflow

1. **Create Secrets File**: Create `.secrets` with your API keys and GCP JSON
2. **Run Setup**: `./scripts/setup-env.sh` automatically loads secrets and extracts GCP key
3. **Check Status**: `./scripts/check-env.sh` shows what's configured
4. **Start Services**: `docker-compose up` uses the extracted keys

This system ensures consistent, reliable environment setup across all branches while maintaining security best practices. 