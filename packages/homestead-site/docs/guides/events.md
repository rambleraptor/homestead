# Live Updates (Event Stream)

`GET /api/events` is a [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
stream of record changes. Every create, update and delete that commits on the
server becomes one event, delivered to every connected client **allowed to
read the record** — the same decision a `GET` of that record makes.

The SPA uses it so a list two people edit at once (the household grocery list)
updates on the other phone within a moment. It is a public API: the iOS app, a
script holding a personal access token, or a home-automation integration can
subscribe the same way.

## Connecting

```http
GET /api/events?resources=grocery,store HTTP/1.1
Authorization: Bearer <token>
Accept: text/event-stream
Last-Event-ID: 3f9a1c2b7d10.4182
```

| | |
|---|---|
| `Authorization` | **Required.** Any token `/api/aep` accepts: a session, a personal access token, or an OAuth access token. A missing or invalid token gets `401`. |
| `resources` | Optional. Comma-separated resource singulars. Narrows the stream to those resources; it can never widen what you're allowed to see. |
| `Last-Event-ID` | Optional. The `id` of the last event you processed. See [Resuming](#resuming). |

Browsers' `EventSource` can't send an `Authorization` header, so read the
stream with `fetch` and parse the frames yourself (or use an SSE client that
supports headers). The SPA's reader is
`packages/homestead-core/api/changeFeed.ts`.

The server sends a `: keepalive` comment every 25 seconds and re-validates your
token each time. When the token expires or is revoked, the stream ends;
reconnect with a fresh token.

## Events

Every event name is `<domain>.<verb>`. **Ignore event names you don't
recognise** — new ones will be added without a version bump.

### `stream.ready`

Always the first frame. It has no `id`.

```text
event: stream.ready
data: {"version":1,"resumed":false,"last_event_id":"3f9a1c2b7d10.4182"}
```

| Field | |
|---|---|
| `version` | Wire-format version. Currently `1`. |
| `resumed` | Whether your `Last-Event-ID` was honoured. See [Resuming](#resuming). |
| `last_event_id` | The newest event id at the moment you connected. |

### `resource.created` · `resource.updated` · `resource.deleted`

```text
id: 3f9a1c2b7d10.4183
event: resource.updated
data: {
  "resource": "grocery",
  "path": "groceries/9f3c0a41",
  "id": "9f3c0a41",
  "actor": "users/8a1e…",
  "origin": "web-5c2f…",
  "update_time": "2026-09-30T17:02:11Z",
  "record": { "id": "9f3c0a41", "path": "groceries/9f3c0a41", "name": "Milk", "checked": true, … }
}
```

(The `data` line is a single line of JSON on the wire; it's wrapped here for
reading.)

| Field | |
|---|---|
| `resource` | The resource singular (`grocery`, `perk`, `user`, …). |
| `path` | The record's AEP path, including parents: `credit-cards/1/perks/2`. |
| `id` | The record id (the last path segment). |
| `actor` | `users/<id>` of whoever made the change; `null` for writes with no authenticated caller. |
| `origin` | The `X-Homestead-Client` header the writer sent, if any. See [Recognising your own writes](#recognising-your-own-writes). |
| `update_time` | When the change committed. |
| `record` | The record after the change, exactly as `GET` returns it. **Absent on `resource.deleted`.** |

Only the record that was written produces an event. Side effects the engine
applies on its own — children removed by a cascading delete, references
cleared by `onDelete: set-null` — don't get events of their own; refetch the
related collection when you see the parent's `resource.deleted`.

## Who receives what

An event is delivered only to connections whose token could `GET` the record,
evaluated when the event is published:

- the same grant resolution, record filters and owner rules as a read;
- a personal access token sees only what its own grants allow;
- a read-only OAuth scope still receives events (it may read);
- for a delete, the decision is taken just before the row is removed — you
  hear about the deletion of a record exactly when you could read it.

`?resources=` is applied on top of that; it never adds anything.

## Resuming

Event ids are `<epoch>.<sequence>`. The server keeps the last 1,000 events (up
to 10 minutes old). Reconnect with the last id you processed as
`Last-Event-ID`, and the events you missed are replayed — filtered by the same
permission decisions — before live ones, with `stream.ready` reporting
`"resumed": true`.

When they can't be replayed, `stream.ready` says `"resumed": false`, and you
must refetch whatever you cache. That happens when:

- the server restarted (the epoch changed);
- the missed events have left the buffer;
- the server wasn't tracking your identity when they happened (you haven't
  connected for more than 10 minutes, or never have).

After `resumed: false`, carry on from the `last_event_id` it reported.

## Recognising your own writes

Your own writes come back to you as events too. To skip them, send a stable
per-client tag as the `X-Homestead-Client` header on your writes — letters,
digits and `_ . : -`, up to 128 characters — and ignore events whose `origin`
matches it. The SPA uses one tag per browser tab, so an edit in one tab still
shows up in another.

## Example

```ts
const res = await fetch('/api/events?resources=grocery', {
  headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
});
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';
for (;;) {
  const { done, value } = await reader.read();
  if (done) break; // reconnect, sending the last id as Last-Event-ID
  buffer += decoder.decode(value, { stream: true });
  const frames = buffer.split('\n\n');
  buffer = frames.pop()!;
  for (const frame of frames) {
    const event = /^event: (.*)$/m.exec(frame)?.[1];
    const data = /^data: (.*)$/m.exec(frame)?.[1];
    if (event?.startsWith('resource.') && data) console.log(event, JSON.parse(data));
  }
}
```

## In the SPA

Apps get live updates without doing anything. The SPA holds the stream open
while someone is signed in, and each event is written straight into the
resource's cached list and detail views (the slots
`useResourceList`/`useResourceItem` read) — no request. A list that is
filtered or parent-scoped can't tell whether a new record belongs in it, so it
is refetched instead. `useLiveRefresh` keeps a slow 60-second poll as a safety
net while the stream is connected.
