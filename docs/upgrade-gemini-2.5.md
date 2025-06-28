# Gemini API Upgrade – June 2025

This project was updated on **2025-06-28** to align with the latest Google Gemini 2.5 GA release and the v1beta Live API.

## What changed?

| Area | Old | New |
|------|-----|-----|
| Live API WebSocket endpoint | `…v1alpha.GenerativeService.BidiGenerateContentConstrained` | `…v1beta.GenerativeService.BidiGenerateContent` |
| Python SDK version | implicit, `google-genai <0.11` | `google-genai >=0.12.0` |
| Backend client | `http_options={'api_version':'v1alpha'}` | `http_options={'api_version':'v1beta'}` |
| Database | `task` table | **Removed** (unused) |
| REST API | `/tasks*` routes | **Removed** (unused) |

## How to deploy the upgrade

1. **Pull latest code** and rebuild images:
   ```bash
   git pull origin main
   docker compose build
   ```
2. **Apply DB migration** (drops the now-unused `task` table):
   ```bash
   docker compose run --rm backend flask db upgrade
   ```
   The backend container also executes `flask db upgrade` automatically on normal start-up, so a simple `docker compose up` is enough for fresh environments.
3. **(Optional) rotate model**: set a different default at runtime with
   ```bash
   GEMINI_DEFAULT_MODEL=models/gemini-2.5-pro docker compose up
   ```
4. **Run dev stack**
   ```bash
   scripts/start-app.sh dev
   ```
   Open http://localhost:3000, start a live session – the Network tab should show the WebSocket connecting to `…v1beta…BidiGenerateContent`.

## FAQ

* **Why drop the `task` table?**  The task CRUD endpoint was a scaffold used early in development.  No code or UI has referenced it for months, so keeping it just incurred schema maintenance overhead.
* **Will older tokens still work?**  Yes, the Ephemeral-Token endpoint remains unchanged.  Only the client now points at the v1beta WebSocket once it receives the token.
* **Can we revert?**  Run `flask db downgrade` to roll back the migration (the downgrade re-creates the `task` table).  The codebase, however, no longer exposes the routes.