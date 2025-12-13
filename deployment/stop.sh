#!/bin/bash
set -e

# HomeOS Stop Script
# Stops all HomeOS services

if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run this script with sudo"
    exit 1
fi

echo "🛑 Stopping HomeOS services..."

systemctl stop homeos-frontend
echo "✅ Frontend stopped"

systemctl stop homeos-pocketbase
echo "✅ PocketBase stopped"

echo ""
echo "✅ All HomeOS services stopped"
