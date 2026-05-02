# HomeOS Deployment Guide

Simple deployment for HomeOS on Linux with systemd.

## Quick Setup

```bash
# 1. Install aepbase (builds the Go wrapper)
./deployment/install-aepbase.sh

# 2. Start aepbase once to bootstrap the superuser
cd aepbase && ./run.sh
# Copy the printed admin email + password. Ctrl-C when you're done.
# (The schema is applied automatically by the Next.js server on boot —
# set AEPBASE_ADMIN_EMAIL / AEPBASE_ADMIN_PASSWORD in step 3.)

# 3. Build frontend
./deployment/build.sh

# 4. Configure environment
cp deployment/.env.production frontend/.env
# Set AEPBASE_ADMIN_EMAIL / AEPBASE_ADMIN_PASSWORD to the superuser
# creds from step 2 so the schema sync runs at boot.
# Generate VAPID keys: cd frontend && npx web-push generate-vapid-keys
# Edit frontend/.env and add your VAPID public key.

# 5. Set up systemd services
sudo make setup-services

# 6. Start services
sudo make start

# 7. Access HomeOS at http://localhost:3000
```

## Prerequisites

- Linux with systemd (Ubuntu, Debian, Fedora, etc.)
- Node.js 20+
- Go 1.25+ (for building aepbase)
- Git

Install on Ubuntu/Debian:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git golang-go
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

```bash
sudo make deploy
```

The deploy script:
- Detects changes (aepbase source, frontend, dependencies) between the
  current and target commit
- Rebuilds only what changed
- Rebuilds and restarts aepbase if `aepbase/` changed
- Rebuilds and restarts the frontend if `frontend/` changed
- Rolls back (git reset --hard) on failure
- Verifies both services came back up

### Schema changes (per-module `resources.ts`)

**Auto-applied on Next.js boot.** Resource definitions live alongside
each module (`packages/homestead-modules/<module>/resources.ts`); the
Next.js instrumentation hook diffs them against aepbase and POST/PATCHes
on startup. After deploying a schema change, restart the frontend
service so the new definitions take effect:

```bash
sudo systemctl restart homeos-frontend
```

If the change drops or renames a resource, delete the affected
definition manually first (`DELETE /aep-resource-definitions/...`).
aepbase preserves data across schema updates but does not support
mutating a field's `type` or changing `parents` on an existing
definition — delete + recreate in those cases. See `CLAUDE.md` for the
full set of schema-evolution gotchas.

### Automatic Updates

Set up automatic deployment (pulls from GitHub every 10 minutes):

```bash
sudo make setup-auto-update
sudo systemctl enable homeos-auto-update.timer
sudo systemctl start homeos-auto-update.timer
sudo systemctl status homeos-auto-update.timer
```

Configure update frequency by editing `/etc/systemd/system/homeos-auto-update.timer`:
```ini
[Timer]
OnBootSec=1min
OnUnitActiveSec=10min
```

Then reload: `sudo systemctl daemon-reload && sudo systemctl restart homeos-auto-update.timer`

### Rollback

If deployment fails, the script automatically `git reset --hard`s to the
previous commit and restarts services. For manual rollback:

```bash
sudo systemctl stop homeos-aepbase homeos-frontend

# aepbase data lives in aepbase/data/. Back it up if concerned before
# touching the binary:
cp -a aepbase/data aepbase/data.backup.$(date +%Y%m%d_%H%M%S)

# Rollback code
git reset --hard HEAD~1

# Rebuild aepbase if its Go source changed
cd aepbase && ./install.sh && cd ..

sudo systemctl start homeos-aepbase homeos-frontend
```

## Tailscale Access (Optional)

Access HomeOS from anywhere on your Tailscale network:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4

# Then point the frontend's aepbase proxy at the Tailscale IP. Either:
#   - set AEPBASE_URL in frontend/.env and rebuild, or
#   - leave the proxy at localhost and rely on frontend access via
#     http://<tailscale ip>:3000 (aepbase stays on localhost).

./deployment/build.sh
sudo make restart
```

## Configuration

### Environment variables

Edit `frontend/.env`:
```bash
# Proxy targets (Next.js server-side — do NOT prefix with NEXT_PUBLIC_)
AEPBASE_URL=http://127.0.0.1:8090

# VAPID keys for web push
NEXT_PUBLIC_VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY_HERE
VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY_HERE
VAPID_PRIVATE_KEY=YOUR_VAPID_PRIVATE_KEY_HERE
VAPID_EMAIL=mailto:admin@example.com

# Admin credentials for the notification cron (superuser only)
AEPBASE_ADMIN_EMAIL=admin@example.com
AEPBASE_ADMIN_PASSWORD=<superuser password>

# Gemini for OCR routes (optional)
GEMINI_API_KEY=...
```

Generate VAPID keys:
```bash
cd frontend && npx web-push generate-vapid-keys
```

### Service configuration

Systemd services are in `deployment/systemd/`:
- `aepbase.service` — aepbase on port 8090
- `homeos-frontend.service` — Next.js on port 3000
- `homeos-auto-update.service` — Auto-update service
- `homeos-auto-update.timer` — Update schedule

View logs:
```bash
make logs                    # Both services
make logs-aepbase            # aepbase only
make logs-frontend           # Frontend only
sudo journalctl -u homeos-aepbase -n 100
```

## Troubleshooting

### Services won't start
```bash
make status
sudo journalctl -u homeos-aepbase -n 50
sudo journalctl -u homeos-frontend -n 50
```

### Port already in use
```bash
sudo lsof -i :8090
sudo lsof -i :3000
```

### Build fails
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Schema sync fails
- Look for `[resources] schema sync failed` in the frontend logs.
- "cannot change type" / "changing parents is not supported": delete
  the resource definition (DELETE /aep-resource-definitions/...) and
  restart the frontend so the runner re-creates it. Data is wiped —
  only do this in dev.
- "401" / "forbidden": `AEPBASE_ADMIN_EMAIL` / `AEPBASE_ADMIN_PASSWORD`
  in `frontend/.env` are wrong or the password rotated.

### Can't access via Tailscale
```bash
tailscale status
sudo ufw allow 3000
sudo ufw allow 8090
```

## Backup and Restore

### Backup
```bash
# aepbase data (SQLite + uploaded files)
mkdir -p backups
cp -a aepbase/data backups/aepbase-data.$(date +%Y%m%d_%H%M%S)

# Environment
cp frontend/.env backups/.env.$(date +%Y%m%d_%H%M%S)
```

### Restore
```bash
sudo systemctl stop homeos-aepbase
rm -rf aepbase/data
cp -a backups/aepbase-data.YYYYMMDD_HHMMSS aepbase/data
sudo systemctl start homeos-aepbase
```

## Scripts Reference

| Script | Description |
|--------|-------------|
| `install-aepbase.sh` | Build aepbase from Go source |
| `build.sh` | Build frontend for production |
| `deploy.sh` | Deploy with rollback on failure |
| `setup-services.sh` | Set up systemd services |
| `setup-auto-update.sh` | Set up automatic updates |

## Security

1. **Use strong passwords** for the aepbase superuser.
2. **Regular backups** of `aepbase/data/` (SQLite DB + uploaded files).
3. **Keep updated**: `git pull && sudo make deploy`.
4. **Review `packages/homestead-modules/*/resources.ts` diffs** before
   restarting the frontend after a schema change.
5. **Use deploy keys** for auto-updates (read-only GitHub access).

## Production Checklist

- [ ] aepbase built and running
- [ ] Frontend built successfully
- [ ] Environment variables configured (VAPID keys, admin creds)
- [ ] Schema synced (look for `[resources]` log line on frontend boot)
- [ ] Services enabled for auto-start
- [ ] Can access at http://localhost:3000
- [ ] (Optional) Tailscale configured
- [ ] (Optional) Auto-updates enabled
- [ ] (Optional) Backup strategy configured
