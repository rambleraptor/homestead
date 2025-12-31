# Auto-Update Testing

This directory contains tests for the HomeOS auto-update system.

## Overview

The auto-update system consists of:

1. **`deployment/deploy.sh`** - Main deployment script with `--auto` flag support
2. **`deployment/setup-auto-update.sh`** - Sets up systemd service and timer
3. **`deployment/systemd/`** - Template systemd service/timer files (for reference only)

## Running Tests

### Quick Test

Run the comprehensive test suite:

```bash
./tests/deployment/test-auto-update.sh
```

This will run 18 different tests covering:
- Script existence and permissions
- Command-line argument parsing
- Error handling and logging
- Update detection logic
- Migration and frontend change detection
- Rollback mechanisms
- Database backup functionality
- Systemd service generation
- Environment variable support
- Documentation and templates

### Expected Output

```
╔════════════════════════════════════════╗
║  HomeOS Auto-Update Test Suite        ║
╚════════════════════════════════════════╝

========================================
TEST: Deploy script exists and is executable
========================================
✅ PASS: deploy.sh exists and is executable

[... more tests ...]

========================================
TEST SUMMARY
========================================
Total tests: 18
Passed: 18
Failed: 0

🎉 All tests passed!
```

## What Gets Tested

### Script Validation Tests

1. **File existence** - Verifies all required scripts exist
2. **Permissions** - Ensures scripts are executable
3. **Argument parsing** - Validates `--auto` and `--force` flags work
4. **Error handling** - Checks for `set -e` and proper error handling

### Functionality Tests

5. **Logging** - Verifies log function exists and is used
6. **Update detection** - Checks git fetch and commit comparison logic
7. **Migration detection** - Validates detection of `pb_migrations/` changes
8. **Frontend detection** - Validates detection of `frontend/` changes
9. **Dependency detection** - Checks for `package.json` change detection

### Safety Tests

10. **Rollback mechanism** - Ensures rollback logic exists
11. **Database backups** - Verifies backup creation before migrations
12. **Root privileges** - Checks setup script requires sudo

### Configuration Tests

13. **Systemd generation** - Validates service/timer file creation
14. **Template files** - Ensures template files exist and are documented
15. **Environment variables** - Tests `DEPLOY_BRANCH` and `DEPLOY_LOG_FILE` support

### Quality Tests

16. **No redundant code** - Ensures no duplicate wrapper scripts exist
17. **Up-to-date handling** - Validates "already up to date" scenario
18. **Helpful output** - Checks setup script provides clear instructions

## Test Architecture

The test suite uses:

- **Static analysis** - Greps scripts for expected patterns
- **No mocking required** - Tests verify script structure, not runtime behavior
- **Fast execution** - All tests run in under 1 second
- **Clear output** - Color-coded pass/fail with detailed error messages

## Why These Tests?

The auto-update system is critical infrastructure that:

1. **Runs unattended** - Errors may go unnoticed
2. **Modifies production** - Mistakes can break the system
3. **Handles data** - Must safely backup databases before migrations
4. **Manages services** - Must gracefully restart PocketBase and frontend

These tests provide confidence that:

- The scripts have all required functionality
- Error handling and rollback mechanisms exist
- Configuration is properly templated
- Documentation is clear and accurate

## Limitations

These tests verify **script structure and logic**, not **runtime behavior**.

**What IS tested:**
- ✅ Scripts exist and are executable
- ✅ Required functions and variables are defined
- ✅ Git operations are present in the code
- ✅ Rollback and backup logic exists
- ✅ Environment variables are supported

**What is NOT tested:**
- ❌ Actual git operations (fetch, reset, etc.)
- ❌ Systemd service management
- ❌ File system operations
- ❌ Network connectivity
- ❌ PocketBase migration execution

For full integration testing, manual testing is required:

1. Set up the auto-update system with `sudo make setup-auto-update`
2. Monitor the logs with `sudo journalctl -u homeos-auto-update.service -f`
3. Verify updates are detected and applied correctly
4. Test rollback by introducing a failing migration

## Adding New Tests

To add a new test:

1. Create a function named `test_*` in `test-auto-update.sh`
2. Use `print_test_header`, `print_success`, and `print_failure` for output
3. Return 0 for success, 1 for failure
4. Call your test function in the `main()` function
5. Update this README with the new test description

Example:

```bash
test_new_feature() {
  print_test_header "New feature works correctly"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/deploy.sh"

  if grep -q "NEW_FEATURE" "$SCRIPT_PATH"; then
    print_success "New feature is implemented"
  else
    print_failure "New feature" "Feature not found in script"
    return 1
  fi
}
```

## Maintenance

Run these tests:

- Before committing changes to deployment scripts
- Before releasing new versions
- When modifying auto-update logic
- As part of CI/CD pipeline

The test suite should always pass. If tests fail after changes, either:

1. Fix the scripts to match expected behavior, OR
2. Update the tests if the expected behavior changed intentionally

## Related Documentation

- [Deployment README](../../deployment/README.md) - Full deployment documentation
- [CLAUDE.md](../../CLAUDE.md) - Development guidelines including PR requirements
