#!/bin/bash
set -e

# HomeOS Build Script
# This script builds the frontend application for production

echo "🏗️  Building HomeOS for production..."

# Navigate to project root
cd "$(dirname "$0")/.."

# Install frontend dependencies if needed
echo "📦 Checking dependencies..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

# Run build
echo "🔨 Building frontend..."
npm run build

echo "✅ Build complete! Frontend built to: frontend/dist/"
echo ""
echo "Next steps:"
echo "  1. Set up PocketBase: ./deployment/install-pocketbase.sh"
echo "  2. Configure environment: cp deployment/.env.production frontend/.env"
echo "  3. Set up services: sudo ./deployment/setup-services.sh"
