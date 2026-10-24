# Files in lists and objects — Design

**Status:** Implemented · **Audience:** contributors

> How a record holds more than one file in a field, or a file inside a nested
> object. Top-level file fields (one file per field) are unchanged; this adds
> files anywhere below them.

---

## 1. The problem

A file field held exactly one file. Its identity was its field name: the bytes
lived at `{record}/{field}`, the column held only a marker, and `:download`
took `{ field }`. That rules out:

- **a list of files** — a chat message with three photos;
- **a file inside an object** — `profile.avatar`;
- **a file in a list of objects** — the scan on each page of a document.

The schema validator didn't refuse those shapes either: the definition synced
and uploads to it were silently dropped.

## 2. The model: a file is identified by its own id

Below the top level a field name no longer names one file, so each file gets an
id:

- its bytes live at `{record}/_files/{id}` (plurals and field names can't start
  with `_`, so this never collides with a child collection or a field);
- its place in the record's JSON holds an **entry** —
  `{ id, name, media_type, size, encrypted }`;
- the engine finds files by walking a value alongside its schema: a file is a
  `binary` property marked `x-aepbase-file-field`, wherever it sits.

Deleting a record is unchanged (its directory goes, `_files/` with it).
Encryption at rest uses a key per file (`{record}/_files/{id}`).

## 3. Declaring

```ts
attachments: { type: 'array', items: { type: 'file' }, maxItems: 5 },
profile:     { type: 'object', properties: { avatar: { type: 'file' }, bio: { type: 'string' } } },
pages:       { type: 'array', items: { type: 'object', properties: {
                 scan: { type: 'file' }, caption: { type: 'string' } } } },
```

- Not inside tagged-union `variants` (their fields are flattened into shared
  columns) — refused at boot.
- `ai` options (text extraction, embedding) stay on top-level files: the index
  pipeline works per record and field.
- List limits are the ordinary `minItems` / `maxItems`, which the engine
  already enforces.
- The engine derives each resource's file-holding fields from the schema at
  registration (`nestedFileFields`); the definitions table is unchanged.

## 4. Writing

A multipart write's JSON says where each upload goes; the parts carry bytes.
At each file position the value must be one of:

| Value | Meaning |
|---|---|
| `{ "$upload": "<part name>" }` | a new file, from that part |
| `{ "$file": "<id>" }` | keep a file **this record** already holds |
| `null` | no file |

Anything else is a 400 — in particular an entry, so a client can never point a
record at bytes it doesn't own. A placeholder must name exactly one part, each
part must be used exactly once, and `$file` must be an id the record holds (an
id from another record is refused).

```
resource = {"pages":[{"caption":"front","scan":{"$upload":"p0"}},
                     {"caption":"back", "scan":{"$file":"f8k2"}}]}
p0       = <bytes>
```

Two shorthands keep simple cases simple:

- a part named after a **top-level file field** works exactly as before;
- repeated parts named after a **top-level list of files** fill it in order,
  with no JSON (`attachments=@a.png`, `attachments=@b.pdf`).

**Order of work:** parts are read into memory; placeholders are resolved and
every check runs; then the new files are written; then the record is
validated and committed. If anything after the file write fails, the new
files are removed. After a committed update, files the record no longer
references are deleted.

**Concurrent writes.** Reading the body and writing files take time, so an
update re-reads the record once its files are on disk and merges onto that
(nothing is awaited between that read and the commit). If a file the write
keeps with `$file` was removed by a write that committed in between, it's a
409 and the new files are removed — the record never points at missing bytes.

**Merge-patch falls out of the existing rules.** Objects deep-merge, so
`PATCH {"profile":{"bio":"x"}}` keeps the avatar. Arrays are replaced whole, so
a list sent in a PATCH replaces the old one — keep files by sending them as
`$file`.

**Media type.** An upload's declared type is whatever the sender claims. The
engine records the type named by the file's leading bytes for the formats it
recognizes (PDF, JPEG, PNG, WebP, GIF, HEIC/HEIF); otherwise the declared type,
unless that claims a recognizable format the bytes aren't — then
`application/octet-stream` (`core/resources/media-type.ts`). There are no
per-field type or size limits: a feature that needs them checks them itself.

## 5. Reading and downloading

Every file below the top level reads as a **descriptor**:

```json
{ "id": "f8k2", "url": "…/documents/d1:download?file=f8k2",
  "name": "back.jpg", "media_type": "image/jpeg", "size": 48213, "encrypted": true }
```

`:download` takes `{ "file": "<id>" }` beside the original `{ "field": … }`,
in the JSON body or the query string — so a descriptor's `url` is POSTable
as-is. Exactly one of the two; `field` naming a list or object field is a 400
that points at `file`; an id the record doesn't reference is the same 404 as a
missing file, so the endpoint never confirms an id exists elsewhere.

The response is always `application/octet-stream` with `nosniff`, and the
file's name (RFC 5987 form for non-ASCII) in `Content-Disposition`. Serving the
recorded type would let an uploaded `text/html` run as the app; clients take
the type from the descriptor. `useFileUrl` (core) relabels a blob only to a type
the bytes confirmed, for the same reason.

The change feed carries descriptors, never bytes. OpenAPI documents each file
below the top level as the descriptor object, and adds `file` to `:download`
only on resources that have such files — the frozen baseline is unchanged.

## 6. Clients

- `@rambleraptor/homestead-client`: `encodeBody` turns a `Blob` anywhere in a
  body into a placeholder plus a part, so
  `create({ pages: [{ caption, scan: file }] })` just works;
  `record.download({ file: id })` or `record.download(descriptor)`.
- SPA (`core/api/aepbase.ts`): `create` / `update` use the same encoding;
  `download(plural, id, { file })`; `useFileUrl` renders a descriptor.
- Chat tools leave nested files out, and leave out any **list** holding a
  file: a list is replaced whole on update, and a model that can't name the
  files to keep would delete them. An object's other fields stay available. A
  top-level file field takes the id of a file attached in the same
  conversation (`attachmentSource` in `core/server/chat/attachments.ts`);
  MCP's tools leave every file out.

## 7. What stays the same

Top-level file fields: storage, column marker, read form (a URL string), and
`{ field }` downloads. Backups (they copy the data dir), retention, access
inheritance and reference cleanup (they delete through the record).

## 8. Left open

- **Migrating top-level file fields** to entries — one model, descriptor reads,
  and documents could drop its own `mime_type`. Changes their read form for
  every app, so it's its own change.
- **Files inside variants**, if a resource ever needs them.
- **`ai` options below the top level** (indexing per file id).
- **`homestead resources`** uploads below the top level.
- **Nested `required`**: like every nested field, a required file inside an
  object isn't enforced by the engine (top-level `required` is).

## 9. Where it lives

| Piece | File |
|---|---|
| Positions, placeholders, entries, descriptors | `homestead-server/src/engine/file-entries.ts` |
| Write / rollback / cleanup, download | `engine/crud.ts` |
| Storage by id | `engine/files.ts` |
| Media type from bytes | `homestead-core/resources/media-type.ts` |
| Authoring rules | `validateFilePlacement` in `core/resources/translate.ts` |
| Tests | `test/engine/nested-files.test.ts`, `openapi.test.ts`, client and translator tests |
