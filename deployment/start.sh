#!/bin/bash
set -e

# HomeOS Start Script
# Starts all HomeOS services

if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run this script with sudo"
    exit 1
fi

echo "🚀 Starting HomeOS services..."

systemctl start homeos-pocketbase
echo "✅ PocketBase started"

systemctl start homeos-frontend
echo "✅ Frontend started"

echo ""
echo "📊 Service Status:"
systemctl status homeos-pocketbase --no-pager | head -n 10
echo ""
systemctl status homeos-frontend --no-pager | head -n 10

echo ""
echo "✅ HomeOS is running!"
echo ""
echo "  PocketBase: http://localhost:8090"
echo "  Admin UI:   http://localhost:8090/_/"
echo "  HomeOS:     http://localhost:3000"
echo ""
echo "  Or via Tailscale: http://$(hostname):3000"
echo ""
echo "View logs:"
echo "  sudo journalctl -u homeos-pocketbase -f"
echo "  sudo journalctl -u homeos-frontend -f"
