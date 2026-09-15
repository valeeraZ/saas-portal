#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_EXTRA_CA_CERTS="$PWD/.local/auth-config/.local/tls.crt"
: "${AUTH_SOURCE:?Set AUTH_SOURCE to the Auth checkout used by integration/run.py}"
node --test integration/store.test.ts
node integration/e2e.ts
