# Homestead drop box

A public place a phone can leave a link, which a Homestead behind a login comes
and collects.

An iPhone's share sheet can only reach Homestead through an Apple Shortcut, and
a Shortcut can't sign in to the login (Cloudflare Access, say) in front of a
Homestead. So the Shortcut posts the link here, and Homestead — which can reach
out even though nothing can reach in — collects what's waiting about once a
minute.

It is built on the assumption that it can be broken into:

- It never calls Homestead, and holds nothing of Homestead's: no token, no
  address, no list of people.
- A shortcut's key is known here only by its hash.
- Its one secret, `ADMIN_SECRET`, guards its own admin routes.

Someone in control of it can read links as they pass through and hand
Homestead links of their own. Homestead takes only a web address from each,
files it for the person the inbox belongs to, and caps how many it takes an
hour.

## Deploy

From this directory, with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
set (a token from the **Edit Cloudflare Workers** template, plus **D1: Edit**):

```sh
npx wrangler d1 create homestead-drop        # put the id it prints in wrangler.jsonc
npx wrangler d1 migrations apply homestead-drop --remote
npx wrangler deploy
npx wrangler secret put ADMIN_SECRET         # a long random value; keep a copy for Homestead
```

`wrangler deploy` prints the Worker's address (`https://homestead-drop.<account>.workers.dev`).

## Connect Homestead

1. **Superuser → Flag Management → Bookmarks → Drop box address**: the Worker's address.
2. **Superuser → Credentials → Bookmarks drop box secret**: the `ADMIN_SECRET`
   value (or set `BOOKMARKS_DROP_SECRET` in the server's environment).

Bookmarks → **Save from iPhone** then makes shortcut addresses on the drop box.

## Routes

| Route | Who | What |
|---|---|---|
| `POST /in/<key>` with `{ "url": … }` | A shortcut | Leaves a link in the key's box |
| `PUT /boxes/<box>` | Homestead | Registers a box |
| `DELETE /boxes/<box>` | Homestead | Removes a box and what's waiting in it |
| `GET /boxes/<box>/links` | Homestead | Lists what's waiting, oldest first |
| `POST /boxes/<box>/ack` with `{ "through": seq }` | Homestead | Forgets what was collected |

The first is public; the rest need `Authorization: Bearer <ADMIN_SECRET>`. A box
id is the SHA-256 (hex) of its key.

## Limits

- A key nobody registered gets a 404, and nothing is stored.
- Web links only (http or https), up to 2,000 characters; a 4 KB body at most.
- 50 uncollected links per box; uncollected links are forgotten after 7 days.
- 20 requests a minute per sender address.

## Develop

`src/app.ts` is the request handling, over a `Store` (`src/d1-store.ts` when
deployed, `src/memory-store.ts` in tests). `make test` runs `__tests__/`;
Homestead's own specs run the same code in-process
(`packages/homestead-apps/bookmarks/vm/drop-box-stub.ts`).
