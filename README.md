# Full Stack Starter App

A containerized starter application with:
- React frontend
- Flask backend
- PostgreSQL database

This starter app implements a simple task manager to demonstrate CRUD operations across the full stack.

## Features

- **React Frontend**: Modern UI with state management
- **Flask Backend**: RESTful API with SQLAlchemy ORM
- **PostgreSQL**: Relational database
- **Docker**: Containerized for easy setup and deployment
- **Flask-Migrate**: For database schema migrations
- **Sample Application**: Task manager with CRUD operations

## Prerequisites

- [Docker](https://www.docker.com/get-started) and Docker Compose
- [Git](https://git-scm.com/downloads)

## Getting Started

1. Clone the repository:
   ```
   git clone <your-repo-url>
   cd webapp_starter_cursor
   ```

2. Start the application:
   ```
   docker-compose up --build
   ```
   The first time you run this, or after pulling changes that include new database migrations, the `flask db upgrade` command will run automatically to update your database schema.

3. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5001/api

## Project Structure

```
.
├── frontend/              # React frontend
├── backend/               # Flask backend
│   ├── app/               # Application package
│   │   ├── api/           # API routes
│   │   ├── models.py      # Database models
│   │   └── __init__.py    # App factory
│   ├── migrations/        # Flask-Migrate migration scripts
│   ├── alembic.ini        # Alembic configuration
│   ├── requirements.txt   # Python dependencies
│   ├── manage.py          # Script for DB migrations and other commands
│   └── wsgi.py            # WSGI entry point
└── docker-compose.yml     # Docker configuration
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/tasks` - Get all tasks
- `GET /api/tasks/:id` - Get a specific task
- `POST /api/tasks` - Create a new task
- `PUT /api/tasks/:id` - Update a task
- `DELETE /api/tasks/:id` - Delete a task

## Development

### Frontend

The React frontend is in the `frontend` directory. During development, it runs on port 3000.

```
cd frontend
npm install
npm start
```

### Backend

The Flask backend is in the `backend` directory.
```
cd backend
pip install -r requirements.txt
# For running the dev server (migrations will be handled by docker-compose on startup)
flask run --host=0.0.0.0 --port=5001
```

## Database Migrations (Flask-Migrate)

This project uses Flask-Migrate to handle database schema changes.

1.  **Modify Models**: Make changes to your SQLAlchemy models in `backend/app/models.py`.
2.  **Generate a New Migration Script**:
    Run the following command inside the backend container or a local environment with dependencies installed:
    ```bash
    # If inside the running backend container:
    # docker-compose exec backend flask db migrate -m "Your descriptive migration message"

    # Or, if you have a local Python environment for the backend:
    # cd backend
    # flask db migrate -m "Your descriptive migration message"
    ```
    This will generate a new script in `backend/migrations/versions/`.
3.  **Review the Migration Script**: Check the generated script to ensure it correctly reflects your changes.
4.  **Apply Migrations**: 
    The `flask db upgrade` command is run automatically when you start the services with `docker-compose up`. 
    If you need to apply migrations manually to a running instance (e.g., for a staging/production environment outside Docker Compose, or if you want to apply them to the Docker instance without restarting everything):
    ```bash
    # If inside the running backend container:
    # docker-compose exec backend flask db upgrade

    # Or, if you have a local Python environment for the backend connected to the DB:
    # cd backend
    # flask db upgrade
    ```

### Initializing Migrations (One-time setup - Already done for this starter)
If you were starting from scratch *without* an existing `migrations` directory:
```bash
# cd backend
# flask db init  # This creates the migrations directory and configuration
```

## Customizing

This starter app is designed to be a foundation for your own projects:

1. Modify the database models in `backend/app/models.py`
2. Follow the Database Migrations section above to update your schema.
3. Update API endpoints in `backend/app/api/routes.py`
4. Customize the React components in `frontend/src`

## License

MIT 