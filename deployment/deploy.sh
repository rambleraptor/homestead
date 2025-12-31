#!/bin/bash
set -e

# HomeOS Unified Deployment Script
# Handles deployment, updates, and migrations with automatic rollback on failure
#
# Usage:
#   ./deploy.sh           - Deploy current code
#   ./deploy.sh --auto    - Check for updates, deploy if available (for systemd timer)
#   ./deploy.sh --force   - Force rebuild even if no changes detected

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
AUTO_MODE=false
FORCE_BUILD=false
BRANCH="${DEPLOY_BRANCH:-main}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="${DEPLOY_LOG_FILE:-$PROJECT_ROOT/deployment.log}"

# Parse arguments
for arg in "$@"; do
  case $arg in
    --auto) AUTO_MODE=true ;;
    --force) FORCE_BUILD=true ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# Logging function
log() {
  echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "${BLUE}🚀 HomeOS Deployment${NC}"
cd "$PROJECT_ROOT"

# Validate we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  log "${RED}❌ Not a git repository${NC}"
  log "${RED}This script must be run from within the HomeOS git repository${NC}"
  exit 1
fi

# Get current commit
PREVIOUS_COMMIT=$(git rev-parse HEAD)
log "${BLUE}Current:${NC} $PREVIOUS_COMMIT"

# Check for updates if in auto mode
if [ "$AUTO_MODE" = true ]; then
  log "${BLUE}🔍 Checking for updates...${NC}"

  # Fetch with error handling
  if ! git fetch origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"; then
    log "${RED}❌ Failed to fetch from remote${NC}"
    log "${YELLOW}Continuing with current version${NC}"
    exit 0
  fi

  # Validate branch exists
  if ! git rev-parse --verify "origin/$BRANCH" > /dev/null 2>&1; then
    log "${RED}❌ Branch 'origin/$BRANCH' does not exist${NC}"
    log "${YELLOW}Available remote branches:${NC}"
    git branch -r | tee -a "$LOG_FILE"
    exit 1
  fi

  REMOTE_COMMIT=$(git rev-parse origin/$BRANCH)
  log "${BLUE}Remote:${NC} $REMOTE_COMMIT"

  if [ "$PREVIOUS_COMMIT" = "$REMOTE_COMMIT" ]; then
    log "${GREEN}✅ Already up to date${NC}"
    exit 0
  fi

  log "${YELLOW}📥 Updates available${NC}"
  git log --oneline --graph --color $PREVIOUS_COMMIT..$REMOTE_COMMIT | tee -a "$LOG_FILE"
  git reset --hard origin/$BRANCH 2>&1 | tee -a "$LOG_FILE"
  NEW_COMMIT=$REMOTE_COMMIT
else
  # Manual mode - deploy current code
  NEW_COMMIT=$PREVIOUS_COMMIT
fi

# Detect what changed
MIGRATIONS_CHANGED=false
FRONTEND_CHANGED=false
DEPS_CHANGED=false

if [ "$PREVIOUS_COMMIT" != "$NEW_COMMIT" ] || [ "$FORCE_BUILD" = true ]; then
  if git diff --name-only $PREVIOUS_COMMIT..$NEW_COMMIT | grep -q "pb_migrations/"; then
    MIGRATIONS_CHANGED=true
    log "${YELLOW}🔄 Migrations detected${NC}"
  fi

  if git diff --name-only $PREVIOUS_COMMIT..$NEW_COMMIT | grep -q "frontend/"; then
    FRONTEND_CHANGED=true
    log "${YELLOW}🔄 Frontend changes detected${NC}"
  fi

  if git diff --name-only $PREVIOUS_COMMIT..$NEW_COMMIT | grep -q "frontend/package.json"; then
    DEPS_CHANGED=true
    log "${YELLOW}📦 Dependencies changed${NC}"
  fi
fi

# Install dependencies if needed
if [ "$DEPS_CHANGED" = true ]; then
  log "${BLUE}📦 Installing dependencies...${NC}"
  if ! cd frontend && npm ci 2>&1 | tee -a "$LOG_FILE"; then
    log "${RED}❌ Failed to install dependencies${NC}"
    log "${YELLOW}⏮️  Rolling back...${NC}"
    cd "$PROJECT_ROOT"
    git reset --hard "$PREVIOUS_COMMIT" 2>&1 | tee -a "$LOG_FILE"
    exit 1
  fi
  cd "$PROJECT_ROOT"
fi

# Build frontend if needed
if [ "$FRONTEND_CHANGED" = true ] || [ "$FORCE_BUILD" = true ]; then
  log "${BLUE}🔨 Building frontend...${NC}"
  if ! cd frontend && npm run build 2>&1 | tee -a "$LOG_FILE"; then
    log "${RED}❌ Frontend build failed${NC}"
    log "${YELLOW}⏮️  Rolling back...${NC}"
    cd "$PROJECT_ROOT"
    git reset --hard "$PREVIOUS_COMMIT" 2>&1 | tee -a "$LOG_FILE"
    exit 1
  fi
  cd "$PROJECT_ROOT"
fi

# Stop frontend
log "${BLUE}🛑 Stopping frontend...${NC}"
sudo systemctl stop homeos-frontend 2>&1 | tee -a "$LOG_FILE"

# Handle PocketBase and migrations
if [ "$MIGRATIONS_CHANGED" = true ]; then
  log "${BLUE}🗄️  Applying migrations...${NC}"
  sudo systemctl stop homeos-pocketbase 2>&1 | tee -a "$LOG_FILE"

  # Backup database
  BACKUP_DIR="$PROJECT_ROOT/pocketbase/pb_data/backups"
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/data.db.backup.$(date +%Y%m%d_%H%M%S)"

  log "${BLUE}💾 Creating backup...${NC}"
  cp "$PROJECT_ROOT/pocketbase/pb_data/data.db" "$BACKUP_FILE"

  # Start PocketBase (auto-applies migrations)
  sudo systemctl start homeos-pocketbase 2>&1 | tee -a "$LOG_FILE"
  sleep 5

  # Verify PocketBase started
  if ! sudo systemctl is-active --quiet homeos-pocketbase; then
    log "${RED}❌ Migration failed!${NC}"
    sudo journalctl -u homeos-pocketbase -n 50 --no-pager | tee -a "$LOG_FILE"

    # Rollback
    log "${YELLOW}⏮️  Rolling back...${NC}"
    sudo systemctl stop homeos-pocketbase
    cp "$BACKUP_FILE" "$PROJECT_ROOT/pocketbase/pb_data/data.db"
    git reset --hard $PREVIOUS_COMMIT 2>&1 | tee -a "$LOG_FILE"
    sudo systemctl start homeos-pocketbase homeos-frontend

    log "${RED}❌ Deployment failed${NC}"
    exit 1
  fi

  # Cleanup old backups (keep last 10)
  ls -t "$BACKUP_DIR"/data.db.backup.* 2>/dev/null | tail -n +11 | xargs -r rm
  log "${GREEN}✅ Migrations applied${NC}"
else
  # Just restart PocketBase
  sudo systemctl restart homeos-pocketbase 2>&1 | tee -a "$LOG_FILE"
  sleep 2
fi

# Start frontend
log "${BLUE}▶️  Starting frontend...${NC}"
sudo systemctl start homeos-frontend 2>&1 | tee -a "$LOG_FILE"
sleep 2

# Verify services
if ! sudo systemctl is-active --quiet homeos-pocketbase || \
   ! sudo systemctl is-active --quiet homeos-frontend; then
  log "${RED}❌ Service verification failed${NC}"
  sudo systemctl status homeos-pocketbase homeos-frontend --no-pager | tee -a "$LOG_FILE"
  exit 1
fi

log "${GREEN}✅ Deployment successful!${NC}"
log "${BLUE}PocketBase:${NC} http://localhost:8090"
log "${BLUE}Frontend:${NC} http://localhost:3000"
