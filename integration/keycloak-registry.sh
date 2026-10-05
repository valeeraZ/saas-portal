#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${AUTH_SOURCE:?Set AUTH_SOURCE}"
: "${ADMIN_SOURCE:?Set ADMIN_SOURCE}"
: "${SAAS_APP_CONSUMER:?Set SAAS_APP_CONSUMER from SDK artifacts/app-next-consumer.json}"
args=(--auth "$AUTH_SOURCE" --admin "$ADMIN_SOURCE" --consumer "$SAAS_APP_CONSUMER")
if [[ -n "${PORTAL_CHROMIUM:-}" ]]; then args+=(--chromium "$PORTAL_CHROMIUM"); fi
"$AUTH_SOURCE/.venv/bin/python" integration/local-rollout.py "${args[@]}"
