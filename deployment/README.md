# HomeOS Deployment Guide

Simple deployment for HomeOS on Linux with systemd.

## Quick Setup

```bash
# 1. Install PocketBase
./deployment/install-pocketbase.sh

# 2. Build frontend
./deployment/build.sh

# 3. Configure environment
cp deployment/.env.production frontend/.env
# Generate VAPID keys: cd frontend && npx web-push generate-vapid-keys
# Edit frontend/.env and add your VAPID public key

# 4. Set up systemd services
sudo make setup-services

# 5. Start services
sudo make start

# 6. Configure PocketBase
# - Open http://localhost:8090/_/
# - Create admin account
# - Create user in Collections → users (check "Verified")

# 7. Access HomeOS at http://localhost:3000
```

## Prerequisites

- Linux with systemd (Ubuntu, Debian, Fedora, etc.)
- Node.js 20+
- Git

Install on Ubuntu/Debian:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
```

## Common Commands

```bash
# Service management
make start              # Start services
make stop               # Stop services
make restart            # Restart services
make status             # Check status
make logs               # Follow logs

# Deployment
make deploy             # Deploy current code
make deploy-force       # Force rebuild and deploy

# Development
make dev                # Start dev server
make build              # Build for production
make ci && make test    # Run all checks
```

## Deployment

### Manual Deployment

Deploy current code:
```bash
sudo make deploy
```

The deploy script:
- Detects changes (migrations, frontend, dependencies)
- Builds only what changed
- Applies migrations with automatic backup
- Rolls back on failure
- Verifies services started

### Automatic Updates

Set up automatic deployment (pulls from GitHub every 10 minutes):

```bash
# 1. Set up auto-update
sudo make setup-auto-update

# 2. Enable auto-updates
sudo systemctl enable homeos-auto-update.timer
sudo systemctl start homeos-auto-update.timer

# 3. Check status
sudo systemctl status homeos-auto-update.timer
```

Configure update frequency by editing `/etc/systemd/system/homeos-auto-update.timer`:
```ini
[Timer]
OnBootSec=1min
OnUnitActiveSec=10min  # Change to 5min, 1h, etc.
```

Then reload: `sudo systemctl daemon-reload && sudo systemctl restart homeos-auto-update.timer`

### Rollback

If deployment fails, automatic rollback:
- Restores database from backup
- Reverts code to previous commit
- Restarts services on last known good state

Manual rollback:
```bash
sudo systemctl stop homeos-pocketbase homeos-frontend

# Restore database
BACKUP=$(ls -t pocketbase/pb_data/backups/*.backup.* | head -1)
cp "$BACKUP" pocketbase/pb_data/data.db

# Rollback code
git reset --hard HEAD~1

sudo systemctl start homeos-pocketbase homeos-frontend
```

## Tailscale Access (Optional)

Access HomeOS from anywhere on your Tailscale network:

```bash
# 1. Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# 2. Get your Tailscale IP
tailscale ip -4

# 3. Update frontend/.env (optional)
NEXT_PUBLIC_POCKETBASE_URL=http://YOUR_TAILSCALE_IP:8090

# 4. Rebuild and restart
./deployment/build.sh
sudo make restart

# 5. Access from any Tailscale device
http://YOUR_TAILSCALE_IP:3000
```

## Configuration

### Environment Variables

Edit `frontend/.env`:
```bash
NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090  # Or Tailscale URL
NEXT_PUBLIC_APP_NAME=HomeOS
NEXT_PUBLIC_VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY_HERE
```

Generate VAPID keys:
```bash
cd frontend && npx web-push generate-vapid-keys
```

### Service Configuration

Systemd services are in `deployment/systemd/`:
- `pocketbase.service` - PocketBase on port 8090
- `homeos-frontend.service` - Frontend on port 3000
- `homeos-auto-update.service` - Auto-update service
- `homeos-auto-update.timer` - Update schedule

View logs:
```bash
make logs                    # Both services
make logs-pocketbase         # PocketBase only
make logs-frontend           # Frontend only
sudo journalctl -u homeos-pocketbase -n 100  # Last 100 lines
```

## Troubleshooting

### Services won't start
```bash
make status                          # Check status
sudo journalctl -u homeos-pocketbase -n 50
sudo journalctl -u homeos-frontend -n 50
```

### Port already in use
```bash
sudo lsof -i :8090  # Check PocketBase port
sudo lsof -i :3000  # Check frontend port
```

### Build fails
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Migration fails
Automatic rollback occurs. Check logs:
```bash
cat deployment.log
sudo journalctl -u homeos-pocketbase -n 100
```

### Can't access via Tailscale
```bash
tailscale status          # Check Tailscale
sudo ufw allow 3000       # Ubuntu firewall
sudo ufw allow 8090
```

## Backup and Restore

### Backup
```bash
# Database backup (automatic during migrations)
mkdir -p backups
cp pocketbase/pb_data/data.db backups/data.db.$(date +%Y%m%d_%H%M%S)

# Environment backup
cp frontend/.env backups/.env.$(date +%Y%m%d_%H%M%S)
```

### Restore
```bash
sudo systemctl stop homeos-pocketbase
cp backups/data.db.YYYYMMDD_HHMMSS pocketbase/pb_data/data.db
sudo systemctl start homeos-pocketbase
```

## Scripts Reference

| Script | Description |
|--------|-------------|
| `install-pocketbase.sh` | Download and install PocketBase |
| `build.sh` | Build frontend for production |
| `deploy.sh` | Deploy with migrations and rollback |
| `setup-services.sh` | Set up systemd services |
| `setup-auto-update.sh` | Set up automatic updates |

## Security

1. **Use strong passwords** for PocketBase admin and users
2. **Regular backups** of `pocketbase/pb_data/data.db`
3. **Keep updated**: `git pull && sudo make deploy`
4. **Review migrations** before deploying
5. **Use deploy keys** for auto-updates (read-only GitHub access)
6. **Enable email verification** in PocketBase settings

## Production Checklist

- [ ] PocketBase installed and running
- [ ] Frontend built successfully
- [ ] Environment variables configured (VAPID keys)
- [ ] PocketBase admin account created
- [ ] First user account created
- [ ] Services enabled for auto-start
- [ ] Can access at http://localhost:3000
- [ ] (Optional) Tailscale configured
- [ ] (Optional) Auto-updates enabled
- [ ] (Optional) Backup strategy configured

---

**Need help?** Check [main README](../README.md) or [PocketBase docs](https://pocketbase.io/docs/)
