# ⚡ Quick Start - HomeOS Deployment

Get HomeOS running in 5 minutes!

## Prerequisites

- Linux machine with systemd
- Node.js 20+
- Git

## Installation Steps

### 1️⃣ Install PocketBase
```bash
./deployment/install-pocketbase.sh
```

### 2️⃣ Build Frontend
```bash
./deployment/build.sh
```

### 3️⃣ Configure Environment

Generate VAPID keys:
```bash
cd frontend
npx web-push generate-vapid-keys
cd ..
```

Copy and edit the environment file:
```bash
cp deployment/.env.production frontend/.env
nano frontend/.env  # Add your VAPID public key
```

### 4️⃣ Set Up Services
```bash
sudo ./deployment/setup-services.sh
```

### 5️⃣ Start HomeOS
```bash
sudo ./deployment/start.sh
```

### 6️⃣ Configure PocketBase

1. Open http://localhost:8090/_/
2. Create admin account
3. Go to Collections → users → New record
4. Create your user account (check "Verified")

### 7️⃣ Access HomeOS

Open http://localhost:3000 and log in!

## Tailscale Access (Optional)

1. Install Tailscale:
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   ```

2. Get your IP:
   ```bash
   tailscale ip -4
   ```

3. Access from any device on your Tailscale network:
   ```
   http://YOUR_TAILSCALE_IP:3000
   ```

## Common Commands

```bash
# Check status
./deployment/status.sh

# Restart services
sudo ./deployment/restart.sh

# View logs
sudo journalctl -u homeos-pocketbase -f
sudo journalctl -u homeos-frontend -f

# Update HomeOS
./deployment/update.sh
sudo ./deployment/restart.sh
```

## Need Help?

See [deployment/README.md](README.md) for detailed documentation.

---

**That's it! 🎉**
