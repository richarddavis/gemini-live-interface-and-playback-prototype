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
Set `GEMINI_DEFAULT_MODEL` in `.secrets` (or any other env) to try different chat models, e.g.:

```ini
GEMINI_DEFAULT_MODEL=gemini-1.5-flash-latest   # forces the legacy model
```  
The backend prints the active model on startup so you can confirm the override.

You can also override per run without editing files:

```bash
./scripts/start-app.sh dev --model=models/gemini-2.0-flash
```

### 3. Start the Stack

The easiest way to run everything is with the provided script. By default it uses the `proxy` profile which starts an nginx reverse proxy on port 80:

```bash
./scripts/start-app.sh
```

Alternate modes:

| Mode | Command | Ports / URL(s) | Typical use |
|------|---------|----------------|--------------|
| dev  | `./scripts/start-app.sh dev` | Front-end `3000`, Back-end `8080`, Dex `5556` | Iterating on React / Flask code |
| proxy (default) | `./scripts/start-app.sh` | nginx on `80` → [http://auth.localhost](http://auth.localhost) | "Production-like" local run |
| ngrok | `./scripts/start-app.sh ngrok` | public HTTPS via reserved ngrok domain | Sharing demos outside your LAN |

To stop all containers:

```bash
./scripts/stop-app.sh
```

### 4. Using the Application

1. **Open the UI**
   * Proxy mode: [http://auth.localhost](http://auth.localhost)
   * Dev mode: [http://localhost:3000](http://localhost:3000)

2. **Chat**
   * Select or create a chat in the sidebar.
   * Type text and hit **Enter**.
   * Use the attachment icon to upload images or videos.

3. **Live Sessions**
   * Click **Start Live** to open the live session modal.
   * Grant camera + mic permissions.
   * When you disconnect, a **Live Session** placeholder appears in chat.

4. **Playback**
   * Click **Play Session** on a placeholder to view the recorded media.

---

## Planning a Similar System

Key design ideas:

1. **Direct WebSocket Connection** – Browser talks to Google; backend sees only analytics.
2. **Ephemeral Token Service** – Short-lived tokens keep permanent keys off the client.
3. **Separate Analytics Service** – Minimal logging endpoints for later analysis.
4. **Containerized Infrastructure** – Compose orchestrates everything with swap-able profiles.
5. **Replay System** – Media stored in GCS can be replayed to reproduce sessions.

See `docs/docker-profiles.md` for profile details and `docs/GEMINI_LIVE_DIRECT.md` for the direct connection design.

---

## Testing

Backend tests use `pytest` and frontend tests use `Jest`:

```bash
cd backend && pytest
cd ../frontend && npm test
```

---

## License

MIT

## New in 2025 — Real-time Audio Transcription 🎙️
The Live chat modal now supports **bidirectional speech-to-text** using Gemini's 2.5 Flash Live models.

### How it works
1. When a live session starts the frontend includes `inputAudioTranscription` and `outputAudioTranscription` keys in the WebSocket *setup* message.
2. The Gemini server streams back `inputTranscription` and `outputTranscription` events.  These appear inline in the chat as grey subtitle bubbles.
3. No server resources are required—transcription is handled entirely by Gemini.

### Selecting the Live model
The default Live model is **`models/gemini-live-2.5-flash-preview`** (half-cascade audio, supports transcription).  You can override it for testing:

```ini
# .secrets or .env
REACT_APP_GEMINI_LIVE_MODEL=models/gemini-live-2.5-flash-preview-native-audio-dialog  # native audio
```

### Quick test (Docker)
```bash
# Development profile
./scripts/start-app.sh dev

# In the UI click **Start Live** > speak – subtitles should appear in real-time.
```

The feature works in **all Compose profiles** (`dev`, `proxy`, `ngrok`) because it's purely frontend-side.

### Unit test
A Jest test verifies that enabling transcription adds the required fields to the setup message:

```js
import { buildSetupMessage } from 'components/GeminiLiveDirect';

test('setup includes transcription keys', () => {
  const msg = buildSetupMessage();
  expect(msg.setup.inputAudioTranscription).toEqual({});
  expect(msg.setup.outputAudioTranscription).toEqual({});
});
```

Run with `npm test -- -t transcription` inside `frontend/`.