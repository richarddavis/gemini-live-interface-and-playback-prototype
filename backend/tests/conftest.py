"""Pytest fixtures for backend tests.

This module defines reusable fixtures that simplify writing unit and
integration tests for the Flask backend.  Importing `pytest` here avoids
"import could not be resolved" linter warnings in the test modules that
reference the global ``pytestmark`` variable.
"""

import pytest

from app import create_app, db
from app.models import User


@pytest.fixture
def app():
    """Create and configure a new app instance for each test session."""
    app = create_app("testing")

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    """A test client for the app."""
    return app.test_client()


@pytest.fixture
def user(app):
    """A persisted user that can be associated with a login session."""
    test_user = User(email="test@example.com", username="testuser")
    db.session.add(test_user)
    db.session.commit()
    return test_user


@pytest.fixture
def client_logged_in(client, user):
    """A test client with an authenticated user session."""
    with client.session_transaction() as sess:
        sess["user_id"] = user.id
        sess["logged_in"] = True

    yield client