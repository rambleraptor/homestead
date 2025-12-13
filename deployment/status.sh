#!/bin/bash

# HomeOS Status Script
# Shows status of all HomeOS services

echo "📊 HomeOS Service Status"
echo "======================="
echo ""

if systemctl is-active --quiet homeos-pocketbase; then
    echo "✅ PocketBase: RUNNING"
else
    echo "❌ PocketBase: STOPPED"
fi

if systemctl is-active --quiet homeos-frontend; then
    echo "✅ Frontend:   RUNNING"
else
    echo "❌ Frontend:   STOPPED"
fi

echo ""
echo "Detailed Status:"
echo "================"
echo ""

if command -v systemctl &> /dev/null; then
    systemctl status homeos-pocketbase --no-pager | head -n 15
    echo ""
    systemctl status homeos-frontend --no-pager | head -n 15
fi

echo ""
echo "Access URLs:"
echo "============"
echo "  Local:      http://localhost:3000"
echo "  PocketBase: http://localhost:8090"
echo "  Admin UI:   http://localhost:8090/_/"

if command -v tailscale &> /dev/null && tailscale status &> /dev/null; then
    TAILSCALE_IP=$(tailscale ip -4 2>/dev/null)
    if [ -n "$TAILSCALE_IP" ]; then
        echo ""
        echo "  Tailscale:  http://$TAILSCALE_IP:3000"
        echo "  (accessible from any device on your Tailscale network)"
    fi
fi
