#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash integration/keycloak-registry.sh
