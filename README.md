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

### 2. Configure Environment

Choose a template for your `.env` file. For local development the `main` template is easiest:

```bash
cp .env.main .env
```

Edit `.env` and provide real values for:

- `REACT_APP_GEMINI_API_KEY` – API key from Google AI Studio
- `GCS_BUCKET_NAME` – your Cloud Storage bucket
- `SECRET_KEY` – Flask secret key
- OAuth variables if you enable sign‑in

If you keep secrets in a `.secrets` file, run the helper script to populate `.env` automatically:

```bash
./scripts/setup-env.sh
```

Place your Google Cloud service account JSON at `.gcp-key.json` so the backend can upload media.

### 3. Start the Stack

The easiest way to run everything is with the provided script. By default it uses the `proxy` profile which starts an nginx reverse proxy on port 80:

```bash
./scripts/start-app.sh
```

For direct access to each service you can start in `dev` mode instead:

```bash
./scripts/start-app.sh dev
```

After the containers finish building the application is available at one of:

- **Proxy mode:** [http://auth.localhost](http://auth.localhost)
- **Dev mode:** Frontend on [http://localhost:3000](http://localhost:3000) and backend API on [http://localhost:8080/api](http://localhost:8080/api)

To stop all containers run:

```bash
./scripts/stop-app.sh
```

## Using the Application

1. **Open the UI**
   - Proxy mode: [http://auth.localhost](http://auth.localhost)
   - Dev mode: [http://localhost:3000](http://localhost:3000)

2. **Chat**
   - Select or create a chat in the sidebar.
   - Type text in the input field and press **Enter** to send.
   - Use the attachment icon to upload images or videos; they are sent to the backend and included in the message.

3. **Live Sessions**
   - Click **Start Live** in the message input to open the live session modal.
   - Grant camera and microphone permissions when prompted.
   - When you disconnect, a **Live Session** placeholder appears in the chat.

4. **Playback**
   - Click **Play Session** on a placeholder message to view the recorded session with synchronized audio and video.


## Planning a Similar System

The key design ideas for this prototype are:

1. **Direct WebSocket Connection** – The browser communicates with Google using the user's API key. This avoids a heavy backend proxy and reduces latency.
2. **Ephemeral Token Service** – The backend provides short‑lived tokens so permanent keys are never exposed to the client.
3. **Separate Analytics Service** – All interaction data is sent to small logging endpoints (`/api/analytics/...`) for future analysis.
4. **Containerized Infrastructure** – Docker Compose orchestrates the web app, database, authentication server, and proxy, allowing profiles for different environments.
5. **Replay System** – Audio and video sent to the Live API are stored in GCS and can later be replayed to reproduce the session.

See `docs/docker-profiles.md` for details on the compose profiles and `docs/GEMINI_LIVE_DIRECT.md` for the direct connection design.

## Testing

Backend tests use `pytest` and frontend tests use `Jest`. Run them manually from the respective directories:

```bash
cd backend && pytest
cd ../frontend && npm test
```

## License

This project is licensed under the MIT License.
