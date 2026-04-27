# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install deps first so layer cache survives source changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# `next.config.ts`'s `rewrites()` is evaluated by `next build` and the
# resolved destination URL is baked into `.next/routes-manifest.json`.
# Setting AEPBASE_URL only at runtime is too late, so we have to bake
# the in-cluster service URL at build time. Compose's frontend service
# overrides this at runtime for the `instrumentation.ts` server hook,
# but the rewrite manifest target is fixed once built.
ARG AEPBASE_URL=http://aepbase:8090
ENV AEPBASE_URL=$AEPBASE_URL
# next.config.ts shells out to git for commit metadata; without `.git`
# (excluded by .dockerignore) it falls back to 'unknown', which is fine
# for the integration-test stack.
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# next start needs node_modules + .next + public + package.json. Copy
# all of them from the builder rather than re-installing prod deps,
# since vendored deps already match the lockfile.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

COPY docker-entrypoint.sh /usr/local/bin/frontend-entrypoint.sh
RUN chmod +x /usr/local/bin/frontend-entrypoint.sh

# curl is used by the compose healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/frontend-entrypoint.sh"]
CMD ["npm", "run", "start"]
