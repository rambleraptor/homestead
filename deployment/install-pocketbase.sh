#!/bin/bash
set -e

# PocketBase Installation Script
# Downloads and installs PocketBase

POCKETBASE_VERSION="${POCKETBASE_VERSION:-0.22.0}"
ARCH=$(uname -m)
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

echo "🗄️  Installing PocketBase v${POCKETBASE_VERSION}..."

# Navigate to project root
cd "$(dirname "$0")/.."

# Determine architecture
if [ "$ARCH" = "x86_64" ]; then
    ARCH="amd64"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    ARCH="arm64"
else
    echo "❌ Unsupported architecture: $ARCH"
    exit 1
fi

# Create pocketbase directory
mkdir -p pocketbase
cd pocketbase

# Download PocketBase if not already present
if [ ! -f "pocketbase" ]; then
    echo "📥 Downloading PocketBase for ${OS}_${ARCH}..."
    DOWNLOAD_URL="https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_${OS}_${ARCH}.zip"

    if command -v wget &> /dev/null; then
        wget -q --show-progress "$DOWNLOAD_URL" -O pocketbase.zip
    elif command -v curl &> /dev/null; then
        curl -L "$DOWNLOAD_URL" -o pocketbase.zip
    else
        echo "❌ Neither wget nor curl found. Please install one of them."
        exit 1
    fi

    echo "📦 Extracting PocketBase..."
    unzip -q pocketbase.zip
    rm pocketbase.zip

    chmod +x pocketbase
    echo "✅ PocketBase installed successfully!"
else
    echo "✅ PocketBase already installed"
fi

# Check version
./pocketbase --version

echo ""
echo "Next steps:"
echo "  1. Build frontend: ./deployment/build.sh"
echo "  2. Configure environment: cp deployment/.env.production frontend/.env"
echo "  3. Set up services: sudo ./deployment/setup-services.sh"
