#!/usr/bin/env bash
# Provisions an aepbase instance with the schema declared in
# aepbase/terraform/. Runs once per `docker compose up` and is
# idempotent — second invocations against an unchanged stack are a
# no-op terraform apply.
#
# Inputs:
#   AEPBASE_URL   default http://aepbase:8090
#   /var/log/aepbase/aepbase.log   tee'd by the aepbase container
#                                  (read-only mount; we only grep it)
#   /secrets/admin.env             persisted superuser creds
#                                  (writable mount on admin-secrets vol)

set -euo pipefail

AEPBASE_URL="${AEPBASE_URL:-http://aepbase:8090}"
LOG_FILE="${AEPBASE_LOG_FILE:-/var/log/aepbase/aepbase.log}"
SECRETS_FILE="${ADMIN_SECRETS_FILE:-/secrets/admin.env}"
ADMIN_EMAIL="admin@example.com"

mkdir -p "$(dirname "$SECRETS_FILE")"

if [[ -f "$SECRETS_FILE" ]]; then
  echo "[bootstrap] reusing existing $SECRETS_FILE"
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
else
  echo "[bootstrap] capturing aepbase bootstrap password from $LOG_FILE"
  # aepbase prints "  Password: <16 hex chars>" once on first start of
  # an empty data dir. The aepbase container's healthcheck is satisfied
  # only after the listen line, which is printed *after* the password,
  # so by the time depends_on lets us run the line is already there.
  # We still loop briefly to absorb any IO buffering races.
  PASSWORD=""
  for _ in $(seq 1 30); do
    if [[ -f "$LOG_FILE" ]]; then
      PASSWORD=$(grep -oE 'Password:[[:space:]]+[a-f0-9]{16}' "$LOG_FILE" \
        | head -n1 | awk '{print $2}' || true)
    fi
    [[ -n "$PASSWORD" ]] && break
    sleep 1
  done
  if [[ -z "$PASSWORD" ]]; then
    echo "[bootstrap] error: bootstrap password not found in $LOG_FILE."
    echo "[bootstrap] If the data volume already exists but admin-secrets was wiped,"
    echo "[bootstrap] you must run 'docker compose down -v' to reset both volumes." >&2
    exit 1
  fi
  AEPBASE_ADMIN_EMAIL="$ADMIN_EMAIL"
  AEPBASE_ADMIN_PASSWORD="$PASSWORD"
  umask 077
  cat > "$SECRETS_FILE" <<EOF
AEPBASE_ADMIN_EMAIL=$AEPBASE_ADMIN_EMAIL
AEPBASE_ADMIN_PASSWORD=$AEPBASE_ADMIN_PASSWORD
EOF
  echo "[bootstrap] wrote $SECRETS_FILE"
fi

echo "[bootstrap] logging in to $AEPBASE_URL"
LOGIN_BODY=$(jq -nc \
  --arg e "$AEPBASE_ADMIN_EMAIL" \
  --arg p "$AEPBASE_ADMIN_PASSWORD" \
  '{email: $e, password: $p}')
TOKEN=$(curl -fsS -X POST "$AEPBASE_URL/users/:login" \
  -H 'Content-Type: application/json' \
  -d "$LOGIN_BODY" | jq -r .token)
if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "[bootstrap] error: admin login returned an empty token" >&2
  exit 1
fi

echo "[bootstrap] applying terraform"
export TF_VAR_aepbase_token="$TOKEN"
export AEP_OPENAPI="$AEPBASE_URL/openapi.json"
cd /work
terraform init -input=false
terraform apply -input=false -auto-approve

echo "[bootstrap] done"
