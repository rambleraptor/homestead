# Backups & Restore

Homestead keeps everything in one data directory — the SQLite databases and
every uploaded file. `homestead backup` archives it; `homestead restore` puts
it back, or checks that it could.

```bash
homestead backup-key generate                      # once: mint the key that encrypts archives
homestead backup                                   # → homestead-backup-<timestamp>.tar.gz.enc
homestead restore --from=…  --verify --identity=…  # prove it can be restored
homestead restore --from=…  --force  --identity=…  # actually restore it
```

## Taking a backup

Run it from your project directory (it reads `<project>/data` by default, or
`--data-dir=PATH`):

```bash
homestead backup --out=/mnt/nas/homestead-2026-08-23.tar.gz
```

You can run it while the server is up. The databases are captured with
SQLite's `VACUUM INTO`, which takes a consistent point-in-time copy inside a
read transaction, so the archive never contains a half-written database or a
write-ahead log that has drifted from it. The live `.db`, `-wal`, and `-shm`
files are deliberately left out — the snapshot replaces them.

The archive is a plain `.tar.gz`. Members sit at the root, so extracting it
gives you a data directory directly:

```
homestead-backup.json      # manifest (see below)
aepbase.db                 # consistent snapshot
vectors.db                 # consistent snapshot
files/…                    # uploaded file bytes
```

## Encrypting the archive

Run this once:

```bash
homestead backup-key generate
```

It prints a **backup identity** — the secret — and writes only the matching
**recipient** (the public half) to `~/.homestead/backup-recipient.pub`. From
then on every `homestead backup` encrypts the whole archive to that recipient,
with no extra flag.

The lopsidedness is the point. The machine taking backups holds only the public
key, so **it cannot read back anything it has written**. Steal the box and you
get ciphertext. Run backups from cron with no human present and there is still
no secret on disk to steal. Only the identity opens an archive, and the identity
is meant to live somewhere else entirely — a password manager, a secrets store,
a piece of paper in a drawer.

That cuts the other way too, and there is no softening it: **nothing on the
machine can regenerate the identity.** Lose it and every archive encrypted to it
is unreadable, permanently. Store it the moment it is printed, and prove the
pair works before you rely on it:

```bash
homestead backup
homestead restore --from=<archive> --verify --identity=<the identity>
```

If you want same-box restores without fetching the key, `backup-key generate
--out=PATH` also writes the identity to disk at `0600` — but understand you
have traded away the main benefit: a thief who takes the box can now read its
archives.

An encrypted archive is genuinely safe to store anywhere: a cloud bucket, a NAS,
a friend's disk. It carries a small plaintext header saying when it was written,
by which homestead release, and which backup key opens it — enough to sort a
shelf of archives without any key present. Everything else, including the file
listing and the manifest, is inside the encryption.

Restoring one may need **two** secrets: the backup identity to open the archive,
and (if encryption at rest is on) the master key to read the file bytes inside
it. They protect different things and should be stored separately.

## How sensitive is an unencrypted archive?

Without a backup key, more than you might expect — and `homestead backup` tells
you which case you are in when it finishes.

**With no master key**, encryption at rest is off and the archive is entirely
plaintext — your whole household database and every uploaded file. Store it
the way you'd store the data directory itself.

**With a master key**, encryption covers uploaded file bytes, extracted-text
columns, and fields a resource declares `encrypted`. Everything else is still
readable: other structured fields (names, amounts), the search index in `vectors.db`, and the
account rows (password hashes, session tokens). So an encrypted-at-rest
archive is safer, but it is not safe to store just anywhere. See
[SECURITY.md](https://github.com/rambleraptor/homestead/blob/main/SECURITY.md)
for exactly what is and isn't encrypted.

Neither key is ever in the archive. `homestead backup` refuses to run if your
master key file sits inside the data directory, because that would put the key
and the data it protects in the same tarball, and the backup identity is never
written to disk at all unless you ask for it.

Because the default archive lands in the directory you run the command from —
usually your project, usually a git checkout — `homestead init` scaffolds a
`.gitignore` that covers it:

```
homestead-backup-*.tar.gz
*.pre-restore-*
```

If your project predates those lines, add them. Otherwise a stray `git add .`
commits your whole household to a repo, and rewriting that history afterwards
is a bad afternoon.

**Back the key up separately** — a password manager or a secrets store.
`homestead key show` prints it. Without it, the encrypted files in an archive
cannot be read, and there is no recovery path.

## The manifest

Every archive carries a `homestead-backup.json` describing itself:

| Field | What it's for |
| --- | --- |
| `format` | Manifest layout version; a newer archive refuses to restore on an older homestead. |
| `created_at`, `homestead_version` | When it was taken, and by which release. |
| `data_dir_name` | The data directory it came from. |
| `encryption.enabled` | Whether encryption at rest was on. |
| `encryption.key_id` | Which master key was in force — an HMAC fingerprint, never the key itself. |
| `databases` | Which members are database snapshots. |
| `files` | Every archived file with its size and SHA-256. |

The `key_id` is what stops the worst restore failure: putting an archive back
under a *different* master key, where the encrypted files come back as
undecryptable garbage instead of a clear error. `homestead key generate
--force` makes that possible, so restore checks the fingerprint first.

## Verifying an archive

An untested backup is not a backup. `--verify` runs every check a real restore
runs — extract, checksum every file against the manifest, integrity-check each
database, confirm the configured master key matches — and then throws the
extraction away without touching your data directory:

```bash
homestead restore --from=/mnt/nas/homestead-2026-08-23.tar.gz --verify
```

```
archive is encrypted to backup key 1e4c207769dae3ca
archive written 2026-08-23T22:34:16.615Z by homestead 0.2.0
  3 files match their checksums
  2 databases pass their integrity check
  master key matches the one this archive was written under

/mnt/nas/homestead-2026-08-23.tar.gz.enc is intact and restorable.
```

For an encrypted archive this is the check that matters most: it proves the
identity you kept actually opens the archives you have been writing. A backup
key that turns out not to match is the kind of thing you want to find out about
now, not during a restore.

Worth running against your newest archive on a schedule — it is the only thing
that turns "I have backups" into "I have backups that work".

## Restoring

Stop the server first, then:

```bash
homestead restore --from=/mnt/nas/homestead-2026-08-23.tar.gz --force
```

Restore runs every `--verify` check before it changes anything, so a damaged
archive, a corrupt database, or the wrong master key stops the restore with
your existing data untouched.

`--force` is required when the target data directory already holds data. Even
then nothing is deleted: the existing directory is renamed to
`<data-dir>.pre-restore-<timestamp>` and the restored one moves into place, so
a restore from the wrong archive is reversible. Delete the `.pre-restore-…`
copy yourself once you're satisfied.

Start the server afterwards; the schema sync runs on boot as usual.

### Flags

| Flag | |
| --- | --- |
| `--from=PATH` | Archive to restore. Required. |
| `--data-dir=PATH` | Where to restore to (default `<project>/data`). |
| `--verify` | Run the checks and restore nothing. |
| `--force` | Replace a non-empty data directory (renamed aside, not deleted). |
| `--allow-key-mismatch` | Restore even though the archive names a different master key. Only when you know why they differ. |
| `--identity=KEY\|PATH` | The backup identity that opens an encrypted archive. Also read from `HOMESTEAD_BACKUP_IDENTITY`, or `~/.homestead/backup.key`. |

### When a check fails

- **"does not match its manifest"** — the archive is damaged, or a file changed
  while the backup ran. Nothing is restored. Use a different archive; if this is
  the only copy, extract it by hand with `tar` to salvage what is readable.
- **"no master key is configured here"** — the archive holds encrypted files.
  Put the key back (`HOMESTEAD_MASTER_KEY`, `HOMESTEAD_MASTER_KEY_FILE`, or
  `~/.homestead/master.key`) and retry.
- **"was written under master key …"** — the configured key isn't the one this
  archive belongs to. Find the original key, or pass `--allow-key-mismatch` if
  you expect the difference (its encrypted files will stay unreadable).
- **"has no homestead-backup.json"** — not a `homestead backup` archive, or one
  from before manifests. Extract it by hand if you trust it.
- **"encrypted to backup key …, and opening it needs the matching backup
  identity"** — the archive is encrypted and no identity was supplied. Fetch it
  from wherever you stored it and pass `--identity`.
- **"but the identity supplied is for backup key …"** — that identity belongs to
  a different backup key. The message names both fingerprints; find the identity
  printed when this archive's recipient was generated.
- **"could not be decrypted"** — the archive has been altered or truncated in
  storage or transfer. Every 64 KiB chunk is authenticated, and the last chunk is
  marked as such, so a cut-off archive is detected rather than restored as a
  partial data directory.

## How the encryption works

Worth knowing if you are evaluating whether to trust it.

Each archive gets a fresh random data key. That key is wrapped for the recipient
using X25519 key agreement against a one-time ephemeral keypair, with HKDF-SHA256
deriving the wrapping key — so an archive reveals nothing about any other
archive, and the recipient's public key is all the writing machine ever needs.
The whole plaintext header is bound into the wrap, so editing the recorded date
or recipient invalidates the archive.

The body is not one big encrypted blob. It is 64 KiB chunks, each sealed with
AES-256-GCM under a nonce carrying the chunk's position and a flag marking the
final chunk. That matters for two reasons: every chunk is authenticated *before*
it is handed to `tar`, so tampered data never reaches the extractor; and because
only the last chunk carries the final flag, truncating an archive fails to
authenticate instead of quietly restoring whatever survived.

Backup streams `tar` straight through encryption into the output file, and
restore streams the other way into `tar`. A plaintext copy of the archive is
never written to disk, and archives far larger than memory work fine.

## What isn't backed up

The data directory only. Your project code — `homestead.config.ts`, the `apps/`
tree, `.env` — is not in the archive; keep that in git. A full rebuild is: check
out the project, restore the data directory, put the master key back, start the
server.
