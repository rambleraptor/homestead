# aepbase

This directory is the staging area for migrating HomeOS off PocketBase and onto
**aepbase** — a dynamic, AEP-compliant REST backend (https://github.com/rambleraptor/aepbase).

The schema is managed with **Terraform** using the `aep-dev/aep` provider.

## Layout

```
aepbase/
├── install.sh        # clone + build aepbase into ./bin
├── run.sh            # run aepbase on :8090 with data in ./data
├── bin/              # built binary (gitignored)
├── src/              # upstream checkout (gitignored)
├── data/             # sqlite db (gitignored)
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

## What's NOT covered yet

- **Auth** — aepbase has no auth layer. The frontend currently relies on
  PocketBase's `users` collection + JWT. Auth is out of scope for the schema
  migration and needs its own solution (reverse proxy, embedding aepbase as a
  library with custom middleware, etc.).
- **File uploads** — aepbase has no file storage. Fields that were PB files
  (`front_image`, `receipt_file`, `image`) are now plain string URLs; storage
  needs to be solved separately.
- **Access rules / row-level security** — PB had per-collection access rules.
  aepbase does not.
- **The `users` collection** — built-in to PB, has no equivalent here yet.
- **The deleted `events` collection** (PB migration `1766131287`) is not
  recreated.
