#!/usr/bin/env node

/**
 * Frontend Authentication Test Runner
 * Runs all authentication-related tests for Phase 5A components
 */

const { spawn } = require('child_process');
const path = require('path');

// ANSI color codes for output formatting
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function printHeader() {
  console.log(colors.cyan + colors.bold + '=' .repeat(60));
  console.log('FRONTEND AUTHENTICATION TESTS - PHASE 5A');
  console.log('=' .repeat(60) + colors.reset);
  console.log();
}

function printTestSuite(suiteName) {
  console.log(colors.blue + colors.bold + `🧪 Running ${suiteName}...` + colors.reset);
  console.log(colors.blue + '-'.repeat(50) + colors.reset);
}

function printSuccess(message) {
  console.log(colors.green + '✅ ' + message + colors.reset);
}

function printError(message) {
  console.log(colors.red + '❌ ' + message + colors.reset);
}

function printWarning(message) {
  console.log(colors.yellow + '⚠️  ' + message + colors.reset);
}

function runTest(testFile, testName) {
  return new Promise((resolve) => {
    const testCommand = 'npm';
    const testArgs = ['test', '--', '--testPathPattern=' + testFile, '--verbose', '--silent'];
    
    printTestSuite(testName);
    
    const testProcess = spawn(testCommand, testArgs, {
      cwd: process.cwd(),
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    testProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    testProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    testProcess.on('close', (code) => {
      if (code === 0) {
        printSuccess(`${testName} tests passed`);
        
        // Parse and display test results
        const lines = stdout.split('\n');
        const passedLine = lines.find(line => line.includes('passed'));
        if (passedLine) {
          console.log(colors.green + '  ' + passedLine.trim() + colors.reset);
        }
        
        resolve({ success: true, testName, output: stdout });
      } else {
        printError(`${testName} tests failed`);
        
        // Show error output
        if (stderr) {
          console.log(colors.red + stderr + colors.reset);
        }
        
        resolve({ success: false, testName, output: stderr || stdout });
      }
      console.log();
    });
  });
}

async function runAllTests() {
  printHeader();
  
  const tests = [
    { file: 'authService.test.js', name: 'AuthService API Tests' },
    { file: 'AuthContext.test.js', name: 'AuthContext State Management Tests' },
    { file: 'AuthWidget.test.js', name: 'AuthWidget Component Tests' },
    { file: 'OAuthCallback.test.js', name: 'OAuthCallback Component Tests' },
    { file: 'AppRouter.test.js', name: 'AppRouter Routing Tests' }
  ];

  const results = [];
  
  for (const test of tests) {
    const result = await runTest(test.file, test.name);
    results.push(result);
  }

  // Print summary
  console.log(colors.cyan + colors.bold + '=' .repeat(60));
  console.log('FRONTEND AUTHENTICATION TEST SUMMARY');
  console.log('=' .repeat(60) + colors.reset);
  
  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`${colors.bold}Tests run: ${results.length}${colors.reset}`);
  console.log(`${colors.green}Passed: ${passed.length}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed.length}${colors.reset}`);
  
  if (failed.length > 0) {
    console.log(`${colors.red}Success rate: ${((passed.length / results.length) * 100).toFixed(1)}%${colors.reset}`);
    console.log();
    console.log(colors.red + colors.bold + 'FAILED TESTS:' + colors.reset);
    failed.forEach(f => {
      console.log(`${colors.red}  ❌ ${f.testName}${colors.reset}`);
    });
  } else {
    console.log(`${colors.green}Success rate: 100.0%${colors.reset}`);
    console.log();
    console.log(colors.green + colors.bold + '🎉 ALL AUTHENTICATION TESTS PASSED!' + colors.reset);
    console.log(colors.green + 'Phase 5A authentication components are fully tested and working.' + colors.reset);
  }
  
  console.log();
  console.log(colors.cyan + '=' .repeat(60) + colors.reset);
  
  // Exit with appropriate code
  process.exit(failed.length > 0 ? 1 : 0);
}

// Check if we're in the right directory
if (!require('fs').existsSync('package.json')) {
  printError('Please run this script from the frontend directory');
  process.exit(1);
}

// Run the tests
runAllTests().catch(error => {
  printError('Test runner failed: ' + error.message);
  process.exit(1);
}); 