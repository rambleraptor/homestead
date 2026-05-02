# Homestead

Homestead is my opinionated app for doing things at home.

It's built on top of [aepbase](https://www.github.com/rambleraptor/aepbase).

## Features
- Grocery list with notifications
- HSA receipt upload
- Credit card perk tracker
- Gift card tracker

> Want to run your own instance with a different mix of modules? See
> **[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ and npm
- Go (for building aepbase)
- Terraform (for applying schema)

### Installation

1. **Clone the repository**

```bash
git clone <your-repo-url>
cd homestead
```

2. **Build and start aepbase**

```bash
cd aepbase
./install.sh      # first time only — builds bin/aepbase
./run.sh          # serves on :8090
```

On first start, aepbase prints the superuser email + password to stdout.
**Save these credentials** — you'll need them to log in and to run
`terraform apply`.

3. **Apply the schema**

In a new terminal:

```bash
# Get an admin bearer token
TOKEN=$(curl -sS -X POST http://localhost:8090/users/:login \
    -H 'Content-Type: application/json' \
    -d '{"email":"<admin-email>","password":"<admin-pw>"}' | jq -r .token)

cd aepbase/terraform
TF_VAR_aepbase_token=$TOKEN \
    AEP_OPENAPI=http://localhost:8090/openapi.json \
    terraform apply
```

4. **Install frontend dependencies**

```bash
cd frontend
npm install
```

5. **Start the development server**

```bash
npm run dev
```

Open `http://localhost:3000` in your browser. The frontend proxies
aepbase at same-origin `/api/aep`.

6. **Log in**

Use the superuser credentials printed by aepbase, or create additional
users through the app's sign-up flow.

## Architecture

### aepbase

All data is stored in [aepbase](https://www.github.com/rambleraptor/aepbase), a local backend that conforms to the [AEP](https://www.aep.dev) API specification.

The frontend is completely optional. You can access your data through the AEP ecosystem of tools, such as a Terraform provider, CLI, [resource explorer UI](https://ui.aep.dev).

### Modular Design

Every feature is a **module** with its own:
- Components (`components/`)
- Hooks (`hooks/`)
- Types (`types.ts`)
- Configuration (`module.config.ts`) — declares the module's
  routes (with their React components), nav placement, dashboard
  widgets, and module flags

**Adding a new module:**
1. Create `packages/homestead-modules/<your-module>/` with a
   `module.config.ts` that declares `routes` (each with a `component`)
2. Add the import + array entry to `frontend/homestead.config.ts`
3. Done! No per-route page files, no registry edits — your module
   appears in the navigation automatically and the catch-all router
   serves its routes.

## 🚀 Production Deployment

For deploying Homestead on a local machine (accessible via Tailscale), see:

**[📖 Deployment Guide](deployment/README.md)** - Complete deployment instructions

The deployment package includes systemd service configurations for
aepbase and the Next.js frontend, plus management scripts and sample
production environment files.

## 📝 License

MIT License
