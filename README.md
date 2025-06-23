# Gemini Live Interface and Playback Prototype

A proof-of-concept chat system integrating the Google Gemini Live API. The frontend connects directly to the Live API over WebSocket while a Flask backend handles authentication, data storage, and analytics. Docker Compose manages the supporting services.

## Architecture

The application is split into several components:

- **React Frontend** (`frontend/`)
  - Connects to the Gemini Live API using a secure WebSocket.
  - Records microphone and camera streams and sends them directly to Google.
  - Provides a modern chat UI with optional session replay.

- **Flask Backend** (`backend/`)
  - Exposes REST endpoints for tasks, chat sessions, file uploads, and interaction logs.
  - Issues ephemeral tokens for the Live API to avoid exposing long-lived keys.
  - Stores data in **PostgreSQL** and uploads media to **Google Cloud Storage**.
  - Integrates with **Dex** for OAuth based authentication.

- **Nginx Reverse Proxy** (`proxy` profile)
  - Serves the React application and routes `/api` calls to Flask.
  - Used for production‑like local development.

- **Docker Compose**
  - Launches the frontend, backend, database, authentication service, and optional proxy.
  - Profiles allow switching between `dev`, `proxy`, and `ngrok` modes (see below).

The Live API connection is completely client side. Only analytics and uploads go through the Flask service. The direct connection design is documented in `docs/GEMINI_LIVE_DIRECT.md`:

```
Frontend ↔ WebSocket ↔ Google Gemini Live API
   ↓
Backend (Analytics Only)
```

## Repository Layout

```
backend/     - Flask application
frontend/    - React application
auth-config/ - Dex OAuth configuration
scripts/     - Helper scripts (start-app.sh, setup-env.sh, etc.)
nginx/       - Reverse proxy configuration
docker-compose*.yml - Container definitions
```

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-user/gemini-live-interface-and-playback-prototype.git
cd gemini-live-interface-and-playback-prototype
```

### 2. Configure Environment (zero-touch)

`./scripts/start-app.sh` **auto-generates a fresh `.env`** on *every* launch, picking the right template for the current git branch. Required credentials should live in a **`.secrets`** file (ignored by git) with simple `KEY=value` lines, for example:

```ini
REACT_APP_GEMINI_API_KEY=sk-********************************
GCS_BUCKET_NAME=my-bucket
SECRET_KEY=change-me
```

When `.env` is regenerated the script merges any matching keys from `.secrets`, keeping them out of version control.

Place your Google Cloud service-account JSON at `.gcp-key.json`; the backend container mounts it automatically.

**Switching Gemini models**  
Quick experiments:

```bash
./scripts/start-app.sh dev --model gemini-1.5-flash-latest   # one-off override
```

The flag patches `.env` for the current run.  For a permanent change, put the line in `.secrets`:

```ini
GEMINI_DEFAULT_MODEL=gemini-1.5-flash-latest
```

The backend prints the active model on startup so you can confirm which one is loaded.

### 3. Start the Stack

The easiest way to run everything is with the provided script. By default it uses the `