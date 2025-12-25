# 🚀 HomeOS Auto-Deployment Guide

This guide explains how to set up automatic deployment for HomeOS using a **pull-based approach**, where your server automatically pulls updates from GitHub and applies them, including PocketBase migrations.

## 📋 Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Quick Setup](#quick-setup)
- [Detailed Setup](#detailed-setup)
- [Configuration](#configuration)
- [Migration Handling](#migration-handling)
- [Monitoring](#monitoring)
- [Manual Updates](#manual-updates)
- [Troubleshooting](#troubleshooting)
- [Advanced Configuration](#advanced-configuration)

## Overview

The auto-deployment system uses a **pull-based approach**:

- ✅ **Your server pulls updates** from GitHub (no SSH keys needed in GitHub)
- ✅ **Runs on a schedule** (every 10 minutes by default)
- ✅ **Automatically applies PocketBase migrations**
- ✅ **Creates database backups** before migrations
- ✅ **Rolls back on failure** automatically
- ✅ **Logs all updates** for auditing
- ✅ **No external access required** - server initiates all updates

### Why Pull-Based?

**Security Benefits:**
- No GitHub secrets needed
- No inbound SSH access required
- Server controls when to update
- Works behind NAT/firewall

**Simplicity:**
- No webhook setup required
- No port forwarding needed
- Works with Tailscale networks
- Easy to pause/resume updates

## How It Works

### Update Flow

```
Systemd Timer triggers every 10 minutes
      ↓
Auto-update script runs
      ↓
Check GitHub for new commits
      ↓
New commits? → No → Exit (check again in 10 min)
      ↓ Yes
Pull latest code
      ↓
Check for migrations
      ↓
Migrations? → Yes → Backup database
      ↓              ↓
      No             Apply migrations
      ↓              ↓
      ←──────────────┘
Build frontend (if changed)
      ↓
Restart services
      ↓
Verify services running
      ↓
Update complete ✅
      ↓
Wait 10 minutes and repeat
```

### GitHub CI Flow

```
Push to GitHub
      ↓
GitHub Actions runs CI
      ↓
Lint, Type-check, Build, Test
      ↓
CI passes? → No → Notify (don't deploy)
      ↓ Yes
Commit available for deployment
      ↓
Server will pull on next check
```

## Quick Setup

### 1. Install HomeOS on Your Server

```bash
# Clone the repository
git clone https://github.com/your-username/homeOS.git
cd homeOS

# Install and setup
./deployment/install-pocketbase.sh
./deployment/build.sh
sudo ./deployment/setup-services.sh
sudo ./deployment/start.sh
```

### 2. Setup Auto-Updates

```bash
# Run the auto-update setup script
sudo ./deployment/setup-auto-update.sh

# Enable auto-updates
sudo systemctl enable homeos-auto-update.timer
sudo systemctl start homeos-auto-update.timer

# Verify it's running
sudo systemctl status homeos-auto-update.timer
```

### 3. Done!

Your server will now:
- Check for updates every 10 minutes
- Automatically pull and deploy new commits
- Apply migrations safely with backups
- Roll back on failure

**Push to GitHub main branch → Wait up to 10 minutes → Auto-deployed! 🎉**

## Detailed Setup

### Prerequisites

1. **HomeOS installed and running** on your server
2. **Git configured** with access to your GitHub repository
3. **Systemd** (Linux with systemd - Ubuntu, Debian, Fedora, etc.)
4. **Sudo access** for setting up systemd services

### Step 1: Configure Git Access

Your server needs read access to your GitHub repository.

#### Option A: Public Repository (Simplest)

If your repository is public, no additional setup needed!

#### Option B: Private Repository - SSH Key

```bash
# On your server, generate SSH key
ssh-keygen -t ed25519 -C "homeOS-server" -f ~/.ssh/homeos_deploy_key -N ""

# Add public key to GitHub
cat ~/.ssh/homeos_deploy_key.pub
# Copy the output

# Go to GitHub → Settings → Deploy keys → Add deploy key
# Paste the public key, give it a name, save

# Configure git to use this key
cd ~/homeOS
git remote set-url origin git@github.com:your-username/homeOS.git

# Test access
ssh -T git@github.com
```

#### Option C: Private Repository - Personal Access Token

```bash
# Generate token: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token
# Select scope: repo (full control of private repositories)

# Configure git to use token
cd ~/homeOS
git remote set-url origin https://YOUR_TOKEN@github.com/your-username/homeOS.git

# Or use credential helper (more secure)
git config --global credential.helper store
git pull  # Enter username and token when prompted
```

### Step 2: Run Auto-Update Setup

```bash
cd ~/homeOS
sudo ./deployment/setup-auto-update.sh
```

This script:
- Creates systemd service file
- Creates systemd timer file
- Configures paths and user
- Shows you how to enable/start the timer

### Step 3: Enable Auto-Updates

```bash
# Enable the timer to start on boot
sudo systemctl enable homeos-auto-update.timer

# Start the timer now
sudo systemctl start homeos-auto-update.timer

# Verify it's active
sudo systemctl status homeos-auto-update.timer
```

### Step 4: Verify Setup

```bash
# List active timers
sudo systemctl list-timers homeos-auto-update.timer

# You should see:
# NEXT                         LEFT     LAST PASSED UNIT                      ACTIVATES
# 2024-01-15 14:30:00 UTC      8min     -    -      homeos-auto-update.timer  homeos-auto-update.service

# Manually trigger an update check (optional)
sudo systemctl start homeos-auto-update.service

# View logs
sudo journalctl -u homeos-auto-update.service -f
```

## Configuration

### Update Frequency

By default, the timer checks for updates every 10 minutes. To change this:

```bash
# Edit the timer file
sudo nano /etc/systemd/system/homeos-auto-update.timer
```

**Common configurations:**

```ini
# Check every 5 minutes
[Timer]
OnBootSec=1min
OnUnitActiveSec=5min

# Check every hour
[Timer]
OnBootSec=2min
OnUnitActiveSec=1h

# Check every 30 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=30min

# Check once per day at 2 AM
[Timer]
OnCalendar=daily
OnCalendar=*-*-* 02:00:00
Persistent=true
```

After editing:
```bash
sudo systemctl daemon-reload
sudo systemctl restart homeos-auto-update.timer
```

### Branch Configuration

By default, auto-update pulls from the `main` branch. To change:

```bash
# Edit the service file
sudo nano /etc/systemd/system/homeos-auto-update.service

# Change the branch
Environment="AUTO_UPDATE_BRANCH=production"

# Reload and restart
sudo systemctl daemon-reload
```

### Log File Location

By default, logs are written to `~/homeOS/auto-update.log`. To change:

```bash
# Edit the service file
sudo nano /etc/systemd/system/homeos-auto-update.service

# Change the log file path
Environment="AUTO_UPDATE_LOG_FILE=/var/log/homeos-auto-update.log"

# Reload
sudo systemctl daemon-reload
```

## Migration Handling

### Automatic Migration Process

When PocketBase migrations are detected:

1. **Detection**: Script checks if `pb_migrations/` changed
2. **Backup**: Creates timestamped backup in `pocketbase/pb_data/backups/`
3. **Apply**: Stops PocketBase, starts it (migrations auto-apply on startup)
4. **Verify**: Checks if PocketBase started successfully
5. **Rollback**: If migration fails, restores backup and previous code
6. **Cleanup**: Keeps last 10 backups, deletes older ones

### Migration Safety

**Before deploying migrations:**

```bash
# Test migrations locally
make test-migrations

# Or manually test
cd pocketbase
./pocketbase serve
# Check console for migration errors
```

**Monitoring migrations:**

```bash
# Watch logs during deployment
tail -f ~/homeOS/auto-update.log

# Or use journalctl
sudo journalctl -u homeos-auto-update.service -f
```

### Migration Rollback

If a migration fails:
- Database automatically restored from backup
- Code reverted to previous commit
- Services restarted on last known good state
- Error logged for investigation

**Backups location:**
```
pocketbase/pb_data/backups/
  data.db.backup.20240115_140522
  data.db.backup.20240115_141034
  ...
```

## Monitoring

### View Auto-Update Status

```bash
# Check timer status
sudo systemctl status homeos-auto-update.timer

# List timers with next run time
sudo systemctl list-timers homeos-auto-update.timer

# Check last update
sudo systemctl status homeos-auto-update.service
```

### View Logs

```bash
# View update log file
tail -f ~/homeOS/auto-update.log

# View systemd journal
sudo journalctl -u homeos-auto-update.service -f

# View last 50 lines
sudo journalctl -u homeos-auto-update.service -n 50

# View logs since today
sudo journalctl -u homeos-auto-update.service --since today
```

### Update History

```bash
# View git history
cd ~/homeOS
git log --oneline -10

# View deployment log
cat ~/homeOS/auto-update.log | grep "Update successful"
```

## Manual Updates

### Trigger Update Manually

```bash
# Manually trigger an update check
sudo systemctl start homeos-auto-update.service

# Watch it run
sudo journalctl -u homeos-auto-update.service -f
```

### Disable Auto-Updates Temporarily

```bash
# Stop the timer
sudo systemctl stop homeos-auto-update.timer

# Updates won't run until you restart it
sudo systemctl start homeos-auto-update.timer
```

### Disable Auto-Updates Permanently

```bash
# Disable the timer
sudo systemctl disable homeos-auto-update.timer
sudo systemctl stop homeos-auto-update.timer

# Re-enable later
sudo systemctl enable homeos-auto-update.timer
sudo systemctl start homeos-auto-update.timer
```

### Manual Deployment

You can still manually deploy:

```bash
cd ~/homeOS
./deployment/deploy.sh
```

Or:

```bash
cd ~/homeOS
git pull origin main
./deployment/build.sh
sudo ./deployment/restart.sh
```

## Troubleshooting

### Auto-Updates Not Running

**Check timer status:**
```bash
sudo systemctl status homeos-auto-update.timer
```

**If inactive:**
```bash
sudo systemctl start homeos-auto-update.timer
```

**Check for errors:**
```bash
sudo journalctl -u homeos-auto-update.service -n 50
```

### Git Authentication Fails

**Error:** `Permission denied` or `Authentication failed`

**For SSH keys:**
```bash
# Test SSH connection
ssh -T git@github.com

# If fails, check SSH key
cat ~/.ssh/homeos_deploy_key.pub

# Verify deploy key is added to GitHub
```

**For Personal Access Token:**
```bash
# Check remote URL
cd ~/homeOS
git remote -v

# Update with token
git remote set-url origin https://YOUR_TOKEN@github.com/your-username/homeOS.git
```

### Migration Fails

**Check logs:**
```bash
# Auto-update log
tail -f ~/homeOS/auto-update.log

# PocketBase log
sudo journalctl -u homeos-pocketbase -n 100
```

**Manually rollback if needed:**
```bash
# Stop services
sudo systemctl stop homeos-pocketbase homeos-frontend

# Restore backup
BACKUP=$(ls -t ~/homeOS/pocketbase/pb_data/backups/*.backup.* | head -1)
cp "$BACKUP" ~/homeOS/pocketbase/pb_data/data.db

# Rollback code
cd ~/homeOS
git reset --hard HEAD~1

# Restart
sudo systemctl start homeos-pocketbase homeos-frontend
```

### Services Not Starting After Update

**Check service status:**
```bash
./deployment/status.sh

# Or individually
sudo systemctl status homeos-pocketbase
sudo systemctl status homeos-frontend
```

**Check logs:**
```bash
sudo journalctl -u homeos-pocketbase -n 50
sudo journalctl -u homeos-frontend -n 50
```

**Restart services:**
```bash
sudo ./deployment/restart.sh
```

### Disk Space Issues

**Check disk space:**
```bash
df -h

# Check backup size
du -sh ~/homeOS/pocketbase/pb_data/backups
```

**Clean old backups manually:**
```bash
# Keep only last 5 backups
cd ~/homeOS/pocketbase/pb_data/backups
ls -t data.db.backup.* | tail -n +6 | xargs rm
```

### Update Stuck or Hanging

**Check if update is running:**
```bash
sudo systemctl status homeos-auto-update.service

# If stuck, restart it
sudo systemctl restart homeos-auto-update.service
```

**Check for processes:**
```bash
ps aux | grep auto-update
ps aux | grep pocketbase
```

## Advanced Configuration

### Different Update Schedule for Different Times

```bash
# Edit timer to run more frequently during work hours
sudo nano /etc/systemd/system/homeos-auto-update.timer
```

```ini
[Timer]
# Every 5 minutes during work hours (9 AM - 5 PM)
OnCalendar=Mon..Fri 09..17:00/5

# Once per hour outside work hours
OnCalendar=Mon..Fri 00..08,18..23:00/60
OnCalendar=Sat,Sun *:00/60

Persistent=true
```

### Notification on Update

Add a notification script to run after updates:

```bash
# Create notification script
cat > ~/homeOS/deployment/notify-update.sh <<'EOF'
#!/bin/bash
COMMIT=$1
# Send notification (example: ntfy.sh)
curl -d "HomeOS updated to $COMMIT" https://ntfy.sh/your-topic
EOF

chmod +x ~/homeOS/deployment/notify-update.sh

# Update auto-update.sh to call it (add at end):
# ./deployment/notify-update.sh "$NEW_COMMIT"
```

### Update Only if CI Passes

Check GitHub Actions status before updating:

```bash
# Modify auto-update.sh to check CI status
# Before git reset --hard, add:

# Check if CI passed for this commit
CI_STATUS=$(gh run list --commit $REMOTE_COMMIT --json conclusion -q '.[0].conclusion')
if [ "$CI_STATUS" != "success" ]; then
  log "⚠️ CI checks did not pass for this commit, skipping update"
  exit 0
fi
```

Requires GitHub CLI (`gh`) installed and authenticated.

### Multiple Environments

Run different timers for staging and production:

**Staging (frequent updates):**
```bash
# Clone to different directory
git clone https://github.com/your-username/homeOS.git homeOS-staging
cd homeOS-staging
git checkout develop

# Setup with different service name
# Edit setup-auto-update.sh to use "homeos-staging-auto-update"
```

**Production (less frequent):**
```bash
# Keep existing setup for production
# Runs on main branch every 10 minutes
```

## Security Best Practices

1. **Use Deploy Keys** - Use read-only deploy keys instead of personal tokens
2. **Monitor Logs** - Regularly check auto-update logs
3. **Test Migrations** - Always test migrations locally before pushing
4. **Backup Strategy** - Set up off-server backups in addition to auto-backups
5. **Limit Access** - Use dedicated deploy keys, not personal SSH keys
6. **Review Updates** - Check GitHub commits before they auto-deploy
7. **Staged Rollout** - Use staging environment to test updates first

## Monitoring and Alerting

### Prometheus/Grafana Integration

Export update metrics:

```bash
# Add to auto-update.sh
# Track last update time
echo "homeos_last_update_timestamp $(date +%s)" > /var/lib/node_exporter/textfile_collector/homeos.prom
```

### Simple Email Alerts

```bash
# Install mailutils
sudo apt install mailutils

# Add to auto-update.sh (at the end, after success)
echo "HomeOS updated successfully to $NEW_COMMIT" | mail -s "HomeOS Update Success" you@example.com

# Add on failure (in error handling)
echo "HomeOS update failed, check logs" | mail -s "HomeOS Update FAILED" you@example.com
```

## Quick Reference

### Commands

```bash
# Enable/disable auto-updates
sudo systemctl enable homeos-auto-update.timer   # Enable
sudo systemctl disable homeos-auto-update.timer  # Disable

# Start/stop auto-updates
sudo systemctl start homeos-auto-update.timer    # Start
sudo systemctl stop homeos-auto-update.timer     # Stop

# Check status
sudo systemctl status homeos-auto-update.timer   # Timer status
sudo systemctl status homeos-auto-update.service # Service status
sudo systemctl list-timers homeos-auto-update.timer  # Next run time

# Trigger manual update
sudo systemctl start homeos-auto-update.service

# View logs
tail -f ~/homeOS/auto-update.log                 # Update log
sudo journalctl -u homeos-auto-update.service -f # System log
```

### Files

| File | Purpose |
|------|---------|
| `/etc/systemd/system/homeos-auto-update.service` | Systemd service definition |
| `/etc/systemd/system/homeos-auto-update.timer` | Update schedule (timer) |
| `~/homeOS/deployment/auto-update.sh` | Auto-update script |
| `~/homeOS/auto-update.log` | Update log file |
| `~/homeOS/pocketbase/pb_data/backups/` | Database backups |

### Useful Systemd Commands

```bash
# Reload systemd after editing service files
sudo systemctl daemon-reload

# View all active timers
sudo systemctl list-timers

# View detailed timer info
systemctl show homeos-auto-update.timer

# Check when timer last ran
systemctl status homeos-auto-update.service

# View full service definition
systemctl cat homeos-auto-update.service
```

---

## Summary

**Setup Steps:**
1. ✅ Install HomeOS on your server
2. ✅ Configure Git access (deploy key or token)
3. ✅ Run `sudo ./deployment/setup-auto-update.sh`
4. ✅ Enable and start the timer
5. ✅ Push to GitHub and wait for auto-deployment!

**What Happens:**
- Every 10 minutes, server checks GitHub for updates
- If updates found, pulls and deploys automatically
- Migrations applied safely with backups
- Automatic rollback on failure
- All updates logged

**Benefits:**
- 🔒 Secure - no inbound access needed
- 🚀 Automatic - push and forget
- 🛡️ Safe - automatic backups and rollback
- 📝 Auditable - full logging
- ⚙️ Flexible - configurable schedule

---

**🎉 Your HomeOS will now auto-update when you push to GitHub!**

Push to main → Wait up to 10 minutes → Deployed! 🚀
