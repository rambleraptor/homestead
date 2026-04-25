#!/bin/bash
set -e

# HomeOS Build Script
# Builds the frontend application for production.

export PATH="/opt/node22/bin:$PATH"

echo "🏗️  Building HomeOS for production..."

cd "$(dirname "$0")/.."

echo "📦 Checking dependencies..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

echo "🔨 Building frontend..."
npm run build

echo "✅ Build complete! Frontend built to: frontend/.next/"
echo ""
echo "Next steps:"
echo "  1. Install aepbase:  ./deployment/install-aepbase.sh"
echo "  2. Configure env:    cp deployment/.env.production frontend/.env"
echo "  3. Set up services:  sudo ./deployment/setup-services.sh"
