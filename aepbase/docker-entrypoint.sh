#!/usr/bin/env bash
# Container entrypoint for aepbase.
#
# Tees aepbase's stdout+stderr to /var/log/aepbase/aepbase.log so the
# `bootstrap` sibling container can grep the auto-generated superuser
# password ("Password: <16 hex>") that aepbase prints once on first
# start of an empty data directory. Output also flows to docker logs
# via the inherited stdout.

set -euo pipefail

PORT="${AEPBASE_PORT:-8090}"
DATA_DIR="${AEPBASE_DATA_DIR:-/data}"
DB="${AEPBASE_DB:-aepbase.db}"
CORS="${AEPBASE_CORS:-*}"
LOG_DIR="${AEPBASE_LOG_DIR:-/var/log/aepbase}"
LOG_FILE="${LOG_DIR}/aepbase.log"

mkdir -p "$DATA_DIR" "$LOG_DIR"

# Truncate on each container start. The bootstrap container uses this
# file only to capture the password printed during this run; persisted
# admin creds live separately on the admin-secrets volume.
: > "$LOG_FILE"

# Reroute fd 1/2 through tee, then exec aepbase so it inherits PID 1
# semantics for signal handling.
exec > >(tee -a "$LOG_FILE") 2>&1
exec /usr/local/bin/aepbase \
  -port "$PORT" \
  -data-dir "$DATA_DIR" \
  -db "$DB" \
  -cors-allowed-origins "$CORS"
