# Local Development Tunnel (ngrok)

This project can be exposed to your local network (or the public Internet) with a **reserved ngrok domain**.  The domain chosen for development is:

```
https://civil-entirely-rooster.ngrok-free.app
```

## Prerequisites

1. Install the ngrok agent:  
   ```bash
   brew install ngrok/ngrok/ngrok   # macOS
   # or download from https://ngrok.com/download
   ```
2. Connect the agent to your ngrok account (one-time):  
   ```bash
   ngrok config add-authtoken <YOUR_AUTH_TOKEN>
   ```
3. Reserve the domain in the ngrok dashboard under **Reserved Domains** (free tier supports one `*.ngrok-free.app` domain).

## Starting the stack with a tunnel

```bash
# 1. Launch the containers
cd <repo-root>
docker-compose up -d

# 2. Start the tunnel (binds the reserved domain to localhost:80)
ngrok http 80 --domain=civil-entirely-rooster.ngrok-free.app
```

*Port 80* is the host port published by the Nginx reverse-proxy container.

## Why not `ngrok start web`?

If you have a **~/.ngrok/ngrok.yml** that defines a tunnel named `web`, you can simply run `ngrok start web`.  For example:

```yaml
version: "2"
tunnels:
  web:
    addr: 80
    proto: http
    domain: civil-entirely-rooster.ngrok-free.app
    schemes: [https]
```

The YAML lives outside the repository and is ignored via `.gitignore` (`ngrok.yml`).

## Environment variables

The fixed domain is already baked into:

* `.env` (developer-only file, not committed)
* `docker-compose.yml` (frontend & backend service overrides)
* `auth-config/dex-config.yml` (Dex redirect URI)

No additional steps are required after you start the tunnel. 