# Analytics API Endpoints

The backend exposes a lightweight set of endpoints for tracking usage of the Gemini Live features. They are implemented in [`backend/app/api/analytics_routes.py`](../backend/app/api/analytics_routes.py).

| Endpoint | Method | Description |
| -------- | ------ | ----------- |
| `/api/analytics/health` | `GET` | Health check for the analytics service. |
| `/api/analytics/log-session-start` | `POST` | Log when a Live API session begins. |
| `/api/analytics/log-session-end` | `POST` | Log when a Live API session ends. |
| `/api/analytics/log-interaction` | `POST` | Record a user interaction (text, audio, video). |
| `/api/analytics/stats` | `GET` | Retrieve aggregate usage statistics. |

These endpoints simply log data to the server logs today, but can be extended to store analytics in a database.
