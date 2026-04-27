#!/usr/bin/env bash
# Source admin creds dropped on the shared admin-secrets volume by the
# bootstrap container. With these env vars set, the Next.js
# instrumentation hook (src/instrumentation.ts) syncs the module-flags
# resource definition on startup. Without them the app still works but
# logs a warning, so a missing file is non-fatal.

set -euo pipefail

if [ -f /secrets/admin.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /secrets/admin.env
  set +a
fi

exec "$@"
