# Homestead marketing site

The public marketing/docs site, built with [VitePress](https://vitepress.dev).
Source lives in `docs/`; the static build lands in `docs/.vitepress/dist`.

## Local development

```bash
npm run dev      # vitepress dev server
npm run build    # static build → docs/.vitepress/dist
npm run preview  # serve the built site locally
```

## Hosting: Cloudflare Workers Static Assets (Git integration)

The site is published on Cloudflare as an **assets-only Worker** (Workers Static
Assets) via **Workers Builds** Git integration — Cloudflare builds and deploys
automatically on every push to `main`, with preview deployments for other
branches/PRs. There is no server code: `wrangler.jsonc` points
`assets.directory` at the VitePress build and Cloudflare serves it directly.

> Why a Worker and not Pages? Cloudflare now recommends Workers Static Assets
> over Pages for new static sites, and the `homestead` Worker is already wired
> to the repo. Functionally it's the same static hosting.

### Build settings (in the dashboard)

The `homestead` Worker → **Settings** → **Build** is configured as:

| Setting                     | Value                          |
| --------------------------- | ------------------------------ |
| Production branch           | `main`                         |
| Root directory              | `packages/homestead-site`      |
| Build command               | `npm run build`                |
| Deploy command              | `npx wrangler versions upload` |
| Build watch paths — include | `packages/homestead-site/*`    |
| Build watch paths — exclude | _(empty)_                      |

Because the root directory is this package, Cloudflare installs only this
package's deps (`vitepress` + `typescript`) — the rest of the monorepo is not
pulled into the build. The deploy command reads [`wrangler.jsonc`](./wrangler.jsonc),
so the Worker name and assets directory stay in sync from the repo.

### Only build when the site changes

Workers Builds triggers on every push to the repo by default, which would
rebuild and redeploy the site for server, CLI, and app changes that can't affect
it. **Build watch paths** (Worker → **Settings** → **Build** → **Build watch
paths**) limits that: Cloudflare compares the paths changed in a push against
the include/exclude patterns and skips the build when nothing matches.

The include pattern is `packages/homestead-site/*` — paths are relative to the
**repository root**, not the root directory above, and `*` matches any nested
path. Everything the VitePress build reads lives under this package (the
`docs/` tree, `docs/.vitepress/config.ts` and theme, `public/`, `package.json`,
`wrangler.jsonc`), so no other path needs to be watched. If the site ever
starts importing something from elsewhere in the monorepo, add that path to the
includes too.

This setting is dashboard-only; it has no `wrangler.jsonc` equivalent, so it is
recorded here. Two Cloudflare caveats: a push with no changed files (an empty
commit) always builds, as does a push with 20+ commits or 3000+ changed files.

A custom domain can be added under the Worker's **Domains & Routes** tab.

### Manual / fallback deploy

For a one-off deploy outside Git integration (requires `wrangler login` or a
`CLOUDFLARE_API_TOKEN`):

```bash
npm run cf:deploy   # builds, then `wrangler deploy`
npm run cf:preview  # serve the built output through the Workers runtime locally
```
