# 🚀 HomeOS Deployment Guide

This guide will help you deploy HomeOS on a local machine accessible via Tailscale.

## 📋 Table of Contents

- [Auto-Deployment](#auto-deployment)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Detailed Setup](#detailed-setup)
- [Configuration](#configuration)
- [Service Management](#service-management)
- [Tailscale Access](#tailscale-access)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)

## Auto-Deployment

**NEW:** HomeOS now supports automatic deployment with GitHub Actions!

When you push to your main branch:
- ✅ Automatically runs CI checks (lint, type-check, build, tests)
- ✅ Deploys to your production server via SSH
- ✅ Automatically applies PocketBase migrations
- ✅ Creates database backups before migrations
- ✅ Rolls back on failure

**👉 [See Auto-Deployment Setup Guide](AUTO_DEPLOY.md)**

To set up auto-deployment, you'll need:
1. A production server running HomeOS
2. SSH access configured
3. GitHub repository secrets configured

**Quick Auto-Deploy Setup:**
```bash
# 1. Set up your server (follow Quick Start below)
# 2. Generate SSH key for GitHub Actions
ssh-keygen -t ed25519 -C "github-actions@homeOS" -f ~/.ssh/github_deploy_key -N ""
cat ~/.ssh/github_deploy_key.pub >> ~/.ssh/authorized_keys

# 3. Add secrets to GitHub (see AUTO_DEPLOY.md)
# 4. Push to main branch - automatic deployment! 🚀
```

## Prerequisites

- **Operating System**: Linux (systemd-based)
- **Node.js**: Version 20 or higher
- **npm**: Comes with Node.js
- **Git**: For cloning and updating the repository
- **Tailscale** (optional): For remote access to your HomeOS instance

### Installing Prerequisites

#### Ubuntu/Debian
```bash
# Update package list
sudo apt update

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# Install Tailscale (optional)
curl -fsSL https://tailscale.com/install.sh | sh
```

#### Fedora/RHEL
```bash
# Install Node.js 20.x
sudo dnf module enable nodejs:20
sudo dnf install nodejs git

# Install Tailscale (optional)
curl -fsSL https://tailscale.com/install.sh | sh
```

## Quick Start

For those who want to get up and running quickly:

```bash
# 1. Clone the repository
git clone <your-repo-url> homeOS
cd homeOS

# 2. Install PocketBase
./deployment/install-pocketbase.sh

# 3. Build the frontend
./deployment/build.sh

# 4. Configure environment
cp deployment/.env.production frontend/.env
# Edit frontend/.env and set your VAPID keys (see Configuration section)

# 5. Set up systemd services
sudo ./deployment/setup-services.sh

# 6. Start services
sudo ./deployment/start.sh

# 7. Access HomeOS at http://localhost:3000
```

## Detailed Setup

### Step 1: Clone the Repository

```bash
git clone <your-repo-url> homeOS
cd homeOS
```

### Step 2: Install PocketBase

The `install-pocketbase.sh` script will download and set up PocketBase:

```bash
chmod +x deployment/*.sh
./deployment/install-pocketbase.sh
```

This creates a `pocketbase/` directory with the PocketBase binary.

### Step 3: Build the Frontend

```bash
./deployment/build.sh
```

This will:
- Install frontend dependencies
- Build the production bundle to `frontend/dist/`

### Step 4: Configure Environment

#### Generate VAPID Keys (for Web Push Notifications)

```bash
cd frontend
npx web-push generate-vapid-keys
```

This will output something like:
```
=======================================

Public Key:
BEL8xH1kLqr8C9F0b3X7Y_Z5K6J4W8Q2M1N3P5R7T9V0A2C4E6G8I0K2M4O6Q8S0U2W4Y6A8C0E2G4I6K8M0O2

Private Key:
abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ

=======================================
```

#### Configure Frontend Environment

```bash
cd ..  # Back to project root
cp deployment/.env.production frontend/.env
```

Edit `frontend/.env` and update:

1. **VAPID Public Key**: Replace `YOUR_VAPID_PUBLIC_KEY_HERE` with the public key you generated
2. **PocketBase URL** (optional): If accessing via Tailscale, update to your Tailscale hostname

Example `frontend/.env`:
```bash
VITE_POCKETBASE_URL=http://127.0.0.1:8090
VITE_APP_NAME=HomeOS
VITE_VAPID_PUBLIC_KEY=BEL8xH1kLqr8C9F0b3X7Y_Z5K6J4W8Q2M1N3P5R7T9V0A2C4E6G8I0K2M4O6Q8S0U2W4Y6A8C0E2G4I6K8M0O2
```

### Step 5: Set Up Systemd Services

This script configures and enables systemd services for automatic startup:

```bash
sudo ./deployment/setup-services.sh
```

This creates two services:
- `homeos-pocketbase.service` - Runs PocketBase on port 8090
- `homeos-frontend.service` - Serves the frontend on port 3000

### Step 6: Start Services

```bash
sudo ./deployment/start.sh
```

### Step 7: Initial PocketBase Configuration

1. Open PocketBase Admin UI: `http://localhost:8090/_/`
2. Create an admin account for PocketBase
3. The database collections will be created automatically from migrations
4. Add the VAPID private key to PocketBase:
   - Go to Settings → Mail settings (or a custom field)
   - Store your VAPID private key securely in PocketBase settings

### Step 8: Create Your First User

In the PocketBase Admin UI:
1. Go to **Collections** → **users**
2. Click **New record**
3. Fill in:
   - Email: Your email
   - Password: Your password
   - Name: Your name (optional)
   - Verified: ✓ (check this box)
4. Save

Now you can log in to HomeOS!

## Configuration

### Environment Variables

All frontend environment variables must be prefixed with `VITE_` to be accessible in the application.

#### Required Variables

- `VITE_POCKETBASE_URL` - URL where PocketBase is running
- `VITE_APP_NAME` - Application name (default: HomeOS)
- `VITE_VAPID_PUBLIC_KEY` - Public key for web push notifications

#### For Local-Only Access

```bash
VITE_POCKETBASE_URL=http://127.0.0.1:8090
```

#### For Tailscale Access

```bash
# Use your machine's Tailscale IP or hostname
VITE_POCKETBASE_URL=http://100.x.x.x:8090
# or
VITE_POCKETBASE_URL=http://my-machine.tailnet-name.ts.net:8090
```

### Service Configuration

Systemd service files are located in `deployment/systemd/`:

- `pocketbase.service` - PocketBase service configuration
- `homeos-frontend.service` - Frontend service configuration

The `setup-services.sh` script automatically updates these with your actual paths and username.

## Service Management

### Start Services
```bash
sudo ./deployment/start.sh
# or
sudo systemctl start homeos-pocketbase homeos-frontend
```

### Stop Services
```bash
sudo ./deployment/stop.sh
# or
sudo systemctl stop homeos-pocketbase homeos-frontend
```

### Restart Services
```bash
sudo ./deployment/restart.sh
# or
sudo systemctl restart homeos-pocketbase homeos-frontend
```

### Check Status
```bash
./deployment/status.sh
# or
sudo systemctl status homeos-pocketbase
sudo systemctl status homeos-frontend
```

### View Logs
```bash
# Follow PocketBase logs
sudo journalctl -u homeos-pocketbase -f

# Follow Frontend logs
sudo journalctl -u homeos-frontend -f

# View both
sudo journalctl -u homeos-pocketbase -u homeos-frontend -f
```

### Enable/Disable Auto-Start on Boot

Services are automatically enabled during setup. To disable:

```bash
# Disable auto-start
sudo systemctl disable homeos-pocketbase
sudo systemctl disable homeos-frontend

# Re-enable auto-start
sudo systemctl enable homeos-pocketbase
sudo systemctl enable homeos-frontend
```

## Tailscale Access

### Setting Up Tailscale

1. **Install Tailscale** (if not already installed):
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   ```

2. **Authenticate**:
   ```bash
   sudo tailscale up
   ```

3. **Get your Tailscale IP**:
   ```bash
   tailscale ip -4
   ```

### Accessing HomeOS via Tailscale

Once Tailscale is set up, you can access HomeOS from any device on your Tailscale network:

```
http://YOUR_TAILSCALE_IP:3000
```

Or use the MagicDNS hostname:
```
http://your-machine-name.tailnet-name.ts.net:3000
```

### Updating Frontend for Tailscale

If you want the frontend to connect to PocketBase via Tailscale (instead of localhost), update `frontend/.env`:

```bash
VITE_POCKETBASE_URL=http://YOUR_TAILSCALE_IP:8090
```

Then rebuild and restart:
```bash
./deployment/build.sh
sudo ./deployment/restart.sh
```

**Note**: When using Tailscale URLs, you'll need to access HomeOS via the same Tailscale network, or both localhost and Tailscale access won't work simultaneously with the same frontend build.

## Updating

When you want to update HomeOS to the latest version:

```bash
./deployment/update.sh
```

This script will:
1. Pull the latest changes from git
2. Install any new dependencies
3. Run tests and checks
4. Rebuild the frontend

After updating, restart the services:
```bash
sudo ./deployment/restart.sh
```

## Troubleshooting

### Services Won't Start

**Check service status:**
```bash
sudo systemctl status homeos-pocketbase
sudo systemctl status homeos-frontend
```

**Check logs:**
```bash
sudo journalctl -u homeos-pocketbase -n 50
sudo journalctl -u homeos-frontend -n 50
```

**Common issues:**
- Port already in use (8090 or 3000)
- Incorrect file permissions
- Missing dependencies

### Frontend Build Fails

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### PocketBase Migration Issues

```bash
# Stop PocketBase
sudo systemctl stop homeos-pocketbase

# Backup database
cp pocketbase/pb_data/data.db pocketbase/pb_data/data.db.backup

# Check migrations
ls -la pb_migrations/

# Start PocketBase manually to see errors
cd pocketbase
./pocketbase serve
```

### Can't Access via Tailscale

**Check Tailscale status:**
```bash
tailscale status
```

**Verify IP:**
```bash
tailscale ip -4
```

**Check firewall:**
```bash
# Ubuntu/Debian
sudo ufw status
sudo ufw allow 3000
sudo ufw allow 8090

# Fedora/RHEL
sudo firewall-cmd --list-all
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=8090/tcp
sudo firewall-cmd --reload
```

### Web Push Notifications Not Working

1. **Check VAPID keys are set correctly** in `frontend/.env`
2. **Verify VAPID private key** is configured in PocketBase
3. **Check browser console** for errors
4. **Ensure HTTPS** if accessing remotely (Tailscale provides this via MagicDNS)

## Scripts Reference

| Script | Description |
|--------|-------------|
| `install-pocketbase.sh` | Downloads and installs PocketBase |
| `build.sh` | Builds the frontend for production |
| `setup-services.sh` | Sets up systemd services (requires sudo) |
| `start.sh` | Starts all services (requires sudo) |
| `stop.sh` | Stops all services (requires sudo) |
| `restart.sh` | Restarts all services (requires sudo) |
| `status.sh` | Shows service status |
| `update.sh` | Updates code and rebuilds |

## Production Checklist

- [ ] PocketBase installed and running
- [ ] Frontend built successfully
- [ ] Environment variables configured (including VAPID keys)
- [ ] PocketBase admin account created
- [ ] First user account created
- [ ] Services enabled for auto-start
- [ ] Can access HomeOS at http://localhost:3000
- [ ] (Optional) Tailscale configured and accessible
- [ ] (Optional) Backups configured for `pocketbase/pb_data/`

## Security Recommendations

1. **Change default ports** if exposing to a wider network
2. **Use strong passwords** for PocketBase admin and user accounts
3. **Keep Tailscale updated** for security patches
4. **Regular backups** of `pocketbase/pb_data/data.db`
5. **Update HomeOS regularly** using `./deployment/update.sh`
6. **Review PocketBase API rules** in the admin UI
7. **Enable email verification** for new users in PocketBase settings

## Backup and Restore

### Backup

```bash
# Create backup directory
mkdir -p backups

# Backup PocketBase database
cp pocketbase/pb_data/data.db backups/data.db.$(date +%Y%m%d_%H%M%S)

# Backup environment config
cp frontend/.env backups/.env.$(date +%Y%m%d_%H%M%S)
```

### Restore

```bash
# Stop PocketBase
sudo systemctl stop homeos-pocketbase

# Restore database
cp backups/data.db.YYYYMMDD_HHMMSS pocketbase/pb_data/data.db

# Start PocketBase
sudo systemctl start homeos-pocketbase
```

## Support

For issues and questions:
- Check the [main README](../README.md)
- Review [PocketBase documentation](https://pocketbase.io/docs/)
- Check [Tailscale documentation](https://tailscale.com/kb/)
- Open an issue on GitHub

---

**🎉 Enjoy your self-hosted HomeOS!**
