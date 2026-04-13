#!/bin/bash
set -e

# HomeOS Service Setup Script
# Sets up systemd services for aepbase and the frontend.

if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run this script with sudo"
    exit 1
fi

echo "🔧 Setting up HomeOS systemd services..."

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CURRENT_USER="${SUDO_USER:-$USER}"

echo "📍 Project directory: $PROJECT_DIR"
echo "👤 Running as user: $CURRENT_USER"

echo "📝 Configuring service files..."

sed -e "s|/path/to/homeOS|$PROJECT_DIR|g" \
    -e "s|User=homeosuser|User=$CURRENT_USER|g" \
    "$PROJECT_DIR/deployment/systemd/aepbase.service" > /etc/systemd/system/homeos-aepbase.service

sed -e "s|/path/to/homeOS|$PROJECT_DIR|g" \
    -e "s|User=homeosuser|User=$CURRENT_USER|g" \
    "$PROJECT_DIR/deployment/systemd/homeos-frontend.service" > /etc/systemd/system/homeos-frontend.service

chmod 644 /etc/systemd/system/homeos-aepbase.service
chmod 644 /etc/systemd/system/homeos-frontend.service

echo "🔄 Reloading systemd..."
systemctl daemon-reload

echo "✅ Enabling services..."
systemctl enable homeos-aepbase.service
systemctl enable homeos-frontend.service

echo ""
echo "✅ Services installed successfully!"
echo ""
echo "Service management commands:"
echo "  Start services:   sudo systemctl start homeos-aepbase homeos-frontend"
echo "  Stop services:    sudo systemctl stop homeos-aepbase homeos-frontend"
echo "  Restart services: sudo systemctl restart homeos-aepbase homeos-frontend"
echo "  View status:      sudo systemctl status homeos-aepbase homeos-frontend"
echo "  View logs:        sudo journalctl -u homeos-aepbase -f"
echo "                    sudo journalctl -u homeos-frontend -f"
echo ""
echo "Next steps:"
echo "  1. Start services: sudo systemctl start homeos-aepbase homeos-frontend"
echo "  2. aepbase REST:   http://localhost:8090"
echo "  3. HomeOS:         http://localhost:3000"
