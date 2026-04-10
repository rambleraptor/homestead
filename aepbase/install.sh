#!/usr/bin/env bash
# Build the HomeOS aepbase wrapper into ./bin/aepbase.
#
# This is a thin Go wrapper around github.com/rambleraptor/aepbase imported
# as a library (see main.go). It enables features that are library-only
# (users + file fields) and otherwise behaves like the upstream binary.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${SCRIPT_DIR}/bin"
BIN="${BIN_DIR}/aepbase"

if ! command -v go >/dev/null 2>&1; then
  echo "error: go is required to build aepbase" >&2
  exit 1
fi

mkdir -p "${BIN_DIR}"

echo ">> resolving go module deps"
(cd "${SCRIPT_DIR}" && go mod download)

echo ">> building aepbase wrapper"
(cd "${SCRIPT_DIR}" && go build -o "${BIN}" .)

echo ""
echo "aepbase installed: ${BIN}"
echo "run it with: ${SCRIPT_DIR}/run.sh"
