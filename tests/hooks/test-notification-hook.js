#!/usr/bin/env node

/**
 * PocketBase Hook Validation Test
 *
 * This test validates that the notification hook is syntactically correct
 * and can be loaded without errors.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(50));
  log(title, 'cyan');
  console.log('='.repeat(50) + '\n');
}

function runTest(name, testFn) {
  try {
    testFn();
    log(`✓ ${name}`, 'green');
    return true;
  } catch (error) {
    log(`✗ ${name}`, 'red');
    log(`  ${error.message}`, 'red');
    return false;
  }
}

// Main test suite
async function runTests() {
  logSection('🧪 PocketBase Hook Validation Tests');

  const hookPath = path.join(__dirname, '../../pb_hooks/send_notifications.pb.js');
  let allTestsPassed = true;

  // Test 1: Hook file exists
  allTestsPassed &= runTest('Hook file exists', () => {
    if (!fs.existsSync(hookPath)) {
      throw new Error(`Hook file not found at: ${hookPath}`);
    }
  });

  // Test 2: Hook file is readable
  let hookContent;
  allTestsPassed &= runTest('Hook file is readable', () => {
    hookContent = fs.readFileSync(hookPath, 'utf-8');
    if (!hookContent || hookContent.length === 0) {
      throw new Error('Hook file is empty');
    }
  });

  // Test 3: Valid JavaScript syntax
  allTestsPassed &= runTest('Valid JavaScript syntax', () => {
    try {
      // Use Node.js to check syntax without executing
      execSync(`node --check "${hookPath}"`, { encoding: 'utf-8' });
    } catch (error) {
      throw new Error(`Syntax error: ${error.message}`);
    }
  });

  // Test 4: Contains required functions
  allTestsPassed &= runTest('Contains required functions', () => {
    const requiredFunctions = [
      'shouldSendNotification',
      'isSameDay',
      'formatEventDate',
      'sendEventNotifications',
      'checkAndSendEventNotifications',
    ];

    const missingFunctions = requiredFunctions.filter(
      (fn) => !hookContent.includes(`function ${fn}`)
    );

    if (missingFunctions.length > 0) {
      throw new Error(`Missing functions: ${missingFunctions.join(', ')}`);
    }
  });

  // Test 5: Contains PocketBase hooks
  allTestsPassed &= runTest('Contains PocketBase hooks', () => {
    const requiredHooks = ['onAfterBootstrap', 'cronAdd', 'routerAdd'];

    const missingHooks = requiredHooks.filter(
      (hook) => !hookContent.includes(hook)
    );

    if (missingHooks.length > 0) {
      throw new Error(`Missing PocketBase hooks: ${missingHooks.join(', ')}`);
    }
  });

  // Test 6: Environment variable checks
  allTestsPassed &= runTest('Checks for required environment variables', () => {
    const requiredEnvVars = [
      'VAPID_PUBLIC_KEY',
      'VAPID_PRIVATE_KEY',
      'VAPID_EMAIL',
    ];

    const missingVars = requiredEnvVars.filter(
      (envVar) => !hookContent.includes(envVar)
    );

    if (missingVars.length > 0) {
      throw new Error(`Missing env var checks: ${missingVars.join(', ')}`);
    }
  });

  // Test 7: Contains error handling
  allTestsPassed &= runTest('Contains proper error handling', () => {
    const errorHandlingPatterns = ['try', 'catch', 'console.error'];

    const missingPatterns = errorHandlingPatterns.filter(
      (pattern) => !hookContent.includes(pattern)
    );

    if (missingPatterns.length > 0) {
      throw new Error(`Missing error handling: ${missingPatterns.join(', ')}`);
    }
  });

  // Test 8: Cron schedule is valid
  allTestsPassed &= runTest('Cron schedule is valid', () => {
    // Check for cron pattern: '0 9 * * *' (daily at 9 AM)
    const cronPattern = /'0 9 \* \* \*'/;
    if (!cronPattern.test(hookContent)) {
      throw new Error('Expected cron schedule "0 9 * * *" not found');
    }
  });

  // Test 9: Uses web-push library
  allTestsPassed &= runTest('Uses web-push library', () => {
    if (!hookContent.includes('web-push')) {
      throw new Error('web-push library not referenced');
    }
    if (!hookContent.includes('setVapidDetails')) {
      throw new Error('setVapidDetails not called');
    }
    if (!hookContent.includes('sendNotification')) {
      throw new Error('sendNotification not called');
    }
  });

  // Test 10: Handles notification preferences
  allTestsPassed &= runTest('Handles all notification preferences', () => {
    const preferences = ['day_of', 'day_before', 'week_before'];

    const missingPrefs = preferences.filter(
      (pref) => !hookContent.includes(pref)
    );

    if (missingPrefs.length > 0) {
      throw new Error(`Missing notification preferences: ${missingPrefs.join(', ')}`);
    }
  });

  // Test 11: Handles recurring events
  allTestsPassed &= runTest('Handles recurring yearly events', () => {
    if (!hookContent.includes('recurring_yearly')) {
      throw new Error('recurring_yearly handling not found');
    }
  });

  // Test 12: Creates notification records
  allTestsPassed &= runTest('Creates notification records in DB', () => {
    if (!hookContent.includes('notifications')) {
      throw new Error('notifications collection not referenced');
    }
    if (!hookContent.includes('saveRecord')) {
      throw new Error('saveRecord not called');
    }
  });

  // Test 13: Test endpoint exists
  allTestsPassed &= runTest('Test endpoint exists', () => {
    if (!hookContent.includes('/api/send-test-notification')) {
      throw new Error('Test endpoint not found');
    }
    if (!hookContent.includes('requireAdminAuth')) {
      throw new Error('Admin auth not required for test endpoint');
    }
  });

  // Test 14: File size is reasonable
  allTestsPassed &= runTest('File size is reasonable', () => {
    const stats = fs.statSync(hookPath);
    const fileSizeKB = stats.size / 1024;

    if (fileSizeKB < 5) {
      throw new Error(`File too small (${fileSizeKB.toFixed(2)} KB) - might be incomplete`);
    }
    if (fileSizeKB > 100) {
      throw new Error(`File too large (${fileSizeKB.toFixed(2)} KB) - might need refactoring`);
    }

    log(`  File size: ${fileSizeKB.toFixed(2)} KB`, 'blue');
  });

  // Summary
  logSection('📊 Test Summary');

  if (allTestsPassed) {
    log('✅ All tests passed!', 'green');
    log('\nThe notification hook is ready to use.', 'cyan');
    log('\nNext steps:', 'yellow');
    log('1. Set environment variables: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL', 'yellow');
    log('2. Install web-push in PocketBase: cd pocketbase && npm install web-push', 'yellow');
    log('3. Restart PocketBase to load the hook', 'yellow');
    log('4. Check logs for "Event notifications system initialized"', 'yellow');
    log('5. Test with: POST /api/send-test-notification (requires admin auth)', 'yellow');
    process.exit(0);
  } else {
    log('\n❌ Some tests failed!', 'red');
    log('Please fix the issues above and try again.', 'red');
    process.exit(1);
  }
}

// Run the tests
runTests().catch((error) => {
  log('\n❌ Test suite error:', 'red');
  console.error(error);
  process.exit(1);
});
