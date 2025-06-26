"""Shared test utilities and mock fixtures.
These help integration tests run in non-cloud CI where external SDKs are not configured.
"""

from unittest.mock import MagicMock
import contextlib

# --- Boto3 -----------------------------------------------------------

def mock_boto3_session():
    """Return a dummy boto3 Session mock that can stand in for real AWS calls."""
    session_mock = MagicMock(name="boto3_session_mock")
    # Common resources/clients can be stubbed to return MagicMock as well
    session_mock.client.return_value = MagicMock()
    session_mock.resource.return_value = MagicMock()
    return session_mock


# --- Gemini Live / Generative AI ------------------------------------

@contextlib.contextmanager
def mock_gemini_client():
    """Context manager that yields a mocked Gemini client instance."""
    yield MagicMock(name="gemini_client_mock")