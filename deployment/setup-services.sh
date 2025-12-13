#!/bin/bash
set -e

# HomeOS Service Setup Script
# Sets up systemd services for PocketBase and the frontend

if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run this script with sudo"
    exit 1
fi

echo "🔧 Setting up HomeOS systemd services..."

# Get the project directory (absolute path)
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CURRENT_USER="${SUDO_USER:-$USER}"

echo "📍 Project directory: $PROJECT_DIR"
echo "👤 Running as user: $CURRENT_USER"

# Update service files with actual paths and user
echo "📝 Configuring service files..."

# Copy and configure PocketBase service
sed -e "s|/path/to/homeOS|$PROJECT_DIR|g" \
    -e "s|User=homeosuser|User=$CURRENT_USER|g" \
    "$PROJECT_DIR/deployment/systemd/pocketbase.service" > /etc/systemd/system/homeos-pocketbase.service

# Copy and configure Frontend service
sed -e "s|/path/to/homeOS|$PROJECT_DIR|g" \
    -e "s|User=homeosuser|User=$CURRENT_USER|g" \
    "$PROJECT_DIR/deployment/systemd/homeos-frontend.service" > /etc/systemd/system/homeos-frontend.service

# Set proper permissions
chmod 644 /etc/systemd/system/homeos-pocketbase.service
chmod 644 /etc/systemd/system/homeos-frontend.service

# Reload systemd
echo "🔄 Reloading systemd..."
systemctl daemon-reload

# Enable services to start on boot
echo "✅ Enabling services..."
systemctl enable homeos-pocketbase.service
systemctl enable homeos-frontend.service

echo ""
echo "✅ Services installed successfully!"
echo ""
echo "Service management commands:"
echo "  Start services:   sudo systemctl start homeos-pocketbase homeos-frontend"
echo "  Stop services:    sudo systemctl stop homeos-pocketbase homeos-frontend"
echo "  Restart services: sudo systemctl restart homeos-pocketbase homeos-frontend"
echo "  View status:      sudo systemctl status homeos-pocketbase homeos-frontend"
echo "  View logs:        sudo journalctl -u homeos-pocketbase -f"
echo "                    sudo journalctl -u homeos-frontend -f"
echo ""
echo "Next steps:"
echo "  1. Start services: sudo systemctl start homeos-pocketbase homeos-frontend"
echo "  2. Access PocketBase admin: http://localhost:8090/_/"
echo "  3. Access HomeOS: http://localhost:3000"
