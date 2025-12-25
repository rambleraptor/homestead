#!/bin/bash
set -e

# HomeOS Auto-Update Script
# Checks for updates from GitHub and deploys if available
# Designed to run via systemd timer or cron

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BRANCH="${AUTO_UPDATE_BRANCH:-main}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="${AUTO_UPDATE_LOG_FILE:-$PROJECT_ROOT/auto-update.log}"

# Function to log with timestamp
log() {
  echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "${BLUE}🔍 Checking for updates...${NC}"

# Change to project directory
cd "$PROJECT_ROOT"

# Fetch latest changes from remote
git fetch origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"

# Get current and remote commits
CURRENT_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/$BRANCH)

log "${BLUE}📌 Current commit:${NC} $CURRENT_COMMIT"
log "${BLUE}📌 Remote commit:${NC} $REMOTE_COMMIT"

# Check if update is available
if [ "$CURRENT_COMMIT" = "$REMOTE_COMMIT" ]; then
  log "${GREEN}✅ Already up to date${NC}"
  exit 0
fi

log "${YELLOW}🔄 Updates available!${NC}"

# Show what will change
log "${BLUE}📝 Changes to be applied:${NC}"
git log --oneline --graph --color $CURRENT_COMMIT..$REMOTE_COMMIT | tee -a "$LOG_FILE"

# Check if there are new migrations
MIGRATIONS_UPDATED=false
if git diff --name-only $CURRENT_COMMIT..$REMOTE_COMMIT | grep -q "pb_migrations/"; then
  log "${YELLOW}🔄 New PocketBase migrations detected${NC}"
  MIGRATIONS_UPDATED=true
else
  log "${GREEN}✓ No new migrations${NC}"
fi

# Check for frontend changes
FRONTEND_UPDATED=false
if git diff --name-only $CURRENT_COMMIT..$REMOTE_COMMIT | grep -q "frontend/"; then
  log "${YELLOW}🔄 Frontend changes detected${NC}"
  FRONTEND_UPDATED=true
else
  log "${GREEN}✓ No frontend changes${NC}"
fi

log ""
log "${BLUE}🚀 Starting deployment...${NC}"

# Pull latest changes
git reset --hard origin/$BRANCH 2>&1 | tee -a "$LOG_FILE"

NEW_COMMIT=$(git rev-parse HEAD)
log "${BLUE}📌 Updated to commit:${NC} $NEW_COMMIT"

# Install dependencies if package.json changed
if git diff --name-only $CURRENT_COMMIT..$NEW_COMMIT | grep -q "frontend/package.json"; then
  log "${BLUE}📦 Installing dependencies...${NC}"
  cd frontend
  npm ci 2>&1 | tee -a "$LOG_FILE"
  cd ..
else
  log "${GREEN}✓ No dependency changes${NC}"
fi

# Build frontend if needed
if [ "$FRONTEND_UPDATED" = true ]; then
  log "${BLUE}🔨 Building frontend...${NC}"
  cd frontend
  npm run build 2>&1 | tee -a "$LOG_FILE"
  cd ..
  log "${GREEN}✅ Frontend built successfully${NC}"
fi

log ""
log "${BLUE}🛑 Stopping services...${NC}"

# Stop frontend
sudo systemctl stop homeos-frontend 2>&1 | tee -a "$LOG_FILE"
log "${GREEN}✓ Frontend stopped${NC}"

# Handle PocketBase and migrations
if [ "$MIGRATIONS_UPDATED" = true ]; then
  log "${BLUE}🗄️ Stopping PocketBase to apply migrations...${NC}"
  sudo systemctl stop homeos-pocketbase 2>&1 | tee -a "$LOG_FILE"

  # Create backup
  BACKUP_DIR="$PROJECT_ROOT/pocketbase/pb_data/backups"
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/data.db.backup.$(date +%Y%m%d_%H%M%S)"

  log "${BLUE}💾 Creating database backup...${NC}"
  cp "$PROJECT_ROOT/pocketbase/pb_data/data.db" "$BACKUP_FILE"
  log "${GREEN}✓ Backup created: $BACKUP_FILE${NC}"

  # Start PocketBase (migrations will auto-apply on startup)
  log "${BLUE}🔄 Starting PocketBase (migrations will auto-apply)...${NC}"
  sudo systemctl start homeos-pocketbase 2>&1 | tee -a "$LOG_FILE"

  # Wait for PocketBase to start
  log "${BLUE}⏳ Waiting for PocketBase to start and apply migrations...${NC}"
  sleep 5

  # Check if PocketBase started successfully
  if ! sudo systemctl is-active --quiet homeos-pocketbase; then
    log "${RED}❌ ERROR: PocketBase failed to start!${NC}"
    log "${RED}📋 PocketBase logs:${NC}"
    sudo journalctl -u homeos-pocketbase -n 50 --no-pager | tee -a "$LOG_FILE"

    # Rollback database
    log "${YELLOW}🔄 Rolling back database...${NC}"
    sudo systemctl stop homeos-pocketbase
    cp "$BACKUP_FILE" "$PROJECT_ROOT/pocketbase/pb_data/data.db"

    # Rollback code
    log "${YELLOW}🔙 Rolling back code to previous commit...${NC}"
    git reset --hard $CURRENT_COMMIT 2>&1 | tee -a "$LOG_FILE"

    # Restart services with old version
    sudo systemctl start homeos-pocketbase
    sudo systemctl start homeos-frontend

    log "${RED}❌ Update failed - rolled back to previous version${NC}"
    exit 1
  fi

  log "${GREEN}✅ PocketBase started successfully with migrations applied${NC}"

  # Clean up old backups (keep last 10)
  log "${BLUE}🧹 Cleaning up old backups (keeping last 10)...${NC}"
  ls -t "$BACKUP_DIR"/data.db.backup.* 2>/dev/null | tail -n +11 | xargs -r rm
  log "${GREEN}✓ Old backups cleaned${NC}"
else
  # Just restart PocketBase
  log "${BLUE}🔄 Restarting PocketBase...${NC}"
  sudo systemctl restart homeos-pocketbase 2>&1 | tee -a "$LOG_FILE"
  sleep 3

  if ! sudo systemctl is-active --quiet homeos-pocketbase; then
    log "${RED}❌ ERROR: PocketBase failed to start!${NC}"
    sudo journalctl -u homeos-pocketbase -n 30 --no-pager | tee -a "$LOG_FILE"

    # Rollback
    git reset --hard $CURRENT_COMMIT
    sudo systemctl restart homeos-pocketbase
    sudo systemctl start homeos-frontend

    log "${RED}❌ Update failed${NC}"
    exit 1
  fi
  log "${GREEN}✓ PocketBase restarted${NC}"
fi

# Start frontend
log "${BLUE}▶️ Starting frontend...${NC}"
sudo systemctl start homeos-frontend 2>&1 | tee -a "$LOG_FILE"

# Wait and verify
sleep 3

log ""
log "${BLUE}🔍 Verifying services...${NC}"

# Check PocketBase
if sudo systemctl is-active --quiet homeos-pocketbase; then
  log "${GREEN}✓ PocketBase is running${NC}"
else
  log "${RED}❌ PocketBase is not running!${NC}"
  sudo journalctl -u homeos-pocketbase -n 30 --no-pager | tee -a "$LOG_FILE"
  exit 1
fi

# Check Frontend
if sudo systemctl is-active --quiet homeos-frontend; then
  log "${GREEN}✓ Frontend is running${NC}"
else
  log "${RED}❌ Frontend is not running!${NC}"
  sudo journalctl -u homeos-frontend -n 30 --no-pager | tee -a "$LOG_FILE"
  exit 1
fi

log ""
log "${GREEN}✅ Update successful!${NC}"
log "${BLUE}📌 Updated from:${NC} $CURRENT_COMMIT"
log "${BLUE}📌 Updated to:${NC} $NEW_COMMIT"
log "${BLUE}🌐 Services:${NC}"
log "  - PocketBase: http://localhost:8090"
log "  - Frontend: http://localhost:3000"
log ""
log "${GREEN}🎉 Auto-update complete!${NC}"
