#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${AUTH_SOURCE:?Set AUTH_SOURCE to the real Auth checkout}"
: "${ADMIN_SOURCE:?Set ADMIN_SOURCE to the real Admin checkout}"
export NODE_EXTRA_CA_CERTS="$PWD/.local/auth-config/.local/tls.crt"
export REQUIRE_RUNTIME_REGISTRY=true
node --input-type=module -e '
import { readFileSync } from "node:fs";
const mode = readFileSync(".env.local", "utf8").split("\n").find(line => line.startsWith("PORTAL_REGISTRY_MODE="));
if (mode !== "PORTAL_REGISTRY_MODE=admin") throw Error("Configure PORTAL_REGISTRY_MODE=admin before this regression");
'
bash integration/test.sh
node integration/proxy.test.ts
