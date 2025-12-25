#!/bin/bash
set -e

# HomeOS Automated Deployment Script
# This script deploys the latest version of HomeOS with PocketBase migration support

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BRANCH="${DEPLOY_BRANCH:-main}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo -e "${BLUE}🚀 HomeOS Deployment Script${NC}"
echo "================================"
echo ""

# Change to project directory
cd "$PROJECT_ROOT"

# Get current commit
PREVIOUS_COMMIT=$(git rev-parse HEAD)
echo -e "${BLUE}📌 Current commit:${NC} $PREVIOUS_COMMIT"

# Pull latest changes
echo -e "${BLUE}📥 Pulling latest changes from $BRANCH...${NC}"
git fetch origin
git reset --hard origin/$BRANCH

# Get new commit
NEW_COMMIT=$(git rev-parse HEAD)
echo -e "${BLUE}📌 New commit:${NC} $NEW_COMMIT"

# Check if already up to date
if [ "$PREVIOUS_COMMIT" = "$NEW_COMMIT" ]; then
  echo -e "${GREEN}✅ Already up to date${NC}"
  exit 0
fi

# Show changes
echo ""
echo -e "${BLUE}📝 Changes:${NC}"
git log --oneline --graph --color $PREVIOUS_COMMIT..$NEW_COMMIT
echo ""

# Check for migrations
MIGRATIONS_UPDATED=false
if git diff --name-only $PREVIOUS_COMMIT..$NEW_COMMIT | grep -q "pb_migrations/"; then
  echo -e "${YELLOW}🔄 New PocketBase migrations detected${NC}"
  MIGRATIONS_UPDATED=true
else
  echo -e "${GREEN}✓ No new migrations${NC}"
fi

# Check for frontend changes
FRONTEND_UPDATED=false
if git diff --name-only $PREVIOUS_COMMIT..$NEW_COMMIT | grep -q "frontend/"; then
  echo -e "${YELLOW}🔄 Frontend changes detected${NC}"
  FRONTEND_UPDATED=true
else
  echo -e "${GREEN}✓ No frontend changes${NC}"
fi

echo ""

# Install dependencies if package.json changed
if git diff --name-only $PREVIOUS_COMMIT..$NEW_COMMIT | grep -q "frontend/package.json"; then
  echo -e "${BLUE}📦 Installing dependencies...${NC}"
  cd frontend
  npm ci
  cd ..
else
  echo -e "${GREEN}✓ No dependency changes${NC}"
fi

# Build frontend if needed
if [ "$FRONTEND_UPDATED" = true ]; then
  echo -e "${BLUE}🔨 Building frontend...${NC}"
  cd frontend
  npm run build
  cd ..
  echo -e "${GREEN}✅ Frontend built successfully${NC}"
fi

echo ""
echo -e "${BLUE}🛑 Stopping services...${NC}"

# Stop frontend
sudo systemctl stop homeos-frontend
echo -e "${GREEN}✓ Frontend stopped${NC}"

# Handle PocketBase and migrations
if [ "$MIGRATIONS_UPDATED" = true ]; then
  echo -e "${BLUE}🗄️ Stopping PocketBase to apply migrations...${NC}"
  sudo systemctl stop homeos-pocketbase

  # Create backup
  BACKUP_DIR="$PROJECT_ROOT/pocketbase/pb_data/backups"
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/data.db.backup.$(date +%Y%m%d_%H%M%S)"

  echo -e "${BLUE}💾 Creating database backup...${NC}"
  cp "$PROJECT_ROOT/pocketbase/pb_data/data.db" "$BACKUP_FILE"
  echo -e "${GREEN}✓ Backup created: $BACKUP_FILE${NC}"

  # Start PocketBase (migrations will auto-apply on startup)
  echo -e "${BLUE}🔄 Starting PocketBase (migrations will auto-apply)...${NC}"
  sudo systemctl start homeos-pocketbase

  # Wait for PocketBase to start
  echo -e "${BLUE}⏳ Waiting for PocketBase to start and apply migrations...${NC}"
  sleep 5

  # Check if PocketBase started successfully
  if ! sudo systemctl is-active --quiet homeos-pocketbase; then
    echo -e "${RED}❌ ERROR: PocketBase failed to start!${NC}"
    echo ""
    echo -e "${RED}📋 PocketBase logs:${NC}"
    sudo journalctl -u homeos-pocketbase -n 50 --no-pager
    echo ""

    # Rollback database
    echo -e "${YELLOW}🔄 Rolling back database...${NC}"
    sudo systemctl stop homeos-pocketbase
    cp "$BACKUP_FILE" "$PROJECT_ROOT/pocketbase/pb_data/data.db"

    # Rollback code
    echo -e "${YELLOW}🔙 Rolling back code to previous commit...${NC}"
    git reset --hard $PREVIOUS_COMMIT

    echo -e "${RED}❌ Deployment failed - rolled back to previous version${NC}"
    exit 1
  fi

  echo -e "${GREEN}✅ PocketBase started successfully with migrations applied${NC}"

  # Clean up old backups (keep last 10)
  echo -e "${BLUE}🧹 Cleaning up old backups (keeping last 10)...${NC}"
  ls -t "$BACKUP_DIR"/data.db.backup.* 2>/dev/null | tail -n +11 | xargs -r rm
  echo -e "${GREEN}✓ Old backups cleaned${NC}"
else
  # Just restart PocketBase
  echo -e "${BLUE}🔄 Restarting PocketBase...${NC}"
  sudo systemctl restart homeos-pocketbase
  sleep 3

  if ! sudo systemctl is-active --quiet homeos-pocketbase; then
    echo -e "${RED}❌ ERROR: PocketBase failed to start!${NC}"
    sudo journalctl -u homeos-pocketbase -n 30 --no-pager
    exit 1
  fi
  echo -e "${GREEN}✓ PocketBase restarted${NC}"
fi

# Start frontend
echo -e "${BLUE}▶️ Starting frontend...${NC}"
sudo systemctl start homeos-frontend

# Wait and verify
sleep 3

echo ""
echo -e "${BLUE}🔍 Verifying services...${NC}"

# Check PocketBase
if sudo systemctl is-active --quiet homeos-pocketbase; then
  echo -e "${GREEN}✓ PocketBase is running${NC}"
else
  echo -e "${RED}❌ PocketBase is not running!${NC}"
  sudo journalctl -u homeos-pocketbase -n 30 --no-pager
  exit 1
fi

# Check Frontend
if sudo systemctl is-active --quiet homeos-frontend; then
  echo -e "${GREEN}✓ Frontend is running${NC}"
else
  echo -e "${RED}❌ Frontend is not running!${NC}"
  sudo journalctl -u homeos-frontend -n 30 --no-pager
  exit 1
fi

echo ""
echo -e "${GREEN}✅ Deployment successful!${NC}"
echo -e "${BLUE}📌 Deployed commit:${NC} $NEW_COMMIT"
echo -e "${BLUE}🌐 Services:${NC}"
echo "  - PocketBase: http://localhost:8090"
echo "  - Frontend: http://localhost:3000"
echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
