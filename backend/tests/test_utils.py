"""Shim module so that imports via backend.tests path also resolve"""

from importlib import import_module
globals().update(import_module('tests.test_utils').__dict__)

# Shared test utilities for backend integration tests inside backend/tests
from unittest.mock import MagicMock
import contextlib

__all__ = [
    'mock_boto3_session',
    'mock_gemini_client',
]

def mock_boto3_session():
    """Return a dummy boto3 Session mock that can stand in for real AWS calls."""
    session_mock = MagicMock(name="boto3_session_mock")
    session_mock.client.return_value = MagicMock()
    session_mock.resource.return_value = MagicMock()
    return session_mock

@contextlib.contextmanager
def mock_gemini_client():
    """Context manager that yields a mocked Gemini client instance."""
    yield MagicMock(name="gemini_client_mock")