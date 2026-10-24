# AI Support

Your household data sits behind a standard REST API, so AI tools can work
with it. You have four ways in:

- **[`homestead resources`](#read-and-write-data-from-the-cli)** — a CLI that
  reads and writes your data. Best for an agent or a script.
- **[Chat](#chat-with-your-data)** — a built-in assistant that manages your
  data in plain language.
- **[An MCP server](#connect-an-mcp-client)** — connect Claude or another MCP
  client to your instance.
- **[Agent skills](#teach-a-coding-agent-with-skills)** — drop-in skills that
  teach your coding agent to scaffold apps, edit your schema, and stand up an
  instance.

The built-in features that call a model directly — [Chat](#chat-with-your-data)
and the photo-import features (grocery lists, HSA receipts) — share one
provider you [configure once](#configure-your-ai-provider). The CLI, MCP, and
skills above use whatever model you already run, so they need no provider
config.

---

## Configure your AI provider

Homestead's built-in AI features — the [chat assistant](#chat-with-your-data),
grocery-list photo import, and HSA receipt scanning — run through a single
provider you choose. Three are supported, via the
[Vercel AI SDK](https://ai-sdk.dev):

| Provider           | `provider`    | Example model              |
| ------------------ | ------------- | -------------------------- |
| OpenAI (Codex)     | `'openai'`    | `gpt-4o`                   |
| Anthropic (Claude) | `'anthropic'` | `claude-3-5-sonnet-latest` |
| Google (Gemini)    | `'google'`    | `gemini-2.5-flash`         |

Set the `ai` block in `homestead.config.ts` — provider, model, and auth — and
read the API key from the environment so the secret never reaches the client
bundle:

```ts
// homestead.config.ts
const aiApiKey = fromEnv('AI_API_KEY');
const ai: HomesteadConfig['ai'] = aiApiKey
  ? {
      provider: 'google', //  'openai' | 'anthropic' | 'google'
      model: 'gemini-2.5-flash', // must be vision-capable for the photo features
      auth: { apiKey: aiApiKey },
    }
  : undefined;

const config: HomesteadConfig = {
  apps: [/* … */],
  ai,
};
```

```bash
# .env — get a key from your chosen provider's console.
AI_API_KEY=your_ai_provider_api_key_here
```

Restart the server to apply changes. AI is **opt-in**: with no `ai` block (no
key set), the chat and photo endpoints return `503` and the rest of Homestead
works as normal.

::: tip Vision models
The grocery and HSA photo features send an image to the model, so the
configured `model` must be vision-capable. The example models above all are.
:::

---

## Read and write data from the CLI

`homestead resources` reads and writes your household data from the command
line. Run it on the box where Homestead is installed; it authenticates
itself by reading the instance's database, so you don't pass credentials.

**List every resource and what you can do with it:**

```bash
homestead resources
```

```
Available resources — run `homestead resources <resource> <verb>`:

  account-tag   list, get, create, delete            (parent: --user)
  gift-card     list, get, create, update, delete
  transaction   list, get, create, delete            (parent: --gift-card)

Run `homestead resources <resource>` for fields and usage.
```

**See a resource's fields and usage:**

```bash
homestead resources gift-card
```

This prints the description, every field (with type and whether it's
required), file fields, and any custom methods.

**Read and write:**

```bash
homestead resources gift-card list
homestead resources gift-card get <id>
homestead resources gift-card create --merchant "Visa" --amount 100
homestead resources gift-card update <id> --notes "Used $50"
homestead resources gift-card delete <id>
```

For a child resource, pass the parent id before the verb:

```bash
homestead resources --gift-card <card-id> transaction list
```

The command discovers your schema at runtime, so it always lists the
resources your apps declare. Point an agent at it and it learns your whole
API by running `homestead resources`.

### Flags

| Flag                          | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `--token=TOKEN`               | Use an existing bearer token instead of minting one.           |
| `--email=… --password=…`      | Authenticate with superuser credentials instead of minting.    |
| `--server-url=URL`            | Target a remote engine (default `http://127.0.0.1:<port>/api/aep`). |
| `--@data=PATH`                | Supply a JSON body from a file (for create or custom methods). |
| `--data-dir=PATH`             | Where the SQLite database lives (default `<project>/data`).    |

---

## Chat with your data

Chat is a built-in assistant that looks up and changes your household data in
plain language — "how much is left on my Visa gift card?", "add milk to the
grocery list", "what events are coming up?". It's always installed; find it in
the top navigation.

Chat works with **any** app you've added, with no per-app setup. It acts
with **your** permissions — it's only offered the apps you can use, and only
the changes you're allowed to make — confirms before deleting, and shows you which
actions it took — each tool call is a card you can open to see what it sent and
what came back. Replies stream in as they're written, and render as Markdown.

Conversations are kept. The list beside the chat (behind **Conversations** on
a phone) holds your past threads, most recent first; open one to carry on where
you left off. Each conversation has its own address (`/chat/<id>`), so a
reload — or another device — picks it back up, and a reply that's still being
written on one device appears on the other as it lands. **Stop** ends a reply
early and keeps what was written so far. Delete a conversation from the list;
otherwise it's removed 60 days after its last message.

You can attach **photos and PDFs** to a message: tap the paperclip, paste, or
drop files on the box. A message can carry up to 5 files of up to 10 MB each,
and can be just files with no text ("what's in this receipt?" works, and so
does a photo on its own). JPEG, PNG, WebP and GIF images and PDFs are accepted
— the assistant's models read those — and a file's type is checked from its
contents, not its name. The assistant sees the files of your three most recent
messages that have any; older ones are noted by name, so a long thread doesn't
resend every photo. Attachments are stored with the message, so they're there
on a reload or another device, and they go when the conversation does.

The assistant can also **file an attachment into an app**: "save this as an HSA
receipt", "add this gift card with its photo", "file this PDF". It copies the
file into the record's file field (a receipt's scan, a gift card's front image,
a document's file) as it creates or updates it. It can only use files attached
in the same conversation, including older ones it no longer sees, and only
fields that hold a single file. The MCP server's tools don't take files.

Under the hood the assistant sees the same **one-tool-per-resource** surface
the [MCP server](#the-tool-surface) serves by default: one tool per
resource, with the verb — `list`, `get`, `create`, `update`, `delete`, or an
app's `:custom-method` such as `:process-image` or `:classify` — as the tool's
`action`. A `list` can be narrowed and sorted on the server (`filter`,
`order_by`, `limit`), so "what's due this week" is one small read rather than
a dump of the whole collection. Filters can use every record's `create_time`
and `update_time` too, so "what changed since Friday" works on any
resource.

### Stored conversations

Under the Chat screen is one endpoint, which you can call yourself.
`POST /api/chat` runs one **stored, streamed** turn. Send only the new message;
the server keeps the history:

```http
POST /api/chat
Authorization: Bearer <token>
Content-Type: application/json

{ "conversation_id": "…", "message": { "id": "<your id>", "text": "Add milk" } }
```

- Leave out `conversation_id` to start a new conversation; its id comes back in
  the `X-Conversation-Id` header and the stream's first event. The streamed
  reply carries the id it's stored under (`<your id>-reply`).
- The reply is the [AI SDK's UI message stream](https://ai-sdk.dev) — text as
  it's written, and each tool call with its result.
- The turn runs to the end on the server even if you disconnect, and is saved
  as it goes: a `conversation` with its `chat-message`s, readable like any
  other resource (and by MCP clients — the assistant itself doesn't see them).
- One turn at a time per conversation: a second send while one runs gets
  `409`. Stop a running turn with `POST /api/aep/conversations/{id}:cancel`;
  the reply keeps the text written before the stop.
- `message.id` is yours to choose, so a retried send gets `409` instead of
  sending twice.
- To attach files, send `multipart/form-data` instead: the same JSON as a
  `request` part, and each file as an `attachments` part. The text may then be
  empty. A file that isn't an image or PDF is `415`, one over 10 MB is `413`,
  and more than 5 is `400`. The files are stored on the user's message
  (`attachments`, a list of file descriptors — see
  [Files in lists and objects](../design/nested-files)).
- A conversation is private to whoever started it, and is deleted 60 days
  after its last message.

- The tools are built for each person, from what they can reach: a collection
  they can't read is left out (with everything nested under it), and one they
  can read but not change offers only `list` and `get` — so the model never
  spends a turn on a call that could only be refused. The engine still decides
  every call. MCP does the same.

A resource can be left out of the assistant's tools, or out of MCP's, with
`modelTools` on its definition — see
[Hiding a Resource from AI Tools](./resources#hiding-a-resource-from-ai-tools).

### Enable Chat

Chat runs on whichever model you [configure as your AI
provider](#configure-your-ai-provider) — OpenAI, Anthropic, or Gemini. Set the
`ai` block in `homestead.config.ts`, supply `AI_API_KEY`, and restart the
server; the Chat screen then answers questions instead of reporting that the
assistant isn't configured. Without an `ai` block, Chat reports that it isn't
configured and the rest of Homestead works as normal.

---

## Connect an MCP client

Homestead ships a **built-in [MCP](https://modelcontextprotocol.io) server** at
`/api/mcp` — no separate process. It exposes every resource in the instance,
plus the app-declared AEP-136 custom methods (the `POST /<plural>:<verb>`
endpoints declared in `customMethods`), plus document search when embeddings
are configured — the same tools the built-in [Chat](#chat-with-your-data)
runs on. Every action runs with the signed-in user's own permissions, and the
tool list is cut to match: collections the caller can't read aren't offered,
and ones they can't change are offered read-only.

**Enable it.** MCP clients sign in through Homestead's OAuth authorization
server, so turn that on in `homestead.config.ts` and restart:

```bash
OAUTH_SERVER_ENABLED=1
OAUTH_SERVER_ISSUER_URL=https://your-host   # the instance's public origin
```

The MCP server is on by default whenever the authorization server is enabled
(set `auth.authServer.mcpEnabled: false` to run the AS without it).

**Connect a client.** Point your MCP client (e.g. Claude Desktop) at:

```
https://your-host/api/mcp
```

Authorization is automatic — **no bearer token to copy**. The client discovers
the authorization server from the endpoint, registers itself, and opens
Homestead's sign-in and consent screen in your browser; approve it and the
client is connected. The model can then list, read, and write your household
resources.

### The tool surface

Three surfaces are available, chosen by the `settings` app's **MCP tool
surface** flag (Superuser → Flag Management). It's an ordinary app flag, so a
change takes effect on the client's next `tools/list` — no config edit, no
restart, and switching back is the same two clicks.

| Surface | Tools | When |
| --- | --- | --- |
| `resource` (default) | one per resource, ~41 | Almost always |
| `typed` | four per resource plus one per custom method, ~167 | You want the strictest per-verb schemas and your client can hold them |
| `generic` | six, resource-parameterized | Your client is on a tight context or tool budget |

All three run every call with the signed-in user's own permissions, and reach
the engine by exactly the same path — the two derived surfaces translate a call
into the typed call it stands for before executing it, so permissions,
reference checks, and custom-method dispatch can't diverge between them.

#### `resource` — one tool per resource

Each resource is a single tool named for it — `gift_cards`, `recipes`,
`transactions` — and the verb is its `action` parameter:

```jsonc
{
  "name": "gift_cards",
  "arguments": {
    "action": "create",
    "fields": { "merchant": "Target", "amount": 25 }
  }
}
```

The actions are `list`, `get`, `create`, `update`, and `delete`, plus one per
declared custom method written in AEP's `:verb` notation — `:classify`,
`:process-image`. (The colon is why a custom method named `list` can't shadow
the CRUD action.) A custom method's request body goes in `body`; the tool
description says what each verb needs, and an async (AEP-151) method tells the
model to poll the `operations` resource until `done` is true.

Each tool carries **its own resource's field schemas** — types, enums,
descriptions, and which resource a reference points at — so the model can see
what a field is at the moment it composes the call. Nested resources take their
ancestor ids as required `<parent>_id` params, needed for every action
including `list`.

Because one schema serves every action, requiredness that varies by action
isn't in the JSON Schema: the tool description states it (`create requires:
merchant, card_number, amount`) and the server enforces it, naming the fields
the resource accepts when it rejects. A wrong guess self-corrects in one
round-trip.

This is the default because it beats `typed` on both counts: ~41 tools instead
of ~167, and *fewer* schema tokens, since `typed` emits each resource's field
set twice (once for `create_x`, once for `update_x`) where this emits it once.

#### `typed` — four tools per resource

The server mints **one tool per resource per verb**: `create_book` /
`read_book` / `update_book` / `delete_book`, plus one tool per custom method
named after its verb and what it addresses — `classify_document` for an
`item`-target method, `process_image_groceries` for a `collection`-target one.
Each takes the addressed record's `id`, any parent ids, and (for a custom
method) the fields of its declared `request` schema; a method with no declared
schema gets a single optional `body` param taking a JSON-encoded object.

The schemas are the strictest of the three — requiredness is per verb, so
`create_book` can demand `title` in JSON Schema rather than in prose. The cost
is ~167 tools on a stock instance: tens of thousands of tokens of schema in the
client's context on every request, and past the tool cap some clients enforce.

#### `generic` — six tools

For clients on a tight budget, everything collapses into six tools that take
the resource as a parameter, so the count stays flat however many apps you add:

| Tool | What it does |
| --- | --- |
| `describe_resources` | No argument → the catalog. With `resource` → that resource's fields, allowed values, references, parent ids, and custom methods |
| `read_records` | `id` for one record, omit it to list the collection |
| `create_record` | Create one record from a `fields` object |
| `update_record` | Merge-patch one record |
| `delete_record` | Delete one record |
| `run_custom_method` | Invoke an AEP-136 custom method by `resource` + `verb` |

Discovery is designed in rather than traded away. The `resource` parameter is a
real enum of every plural in the instance, so the catalog rides along in each
tool's schema and the model can neither miss a resource nor invent one. The
server's `instructions` carry a one-line description of every resource and its
custom methods, and `describe_resources` returns the full field schema on
demand. What you give up versus `resource` is field *typing* at call time: the
model has to ask what a field accepts instead of reading it off the schema.

Nested resources take their ancestor ids in `parent_ids`, keyed by
`<parent>_id` — `{"gift_card_id": "abc"}` for a transaction.

### Read-only vs. read + write

The server advertises two scopes:

| Scope | What it grants |
| --- | --- |
| `homestead:read` | Reading every resource, `GET` custom methods, document search |
| `homestead:write` | Everything read grants, plus create / update / delete and the rest of the custom methods |

A client that requests `homestead:read` gets a read-only surface and cannot
mutate data. How that's expressed depends on the surface: `typed` and `generic`
don't register the write tools at all, while `resource` — where the tool *is*
the resource and so can't be withheld — narrows each tool's `action` enum to
the read actions. That makes the read-only `resource` surface self-describing:
the model sees an enum with no write actions in it rather than inferring the
limit from absent tools.

Custom methods count as writes unless they're declared `method: 'GET'`. Request
`homestead:write` (or both) for full access. Clients that request no scope get
full read + write, as before.

The synthesized `:bulk-import` / `:bulk-export` methods aren't exposed on any
surface — they move files, not model-composable JSON.

> Prefer an out-of-process option? The community
> [`aep-mcp-server`](https://github.com/aep-dev/aep-mcp-server) can still be
> pointed at the engine's `/api/aep` prefix with a bearer token from
> `homestead login`.

### Put the endpoint behind Cloudflare Access

By default the MCP endpoint is its own OAuth gate: it's reachable, but every
request needs a valid Homestead token. If you'd rather have **Cloudflare
Access** authenticate callers to `/api/mcp` (Cloudflare's "MCP server behind
Access" model), give Homestead the team domain and the Access application's
Audience (AUD) tag:

```bash
OAUTH_SERVER_CF_ACCESS_TEAM_DOMAIN=your-team   # or your-team.cloudflareaccess.com
OAUTH_SERVER_CF_ACCESS_AUD=<application-aud-tag>
```

With both set, a request carrying Access's `Cf-Access-Jwt-Assertion` header is
verified (RS256 against your team's JWKS, plus issuer/audience/expiry) and its
`email` claim is mapped to the Homestead user of the same email — the MCP tools
then run under that user's permissions. A Homestead user must already exist for
each Access identity you expect to connect (an unknown email gets a `403`). The
endpoint's own OAuth still works, so this is additive: you can front `/api/mcp`
with Access without breaking direct OAuth clients.

`OAUTH_SERVER_CF_ACCESS_AUD` takes a **comma-separated list** of AUD tags. If
you reach the endpoint through more than one Access application — for example an
**MCP portal** in front of the origin's own app — each forwards a token with a
*different* `aud`, so list both:

```bash
OAUTH_SERVER_CF_ACCESS_AUD=<origin-app-aud>,<portal-app-aud>
```

Because a machine MCP client can't complete an interactive Access login, this is
the *only* way to have Access authenticate the endpoint itself — a plain Access
self-hosted app in front of `/api/mcp` would intercept the OAuth handshake and
break it.

**Debugging a rejected token.** If Access-fronted requests come back `401`, set
`HOMESTEAD_LOG_LEVEL=debug` and restart, then watch the logs (filter for the
`access-jwt` scope). Each rejection logs the exact reason (`issuer mismatch`,
`audience mismatch`, `signature invalid`, `no Homestead user for <email>`, or
`no external authenticators configured`), so you can see which check failed. If you
see **no** `access-jwt` line at all for an attempt, the request never reached
Homestead — the failure is upstream in Cloudflare/the client, not here. Return
the level to `info` once you're done.

---

## Teach a coding agent with skills

Homestead ships [`SKILL.md`](https://agentskills.io) skills in the repo
under `.claude/skills/`:

| Skill             | What it does                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `setup-homestead` | Stand up a new instance — scaffold, first boot, claim the admin account, install service. |
| `create-app`      | Scaffold a new feature app end-to-end — resources, hooks, components, config, e2e.        |
| `add-resource`    | Add or modify a resource definition (fields, enums, file fields, child resources).        |
| `add-widget`      | Add a dashboard widget to an existing app.                                                 |

Copy them into your agent's skills directory (use `~/...` for all projects,
or the dotted form inside one project), then start a fresh session:

```bash
cp -R /path/to/homestead/.claude/skills/*  ~/.claude/skills/    # Claude Code
cp -R /path/to/homestead/.claude/skills/*  ~/.codex/skills/     # Codex
cp -R /path/to/homestead/.claude/skills/*  ~/.gemini/skills/    # Gemini CLI
```
