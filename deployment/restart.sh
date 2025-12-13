#!/bin/bash
set -e

# HomeOS Restart Script
# Restarts all HomeOS services

if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run this script with sudo"
    exit 1
fi

echo "🔄 Restarting HomeOS services..."

systemctl restart homeos-pocketbase
echo "✅ PocketBase restarted"

systemctl restart homeos-frontend
echo "✅ Frontend restarted"

echo ""
echo "📊 Service Status:"
systemctl status homeos-pocketbase --no-pager | head -n 10
echo ""
systemctl status homeos-frontend --no-pager | head -n 10

echo ""
echo "✅ HomeOS services restarted!"
echo ""
echo "View logs:"
echo "  sudo journalctl -u homeos-pocketbase -f"
echo "  sudo journalctl -u homeos-frontend -f"
