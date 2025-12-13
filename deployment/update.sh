#!/bin/bash
set -e

# HomeOS Update Script
# Updates HomeOS to the latest code and rebuilds

echo "🔄 Updating HomeOS..."

# Navigate to project root
cd "$(dirname "$0")/.."

# Pull latest changes
echo "📥 Pulling latest changes from git..."
git pull

# Install any new dependencies
echo "📦 Installing dependencies..."
cd frontend
npm install

# Run tests and checks
echo "🧪 Running tests and checks..."
cd ..
make ci
make test-all

# Build frontend
echo "🔨 Building frontend..."
cd frontend
npm run build

echo ""
echo "✅ Update complete!"
echo ""
echo "To apply updates, restart the services:"
echo "  sudo ./deployment/restart.sh"
