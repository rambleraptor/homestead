#!/usr/bin/env bash
# Boot the docker-compose stack, run the playwright suite against it,
# and tear it down on exit. Args after `--` (or any args) are forwarded
# to `npm` inside tests/e2e (default: `test`).
#
#   ./run-with-stack.sh                  # equivalent to `npm test`
#   ./run-with-stack.sh run test:gift-cards
#   ./run-with-stack.sh run test:ui      # UI mode, but stack still tears down

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

cleanup() {
  echo ">> tearing down stack"
  docker compose down -v --remove-orphans || true
}
trap cleanup EXIT

echo ">> bringing up integration stack"
docker compose down -v --remove-orphans
docker compose up -d --build --wait

echo ">> reading admin creds from bootstrap volume"
TMP_ENV=$(mktemp)
docker compose run --rm --no-deps --entrypoint cat bootstrap /secrets/admin.env \
  > "$TMP_ENV"

set -a
# shellcheck disable=SC1090
. "$TMP_ENV"
set +a
rm -f "$TMP_ENV"
export AEPBASE_URL=http://localhost:8090

cd tests/e2e
npm install
npx playwright install --with-deps chromium

if [[ $# -eq 0 ]]; then
  npm test
else
  npm "$@"
fi
