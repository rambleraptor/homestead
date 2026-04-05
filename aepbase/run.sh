#!/usr/bin/env bash
# Run aepbase locally.
#
# Environment overrides:
#   AEPBASE_PORT  (default 8090)
#   AEPBASE_DATA_DIR  (default ./data)
#   AEPBASE_DB        (default aepbase.db)
#   AEPBASE_CORS      (default *)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="${SCRIPT_DIR}/bin/aepbase"

if [[ ! -x "${BIN}" ]]; then
  echo "error: ${BIN} not found. Run ./install.sh first." >&2
  exit 1
fi

PORT="${AEPBASE_PORT:-8090}"
DATA_DIR="${AEPBASE_DATA_DIR:-${SCRIPT_DIR}/data}"
DB="${AEPBASE_DB:-aepbase.db}"
CORS="${AEPBASE_CORS:-*}"

mkdir -p "${DATA_DIR}"

echo ">> starting aepbase on :${PORT} (data-dir=${DATA_DIR}, db=${DB})"
exec "${BIN}" -port "${PORT}" -data-dir "${DATA_DIR}" -db "${DB}" -cors-allowed-origins "${CORS}"
