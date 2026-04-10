# aepbase

This directory is the staging area for migrating HomeOS off PocketBase and onto
**aepbase** — a dynamic, AEP-compliant REST backend (https://github.com/rambleraptor/aepbase).

The schema is managed with **Terraform** using the `aep-dev/aep` provider.

## Layout

```
aepbase/
├── main.go           # thin wrapper that imports aepbase as a Go library
├── go.mod / go.sum   # module deps (pulls upstream aepbase)
├── install.sh        # `go build` the wrapper into ./bin/aepbase
├── run.sh            # run aepbase on :8090 with data in ./data
├── bin/              # built binary (gitignored)
├── data/             # sqlite db + uploaded files (gitignored)
└── terraform/        # schema-as-code
    ├── provider.tf
    ├── gift_cards.tf
    ├── credit_cards.tf
    ├── actions.tf
    ├── notifications.tf
    ├── people.tf
    ├── groceries.tf
    ├── recipes.tf
    └── hsa_receipts.tf
```

The wrapper exists because two features we need (`EnableUsers` and
`EnableFileFields`) are library-only opt-ins on upstream aepbase — they are
deliberately *not* exposed as CLI flags by the upstream `main.go`. Our
`main.go` flips both on before calling `aepbase.Run`.

## Quickstart

```bash
# 1. Build aepbase
./install.sh

# 2. Run it (leave this running in its own terminal)
./run.sh

# 3. In another terminal, apply the schema
cd terraform
export AEP_OPENAPI=http://localhost:8090/openapi.json
terraform init
terraform apply
```

After apply, the generated OpenAPI spec at `http://localhost:8090/openapi.json`
exposes CRUD endpoints for every resource definition — e.g.:

- `POST /gift-cards` — create a gift card
- `GET  /gift-cards/{id}` — fetch one
- `POST /gift-cards/{id}/transactions` — record a transaction under that card
- `POST /credit-cards/{id}/perks/{id}/redemptions` — nested 2 deep

## Parent / child resources

Where PocketBase used a cascade-delete relation, we model it as an AEP parent.
This gives nested URLs that encode ownership:

| Child                  | Parent        | URL pattern                                              |
|------------------------|---------------|----------------------------------------------------------|
| `transaction`          | `gift-card`   | `/gift-cards/{id}/transactions/{id}`                     |
| `perk`                 | `credit-card` | `/credit-cards/{id}/perks/{id}`                          |
| `redemption`           | `perk`        | `/credit-cards/{id}/perks/{id}/redemptions/{id}`         |
| `run`                  | `action`      | `/actions/{id}/runs/{id}`                                |
| `log`                  | `recipe`      | `/recipes/{id}/logs/{id}`                                |

All other PocketBase relations (e.g. `created_by → users`) are stored as plain
string fields holding the referenced resource path.

## Gotchas we hit (and how to avoid them)

1. **Terraform attribute names must be lowercase.** The provider turns a
   resource singular of `giftCard` into a URL param `giftCard_id`, which
   Terraform's plugin framework rejects. Use **kebab-case singulars**
   (`gift-card`) — they become valid `gift_card_id` params.

2. **aepbase strips JSON-schema validation fields on round-trip.** `enum`,
   `minimum`, `maximum`, etc. are silently dropped, which then causes the
   Terraform provider to fail with *"Provider produced inconsistent result
   after apply"*. Encode allowed values in `description` instead:
   ```hcl
   status = { type = "string", description = "one of: pending, running, success, error" }
   ```

3. **Child resources need explicit `depends_on`.** Terraform doesn't infer a
   dependency from the `parents = ["foo"]` string, so a child can be planned
   before its parent exists. Add `depends_on = [aep_aep-resource-definition.foo]`.

4. **`terraform init` reads the spec at init time.** If you add a new resource
   definition to aepbase out of band, run `terraform init -upgrade` so the
   provider re-reads `/openapi.json` and regenerates its resource types.

## Users and file fields

Both are enabled by `main.go` via library opt-ins.

- **Users** (`EnableUsers`): all requests except `POST /users/:login` require
  a Bearer token. On first run a default superuser is created and its
  credentials are printed to stdout — grab them from the `run.sh` log.
  Resources with `parents = ["user"]` are automatically scoped to the
  authenticated user.
- **File fields** (`EnableFileFields`): a property declared as
  `type = "binary"` with `x-aepbase-file-field = true` is stored on disk
  under `data/files/...` and exposed via a `:download` custom method.
  Create/update such resources with `multipart/form-data`.

See `src/docs/users.md` and `src/docs/file-fields.md` (or the upstream repo)
for the full HTTP contract.

## Still NOT covered

- **Access rules / row-level security beyond user scoping.** PocketBase had
  per-collection CEL-style rules; aepbase only enforces user-parent scoping.
- **The deleted `events` collection** (PB migration `1766131287`) is not
  recreated.
