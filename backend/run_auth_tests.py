#!/usr/bin/env python3
"""
Authentication system test runner
Runs comprehensive tests for the authentication service and API routes
"""

import unittest
import sys
import os

# Add the app directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

# Import test modules
from tests.test_auth_service import TestAuthService
from tests.test_auth_routes import TestAuthRoutes


def run_auth_tests():
    """Run all authentication tests"""
    
    # Create test suite
    test_suite = unittest.TestSuite()
    
    # Add AuthService tests
    test_suite.addTest(unittest.makeSuite(TestAuthService))
    
    # Add Auth Routes tests  
    test_suite.addTest(unittest.makeSuite(TestAuthRoutes))
    
    # Run tests with verbose output
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)
    
    # Print summary
    print(f"\n{'='*60}")
    print("AUTHENTICATION SYSTEM TEST SUMMARY")
    print(f"{'='*60}")
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Success rate: {((result.testsRun - len(result.failures) - len(result.errors)) / result.testsRun * 100):.1f}%")
    
    if result.failures:
        print(f"\nFAILURES ({len(result.failures)}):")
        for test, traceback in result.failures:
            print(f"  - {test}")
    
    if result.errors:
        print(f"\nERRORS ({len(result.errors)}):")
        for test, traceback in result.errors:
            print(f"  - {test}")
    
    # Return exit code
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    exit_code = run_auth_tests()
    sys.exit(exit_code) 