#!/bin/bash
set -e

# PocketBase Installation Script
# Builds a custom PocketBase binary with libSQL support from the backend/ Go source.

echo "Building PocketBase with libSQL support..."

# Navigate to project root
cd "$(dirname "$0")/.."

# Check Go is installed
if ! command -v go &> /dev/null; then
    echo "Go is required to build PocketBase with libSQL."
    echo "Install Go 1.21+ from https://go.dev/dl/"
    exit 1
fi

# Check C compiler is available (required for go-libsql CGO)
if ! command -v gcc &> /dev/null && ! command -v cc &> /dev/null; then
    echo "A C compiler (gcc) is required for the libSQL native library."
    echo "Install with: sudo apt install build-essential"
    exit 1
fi

# Create output directory
mkdir -p pocketbase

# Tidy dependencies
echo "Resolving Go module dependencies..."
cd backend
go mod tidy

# Build the custom PocketBase binary with libSQL
echo "Compiling PocketBase with libSQL backend..."
CGO_ENABLED=1 go build -o ../pocketbase/pocketbase .

cd ..

chmod +x pocketbase/pocketbase

# Check version
./pocketbase/pocketbase --version

echo ""
echo "PocketBase with libSQL built successfully!"
echo ""
echo "Next steps:"
echo "  1. Build frontend: ./deployment/build.sh"
echo "  2. Configure environment: cp deployment/.env.production frontend/.env"
echo "  3. Set up services: sudo ./deployment/setup-services.sh"
echo ""
echo "Optional Turso sync:"
echo "  Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your environment"
echo "  to sync the local database with a remote Turso instance."
