# aepbase

Homestead's backend is **aepbase** — a dynamic, AEP-compliant REST
backend (https://github.com/rambleraptor/aepbase). This directory is a
thin Go wrapper that imports aepbase as a library so we can opt into
the `EnableUsers` and `EnableFileFields` features (which are
deliberately not exposed as CLI flags upstream).

The schema is managed in **TypeScript**, not HCL. Each Homestead
feature module declares the aepbase collections it owns in a
`resources.ts` file next to its `module.config.ts`, and the Next.js
server applies them via the `/aep-resource-definitions` endpoint at
boot. See [`CLAUDE.md` § aepbase schema](../CLAUDE.md#aepbase-schema-typescript).

## Layout

```
aepbase/
├── main.go           # thin wrapper that imports aepbase as a Go library
├── go.mod / go.sum   # module deps (pulls upstream aepbase)
├── install.sh        # `go build` the wrapper into ./bin/aepbase
├── run.sh            # run aepbase on :8090 with data in ./data
├── bin/              # built binary (gitignored)
└── data/             # sqlite db + uploaded files (gitignored)
```

## Quickstart

```bash
# 1. Build aepbase
./install.sh

# 2. Run it (leave this running in its own terminal)
./run.sh
```

On first start, aepbase prints the superuser email + password to
stdout. Set them as `AEPBASE_ADMIN_EMAIL` / `AEPBASE_ADMIN_PASSWORD`
in `frontend/.env.local` so the schema sync runs when the Next.js
server boots — that's the only step needed to register the schema.

After the frontend has run once with admin credentials, the OpenAPI
spec at `http://localhost:8090/openapi.json` exposes CRUD endpoints
for every resource definition — e.g.:

- `POST /gift-cards` — create a gift card
- `GET  /gift-cards/{id}` — fetch one
- `POST /gift-cards/{id}/transactions` — record a transaction under that card
- `POST /credit-cards/{id}/perks/{id}/redemptions` — nested 2 deep

## Parent / child resources

Where PocketBase used a cascade-delete relation, we model it as an AEP
parent. This gives nested URLs that encode ownership:

| Child                  | Parent        | URL pattern                                              |
|------------------------|---------------|----------------------------------------------------------|
| `transaction`          | `gift-card`   | `/gift-cards/{id}/transactions/{id}`                     |
| `perk`                 | `credit-card` | `/credit-cards/{id}/perks/{id}`                          |
| `redemption`           | `perk`        | `/credit-cards/{id}/perks/{id}/redemptions/{id}`         |
| `run`                  | `action`      | `/actions/{id}/runs/{id}`                                |
| `log`                  | `recipe`      | `/recipes/{id}/logs/{id}`                                |

All other PocketBase relations (e.g. `created_by → users`) are stored
as plain string fields holding the referenced resource path.

## Users and file fields

Both are enabled by `main.go` via library opt-ins.

- **Users** (`EnableUsers`): all requests except `POST /users/:login`
  require a Bearer token. On first run a default superuser is created
  and its credentials are printed to stdout — grab them from the
  `run.sh` log. Resources with `parents = ["user"]` are automatically
  scoped to the authenticated user.
- **File fields** (`EnableFileFields`): a property declared as
  `type: 'binary'` with `'x-aepbase-file-field': true` is stored on
  disk under `data/files/...` and exposed via a `:download` custom
  method. Create/update such resources with `multipart/form-data`.

## Still NOT covered

- **Access rules / row-level security beyond user scoping.** PocketBase
  had per-collection CEL-style rules; aepbase only enforces
  user-parent scoping.
- **The deleted `events` collection** (PB migration `1766131287`) is
  not recreated.
