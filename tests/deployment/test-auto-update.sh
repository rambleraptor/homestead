#!/bin/bash
# HomeOS Auto-Update Test Suite
# Tests the auto-update functionality without requiring systemd setup

# Note: We don't use 'set -e' here because tests are expected to fail sometimes

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test output
print_test_header() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}TEST: $1${NC}"
  echo -e "${BLUE}========================================${NC}"
}

print_success() {
  echo -e "${GREEN}✅ PASS: $1${NC}"
  ((TESTS_PASSED++))
  ((TESTS_RUN++))
}

print_failure() {
  echo -e "${RED}❌ FAIL: $1${NC}"
  echo -e "${RED}   $2${NC}"
  ((TESTS_FAILED++))
  ((TESTS_RUN++))
}

print_summary() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}TEST SUMMARY${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo -e "Total tests: $TESTS_RUN"
  echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
  if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
  else
    echo -e "${GREEN}Failed: $TESTS_FAILED${NC}"
  fi
  echo ""

  if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    return 0
  else
    echo -e "${RED}💥 Some tests failed${NC}"
    return 1
  fi
}

# Setup test environment
setup_test_env() {
  print_test_header "Setting up test environment"

  # Create temporary directory
  TEST_DIR=$(mktemp -d)
  echo "Test directory: $TEST_DIR"

  # Create fake git repo
  cd "$TEST_DIR"
  git init -b main
  git config user.email "test@example.com"
  git config user.name "Test User"

  # Create basic structure
  mkdir -p frontend pb_migrations
  echo '{"name": "test"}' > frontend/package.json
  echo "console.log('test');" > frontend/index.js

  # Initial commit
  git add .
  git commit -m "Initial commit"

  # Setup simulated remote
  REMOTE_DIR=$(mktemp -d)
  cd "$REMOTE_DIR"
  git init -b main --bare

  cd "$TEST_DIR"
  git remote add origin "$REMOTE_DIR"
  git push -u origin main

  echo -e "${GREEN}✅ Test environment ready${NC}"
  echo "Test dir: $TEST_DIR"
  echo "Remote dir: $REMOTE_DIR"
}

cleanup_test_env() {
  if [ -n "$TEST_DIR" ] && [ -d "$TEST_DIR" ]; then
    rm -rf "$TEST_DIR"
  fi
  if [ -n "$REMOTE_DIR" ] && [ -d "$REMOTE_DIR" ]; then
    rm -rf "$REMOTE_DIR"
  fi
}

# Test 1: Check deploy.sh script exists and is executable
test_deploy_script_exists() {
  print_test_header "Deploy script exists and is executable"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/deploy.sh"

  if [ ! -f "$SCRIPT_PATH" ]; then
    print_failure "Script exists" "deploy.sh not found at $SCRIPT_PATH"
    return 1
  fi

  if [ ! -x "$SCRIPT_PATH" ]; then
    print_failure "Script is executable" "deploy.sh is not executable"
    return 1
  fi

  print_success "deploy.sh exists and is executable"
}

# Test 2: Check setup-auto-update.sh exists and is executable
test_setup_script_exists() {
  print_test_header "Setup script exists and is executable"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/setup-auto-update.sh"

  if [ ! -f "$SCRIPT_PATH" ]; then
    print_failure "Script exists" "setup-auto-update.sh not found at $SCRIPT_PATH"
    return 1
  fi

  if [ ! -x "$SCRIPT_PATH" ]; then
    print_failure "Script is executable" "setup-auto-update.sh is not executable"
    return 1
  fi

  print_success "setup-auto-update.sh exists and is executable"
}

# Test 3: Verify deploy.sh accepts --auto flag
test_auto_flag_parsing() {
  print_test_header "Deploy script accepts --auto flag"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/deploy.sh"

  # Test that script recognizes --auto flag (will fail due to no git, but should parse arg)
  if grep -q "AUTO_MODE" "$SCRIPT_PATH" && grep -q -- "--auto" "$SCRIPT_PATH"; then
    print_success "Script has --auto flag support"
  else
    print_failure "--auto flag support" "Script doesn't appear to support --auto flag"
    return 1
  fi
}

# Test 4: Verify deploy.sh has proper error handling
test_error_handling() {
  print_test_header "Deploy script has error handling"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/deploy.sh"

  # Check for set -e (exit on error)
  if grep -q "^set -e" "$SCRIPT_PATH"; then
    print_success "Script has 'set -e' for error handling"
  else
    print_failure "Error handling" "Script missing 'set -e'"
    return 1
  fi
}

# Test 5: Verify deploy.sh has logging
test_logging() {
  print_test_header "Deploy script has logging functionality"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/deploy.sh"

  # Check for log function
  if grep -q "^log()" "$SCRIPT_PATH"; then
    print_success "Script has logging function"
  else
    print_failure "Logging" "Script missing log() function"
    return 1
  fi
}

# Test 6: Verify deploy.sh checks for updates in auto mode
test_update_check_logic() {
  print_test_header "Deploy script checks for updates in auto mode"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/deploy.sh"

  # Check for git fetch in auto mode
  if grep -q "git fetch" "$SCRIPT_PATH"; then
    print_success "Script fetches updates from remote"
  else
    print_failure "Update check" "Script doesn't fetch from remote"
    return 1
  fi

  # Check for commit comparison
  if grep -q "REMOTE_COMMIT" "$SCRIPT_PATH" && grep -q "PREVIOUS_COMMIT" "$SCRIPT_PATH"; then
    print_success "Script compares commits to detect updates"
  else
    print_failure "Commit comparison" "Script doesn't compare commits"
    return 1
  fi
}

# Test 7: Verify deploy.sh detects migration changes
test_migration_detection() {
  print_test_header "Deploy script detects migration changes"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/deploy.sh"

  # Check for migration detection
  if grep -q "pb_migrations" "$SCRIPT_PATH" && grep -q "MIGRATIONS_CHANGED" "$SCRIPT_PATH"; then
    print_success "Script detects migration changes"
  else
    print_failure "Migration detection" "Script doesn't detect migration changes"
    return 1
  fi
}

# Test 8: Verify deploy.sh detects frontend changes
test_frontend_detection() {
  print_test_header "Deploy script detects frontend changes"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/deploy.sh"

  # Check for frontend detection
  if grep -q "frontend/" "$SCRIPT_PATH" && grep -q "FRONTEND_CHANGED" "$SCRIPT_PATH"; then
    print_success "Script detects frontend changes"
  else
    print_failure "Frontend detection" "Script doesn't detect frontend changes"
    return 1
  fi
}

# Test 9: Verify deploy.sh has rollback mechanism
test_rollback_mechanism() {
  print_test_header "Deploy script has rollback mechanism"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/deploy.sh"

  # Check for rollback logic
  if grep -q -i "rollback\|rolling back" "$SCRIPT_PATH"; then
    print_success "Script has rollback mechanism"
  else
    print_failure "Rollback mechanism" "Script missing rollback logic"
    return 1
  fi

  # Check for database backup before migrations
  if grep -q "BACKUP" "$SCRIPT_PATH" || grep -q "backup" "$SCRIPT_PATH"; then
    print_success "Script creates backups before migrations"
  else
    print_failure "Database backup" "Script doesn't create backups"
    return 1
  fi
}

# Test 10: Verify setup-auto-update.sh checks for root
test_root_check() {
  print_test_header "Setup script checks for root privileges"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/setup-auto-update.sh"

  # Check for EUID check
  if grep -q "EUID" "$SCRIPT_PATH"; then
    print_success "Setup script checks for root privileges"
  else
    print_failure "Root check" "Setup script doesn't check for root"
    return 1
  fi
}

# Test 11: Verify setup-auto-update.sh generates systemd files
test_systemd_generation() {
  print_test_header "Setup script generates systemd service files"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/setup-auto-update.sh"

  # Check for service file generation
  if grep -q "homeos-auto-update.service" "$SCRIPT_PATH" && grep -q "cat >" "$SCRIPT_PATH"; then
    print_success "Setup script generates service file"
  else
    print_failure "Service file generation" "Setup script doesn't generate service file"
    return 1
  fi

  # Check for timer file generation
  if grep -q "homeos-auto-update.timer" "$SCRIPT_PATH"; then
    print_success "Setup script generates timer file"
  else
    print_failure "Timer file generation" "Setup script doesn't generate timer file"
    return 1
  fi
}

# Test 12: Verify template files exist
test_template_files() {
  print_test_header "Template systemd files exist for reference"

  SERVICE_TEMPLATE="$(cd "$(dirname "$0")/../.." && pwd)/deployment/systemd/homeos-auto-update.service"
  TIMER_TEMPLATE="$(cd "$(dirname "$0")/../.." && pwd)/deployment/systemd/homeos-auto-update.timer"

  if [ ! -f "$SERVICE_TEMPLATE" ]; then
    print_failure "Service template" "Service template file not found"
    return 1
  fi

  if [ ! -f "$TIMER_TEMPLATE" ]; then
    print_failure "Timer template" "Timer template file not found"
    return 1
  fi

  print_success "Template files exist"
}

# Test 13: Verify template files have documentation
test_template_documentation() {
  print_test_header "Template files have clear documentation"

  SERVICE_TEMPLATE="$(cd "$(dirname "$0")/../.." && pwd)/deployment/systemd/homeos-auto-update.service"
  TIMER_TEMPLATE="$(cd "$(dirname "$0")/../.." && pwd)/deployment/systemd/homeos-auto-update.timer"

  if grep -q "TEMPLATE\|template" "$SERVICE_TEMPLATE"; then
    print_success "Service template has documentation"
  else
    print_failure "Service template docs" "Service template missing documentation"
    return 1
  fi

  if grep -q "TEMPLATE\|template" "$TIMER_TEMPLATE"; then
    print_success "Timer template has documentation"
  else
    print_failure "Timer template docs" "Timer template missing documentation"
    return 1
  fi
}

# Test 14: Verify no redundant auto-update.sh wrapper
test_no_redundant_wrapper() {
  print_test_header "No redundant auto-update.sh wrapper exists"

  WRAPPER_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/auto-update.sh"

  if [ -f "$WRAPPER_PATH" ]; then
    print_failure "No redundant wrapper" "Found redundant auto-update.sh wrapper at $WRAPPER_PATH"
    return 1
  else
    print_success "No redundant wrapper script found"
  fi
}

# Test 15: Verify deploy.sh handles "already up to date" scenario
test_up_to_date_handling() {
  print_test_header "Deploy script handles 'already up to date' scenario"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/deploy.sh"

  # Check for up-to-date detection
  if grep -q "Already up to date\|up to date" "$SCRIPT_PATH"; then
    print_success "Script handles already up-to-date scenario"
  else
    print_failure "Up-to-date handling" "Script doesn't handle up-to-date scenario"
    return 1
  fi
}

# Test 16: Verify deploy.sh uses environment variables
test_environment_variables() {
  print_test_header "Deploy script supports environment variables"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/deploy.sh"

  # Check for DEPLOY_BRANCH
  if grep -q "DEPLOY_BRANCH" "$SCRIPT_PATH"; then
    print_success "Script supports DEPLOY_BRANCH environment variable"
  else
    print_failure "DEPLOY_BRANCH support" "Script doesn't support DEPLOY_BRANCH"
    return 1
  fi

  # Check for DEPLOY_LOG_FILE
  if grep -q "DEPLOY_LOG_FILE" "$SCRIPT_PATH"; then
    print_success "Script supports DEPLOY_LOG_FILE environment variable"
  else
    print_failure "DEPLOY_LOG_FILE support" "Script doesn't support DEPLOY_LOG_FILE"
    return 1
  fi
}

# Test 17: Verify setup script provides helpful output
test_setup_output() {
  print_test_header "Setup script provides helpful instructions"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/setup-auto-update.sh"

  # Check for helpful echo statements
  if grep -q "systemctl enable" "$SCRIPT_PATH" && \
     grep -q "systemctl start" "$SCRIPT_PATH" && \
     grep -q "journalctl" "$SCRIPT_PATH"; then
    print_success "Setup script provides helpful instructions"
  else
    print_failure "Helpful output" "Setup script missing helpful instructions"
    return 1
  fi
}

# Test 18: Verify deploy script validates git repository
test_git_validation() {
  print_test_header "Deploy script operates in a git repository"

  SCRIPT_PATH="$(cd "$(dirname "$0")/../.." && pwd)/deployment/deploy.sh"

  # Check that script uses git commands (implies it expects a git repo)
  if grep -q "git rev-parse\|git fetch\|git reset" "$SCRIPT_PATH"; then
    print_success "Script uses git commands appropriately"
  else
    print_failure "Git usage" "Script doesn't use git commands"
    return 1
  fi
}

# Main test execution
main() {
  echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║  HomeOS Auto-Update Test Suite        ║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
  echo ""

  # Run all tests (|| true to continue even if tests fail)
  test_deploy_script_exists || true
  test_setup_script_exists || true
  test_auto_flag_parsing || true
  test_error_handling || true
  test_logging || true
  test_update_check_logic || true
  test_migration_detection || true
  test_frontend_detection || true
  test_rollback_mechanism || true
  test_root_check || true
  test_systemd_generation || true
  test_template_files || true
  test_template_documentation || true
  test_no_redundant_wrapper || true
  test_up_to_date_handling || true
  test_environment_variables || true
  test_setup_output || true
  test_git_validation || true

  # Print summary and return appropriate exit code
  print_summary
}

# Run tests
main
exit $?
