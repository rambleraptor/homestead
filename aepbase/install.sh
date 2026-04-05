#!/usr/bin/env bash
# Install aepbase from source into ./bin/aepbase
#
# aepbase is a dynamic, AEP-compliant REST backend. It exposes a meta-API at
# /aep-resource-definitions where resource schemas are registered at runtime,
# and then auto-generates CRUD endpoints + an OpenAPI 3.1 spec at /openapi.json.
#
# Repo: https://github.com/rambleraptor/aepbase

set -euo pipefail

REPO_URL="https://github.com/rambleraptor/aepbase.git"
REF="${AEPBASE_REF:-main}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="${SCRIPT_DIR}/src"
BIN_DIR="${SCRIPT_DIR}/bin"
BIN="${BIN_DIR}/aepbase"

if ! command -v go >/dev/null 2>&1; then
  echo "error: go is required to build aepbase" >&2
  exit 1
fi

mkdir -p "${BIN_DIR}"

if [[ ! -d "${SRC_DIR}/.git" ]]; then
  echo ">> cloning aepbase into ${SRC_DIR}"
  git clone "${REPO_URL}" "${SRC_DIR}"
else
  echo ">> updating existing aepbase checkout"
  git -C "${SRC_DIR}" fetch --quiet origin
fi

git -C "${SRC_DIR}" checkout --quiet "${REF}"
git -C "${SRC_DIR}" pull --quiet --ff-only origin "${REF}" || true

echo ">> building aepbase"
(cd "${SRC_DIR}" && go build -o "${BIN}" ./)

echo ""
echo "aepbase installed: ${BIN}"
echo "run it with: ${SCRIPT_DIR}/run.sh"
