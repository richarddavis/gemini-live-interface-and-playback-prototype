"""Test utility stubs.

These helpers existed in an earlier iteration of the code-base and are still
imported by some legacy integration tests.  To keep those tests importable we
provide minimal stub implementations that do nothing beyond satisfying the
symbol references.
"""


def mock_boto3_session(*args, **kwargs):  # noqa: D401, D403
    """Return a dummy context manager that does nothing."""
    class _DummySession:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            return False

    return _DummySession()


def mock_gemini_client(*args, **kwargs):  # noqa: D401, D403
    """Return an object with a minimal interface used in the tests."""
    class _DummyGemini:
        def generate(self, *a, **kw):
            return {"response": "dummy"}

    return _DummyGemini()