#!/bin/bash
#
# Mine blocks on regtest via Blocktank API
#
# Usage:
#   ./scripts/mine-blocks.sh [count]
#
# Examples:
#   ./scripts/mine-blocks.sh       # mines 1 block
#   ./scripts/mine-blocks.sh 6     # mines 6 blocks
#

set -e

COUNT="${1:-1}"
BLOCKTANK_URL="${BLOCKTANK_URL:-https://api.stag0.blocktank.to/blocktank/api/v2}"
ENDPOINT="${BLOCKTANK_URL}/regtest/chain/mine"

echo "→ Mining ${COUNT} block(s) via Blocktank..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"count\": ${COUNT}}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "✓ Mined ${COUNT} block(s)"
else
  echo "✗ Failed to mine blocks: HTTP $HTTP_CODE"
  echo "$BODY"
  exit 1
fi
