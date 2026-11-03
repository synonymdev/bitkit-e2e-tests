#!/usr/bin/env bash
set -euo pipefail
[[ "${E2E_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid pinned E2E commit' >&2; exit 1; }
if [[ "${1:-}" == checkout ]]; then
  [[ "$(git rev-parse HEAD)" == "$E2E_SHA" ]] || { echo 'Checkout differs from pinned E2E commit' >&2; exit 1; }
fi
