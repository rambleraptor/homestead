#!/bin/bash
set -e

# HomeOS Auto-Update Setup Script
# Sets up systemd timer for automatic updates

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

echo "🔧 Setting up HomeOS auto-update..."

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CURRENT_USER="${SUDO_USER:-$(whoami)}"

echo "📂 Project root: $PROJECT_ROOT"
echo "👤 User: $CURRENT_USER"

# Update service file with actual paths
SERVICE_FILE="/etc/systemd/system/homeos-auto-update.service"
TIMER_FILE="/etc/systemd/system/homeos-auto-update.timer"

echo "📝 Creating service file..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=HomeOS Auto-Update Service
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$CURRENT_USER
WorkingDirectory=$PROJECT_ROOT
ExecStart=$PROJECT_ROOT/deployment/deploy.sh --auto

# Environment
Environment="DEPLOY_BRANCH=main"
Environment="DEPLOY_LOG_FILE=$PROJECT_ROOT/deployment.log"

# Security hardening
NoNewPrivileges=true
PrivateTmp=true

# Output to journal
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "📝 Creating timer file..."
cat > "$TIMER_FILE" <<EOF
[Unit]
Description=HomeOS Auto-Update Timer
Requires=homeos-auto-update.service

[Timer]
# Check for updates every 10 minutes
OnBootSec=2min
OnUnitActiveSec=10min

# Run even if last run was missed (e.g., server was off)
Persistent=true

[Install]
WantedBy=timers.target
EOF

# Reload systemd
echo "🔄 Reloading systemd..."
systemctl daemon-reload

# Enable the timer (but don't start it yet - let user decide)
echo "✅ Auto-update service and timer created"
echo ""
echo "To enable auto-updates:"
echo "  sudo systemctl enable homeos-auto-update.timer"
echo "  sudo systemctl start homeos-auto-update.timer"
echo ""
echo "To check auto-update status:"
echo "  sudo systemctl status homeos-auto-update.timer"
echo "  sudo systemctl list-timers homeos-auto-update.timer"
echo ""
echo "To view auto-update logs:"
echo "  sudo journalctl -u homeos-auto-update.service -f"
echo "  tail -f $PROJECT_ROOT/deployment.log"
echo ""
echo "To manually trigger an update check:"
echo "  sudo systemctl start homeos-auto-update.service"
echo ""
echo "To change update frequency, edit:"
echo "  /etc/systemd/system/homeos-auto-update.timer"
echo "  (Currently set to check every 10 minutes)"
echo ""
echo "🎉 Setup complete!"
