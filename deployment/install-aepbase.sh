#!/bin/bash
set -e

# aepbase Installation Script
# Builds the HomeOS aepbase wrapper from the Go source at aepbase/.

echo "🗄️  Installing aepbase..."

# Navigate to project root
cd "$(dirname "$0")/.."

if [ ! -d aepbase ]; then
    echo "❌ aepbase source directory not found at $(pwd)/aepbase"
    exit 1
fi

cd aepbase
if ! command -v go &> /dev/null; then
    echo "❌ Go toolchain not found. Install Go 1.25+ and re-run."
    exit 1
fi

echo "📦 Resolving Go module deps..."
go mod tidy

echo "🔨 Building aepbase..."
./install.sh

echo ""
echo "✅ aepbase installed at $(pwd)/bin/aepbase"
echo ""
echo "Next steps:"
echo "  1. Start aepbase:  ./aepbase/run.sh"
echo "  2. On first run, aepbase prints superuser credentials to stdout."
echo "     Grab and save them — set AEPBASE_ADMIN_EMAIL / AEPBASE_ADMIN_PASSWORD"
echo "     in frontend/.env so the schema sync runs at boot."
echo "  3. Build frontend: ./deployment/build.sh"
echo "  4. Set up services: sudo ./deployment/setup-services.sh"
