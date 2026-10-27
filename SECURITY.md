# Security: encryption at rest

Homestead can encrypt uploaded file bytes, extracted-text columns, and the
fields a resource declares `encrypted` at rest, so that the most sensitive part
of a stolen disk, database dump, or backup is unreadable without the master key.
It is **partial** by design — other structured fields, the search index, and
account rows stay in the clear (see [What is encrypted](#what-is-encrypted)). This document describes the trust model, how
keys work, and the operator's responsibilities.

## Threat model

The design protects **data at rest** under a **trusted server**:

- **Protects against:** theft of the data directory, the SQLite database, or a
  backup — anything obtained without the running server's memory. What is
  encrypted (below) is ciphertext without the master key; the rest of the
  database is not, so a stolen copy still exposes structured fields.
- **Does NOT protect against:** a compromised running server, root on the host,
  or the operator. The server holds the master key and decrypts on demand, so
  whoever controls the live server can read the data. This is a deliberate
  trade: it keeps server-side features (AI text extraction, chat over file
  contents) working and keeps password reset painless.

If you need files to be unreadable even to a compromised server or the operator,
this feature is not that — it does not implement end-to-end encryption.

## What is encrypted

- **File-field bytes** on disk (`data/files/...`).
- **Extracted-text companion columns** (`<field>_text`) in the database.
- **Encrypted fields**: any field a resource declares `encrypted: true`
  (strings, objects and arrays). Unlike the two above, these demand a key: on an
  instance with no master key, a write that sets one is refused (400) rather
  than stored in plaintext. They can't be filtered or sorted, since the
  database only holds ciphertext. The bundled apps declare a gift card's
  `card_number` and `pin`, and a household's `wifi_password`. An instance with
  no master key says which fields it can't save: the server logs it at boot,
  and `homestead doctor` lists them.
- **Secret fields**: a field declared `secret: true` is an encrypted field
  that is also **write-only**. No route returns its value — not to its owner,
  not to a superuser: reads get a descriptor (`{ $secret: true, set, set_time?,
  hint? }`), the change feed and exports carry the same, and secret fields are
  left out of the assistant's and MCP's tools entirely. Server code that uses
  one (calling a provider with a stored API key) reads it in-process
  (`readSecret` in `homestead-core/server/secrets.ts`), so a stolen session or
  token can replace or clear a secret but not take it. A field can't stop being
  secret while it holds values. Someone with shell access and the master key
  can still read them.

  **Credentials** (Superuser → Credentials) is where the household's API keys
  and tokens live: a superusers-only collection (`access: { model:
  'superusers' }`, superuser-only writes, out of the model tools) whose `value`
  is a secret field. Superusers add, list, replace and delete them; the page
  shows "Set · …3f9a · date", never the value. The browser never stores a typed
  value either — credential writes skip the offline queue and the optimistic
  cache. Server code reads one with `readCredential(id)`
  (`homestead-core/server/credentials.ts`). The keys Homestead itself needs
  (the AI and embedding keys, and any an app declares) are *credential slots*:
  stored under the slot's id, overridden by an environment variable, and read
  with `resolveCredential`. `GET /api/credential-slots` (superusers only) says
  where each comes from — config, env var, stored, or missing — never a value.

  **MCP servers** (Superuser → MCP servers) reference a credential for their
  bearer token; it's read in-process and attached only in
  `homestead-core/server/mcp/connect.ts`. A server URL may be on the home
  network but not at loopback, link-local (the cloud metadata service) or
  reserved addresses; every request the MCP client makes is re-checked and
  redirects are refused (`server/net/mcp-url.ts`; `HOMESTEAD_MCP_TRUSTED_HOSTS`
  exempts named hosts). New tools start off, so a description reaches a prompt
  only after a superuser has read it, and a server is usable only by groups
  it's shared with. Every tool call goes through one broker
  (`homestead-core/server/mcp/broker.ts`), which refuses an unshared server, a
  tool that's off or unknown, a tool beyond the share level (View → look-up
  tools only), and an "ask first" tool without approval — before anything is
  sent. Results come back labelled as untrusted outside data and capped in
  size. Each call is logged as an `mcp-call` row (superusers-only, written with
  a system token so a caller can't erase it, kept 90 days), with an argument
  summary but never the token or the result. The assistant is offered a
  server's tools per turn, within the speaker's share, from the description
  and argument schema stored at the last superuser check (never fetched from
  the server mid-turn); "ask first" tools wait for the person's approval, and
  results are framed to the model as outside data, not instructions
  (`homestead-core/server/chat/mcp-tools.ts`). The server's own `instructions`
  are stored but not given to the model.
  A server can sign in with OAuth instead of a token
  (`homestead-core/server/mcp/oauth.ts`, on `@ai-sdk/mcp`'s client): PKCE S256
  always; a random, single-use `state`, kept in memory for ten minutes and
  bound to the superuser and server that started it, with the code handed back
  by that superuser's own session (`:finish-connect`), never a bare callback; a
  `redirect_uri` that must be this Homestead's callback page. Tokens and client
  secrets are secret fields on an `oauth` credential, refreshed one at a time
  per credential, and attached only to the address the sign-in was made for
  (`oauth_resource`). Discovery, registration and token requests go through
  the MCP address policy with redirects refused.

Other structured fields (names, amounts, titles) are **not** encrypted unless
their resource declares them so, and neither are the account rows (`_users`
password hashes, `_tokens`). Treat a data directory or a backup as sensitive
even with encryption on.

### Known residual: the vector store

Extracted text is also written to the vector store as plaintext passages plus
embeddings, to power keyword and semantic search. Encrypting those would break
search, so — like the canonical column being encrypted while its search index
is not — the vector store is left as **cleartext guarded by the same database
access controls** as everything else. Treat it as a defense-in-depth surface,
not an encrypted one.

## How it works

Envelope encryption, per item:

1. A fresh random 32-byte **data-encryption key (DEK)** encrypts the bytes with
   AES-256-GCM.
2. A per-item **key-encryption key (KEK)**, derived from the master key and the
   resource path (HMAC-SHA256), wraps the DEK. Keying on the resource path gives
   per-resource isolation and lets a future master-key rotation re-wrap DEKs
   without re-encrypting the bulk data.

The wrapped DEK travels in a self-describing container alongside the ciphertext.
An authoritative database marker records whether an item is encrypted
(`enc:v1` for files, an `enc:v1:` prefix for text); the container magic is a
secondary cross-check. Legacy plaintext is detected and passes through
unchanged, so encryption can be turned on for an existing instance: text columns
(extracted text and encrypted fields) are encrypted at the next boot, and when a
field is newly declared encrypted; files migrate lazily as they are rewritten.
SQLite doesn't wipe what an update frees, so after encrypting text in place the
server checkpoints the WAL and `VACUUM`s the database — the old plaintext is
gone from the file, not just from the rows. Backups taken *before* still hold
it; replace them. Encryption is one way: a field can't be declared plain again
(remove the field instead). Anything that cannot be decrypted **fails
closed** — the server errors rather than serving ciphertext as content.

## The master key

A single 32-byte key per instance. The server resolves it in this order:

1. `HOMESTEAD_MASTER_KEY` — base64-encoded key inline (handy for containers), or
2. `HOMESTEAD_MASTER_KEY_FILE` — path to a file containing the same, or
3. the default key file at `~/.homestead/master.key`, if it exists.

The default-file step is the easy path: **`homestead key generate` writes that
file and the server loads it on the next boot — no environment variable to
set.** The env vars remain for containers and for pointing at a custom
location.

Encryption is **opt-in**: with no key configured the server behaves exactly as
before (plaintext). New writes are encrypted once the server sees a key.

### Enabling it

```bash
homestead key generate   # writes ~/.homestead/master.key (0600)
# ...back the key up somewhere separate from your data...
homestead start          # (or restart the service) — encryption is now on
```

`homestead init` also offers to do the `key generate` step for you. Existing
plaintext stays readable. Text columns — extracted text and encrypted fields —
are encrypted in place when the server boots with the key (and the database is
vacuumed, so the old plaintext doesn't linger in the file); files are
re-encrypted lazily the next time each one is written. Archives you made before
turning the key on still hold plaintext — replace them with a fresh backup.

**Without a key, encrypted fields can't be saved.** Gift cards (whose number is
encrypted) can't be added, and a household's WiFi password can't be set, until
the instance has a key. If you upgraded an instance set up without one, run
`homestead doctor` to see what's affected, then the steps above.

### Operator rules

1. **Keep the key out of the data directory and out of backups.** If the key is
   captured alongside the data, the encryption is worthless. `homestead doctor`
   fails if the key file sits inside the data dir, and `homestead backup`
   refuses to run in that situation.
2. **Back the key up separately** — a password manager or secrets store. If you
   lose it, encrypted data is unrecoverable; there is no recovery path.
3. **Lock the key file to `0600`.** `homestead key generate` does this;
   `homestead doctor` warns if it drifts.

## Tooling

```bash
homestead key generate      # write ~/.homestead/master.key (0600), refuse to clobber
homestead key show          # print the resolved key, to copy into a password manager
homestead backup            # archive the data dir (consistent db snapshot); refuses to include the key
homestead restore --verify  # check an archive end to end, including that this key matches it
homestead backup-key generate  # mint the keypair that encrypts archives outright (see below)
homestead doctor            # checks key presence, location, and permissions
```

For a systemd deployment, the default file works as long as it sits in the
service user's home (`~/.homestead/master.key`). If the service runs as a
different user, or you keep the key elsewhere, point at it explicitly by adding
`HOMESTEAD_MASTER_KEY_FILE=/path/to/master.key` to the unit's `.env`
(the generated service already loads it via `EnvironmentFile`).

## Encrypted backup archives

Encryption at rest is partial by design, so a backup archive still exposes
structured fields. `homestead backup-key generate` closes that gap for archives
specifically, by encrypting the whole archive to a public backup key.

It is deliberately asymmetric: the machine taking backups holds only the public
recipient, so it cannot decrypt what it writes. A stolen box — or an unattended
scheduled backup, which would otherwise need a secret sitting beside the data —
yields ciphertext. The private identity is printed once, never written to disk
unless explicitly requested, and is needed only to restore.

This does not change the at-rest picture on the running server; it changes what
a copied archive is worth. And it adds a second unrecoverable secret: losing the
backup identity makes every archive encrypted to it unreadable. Store it
somewhere separate from the master key, and verify the pair with `homestead
restore --verify --identity=…` before relying on it.

See [the backups guide](packages/homestead-site/docs/guides/backups.md) for the
format and the operational details.

## Related hardening

Resetting the superuser password (`homestead admin reset-password`) now revokes
that user's existing session tokens, so sessions minted under the old password
stop working.
