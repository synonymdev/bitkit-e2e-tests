#!/bin/bash
#
# Fund a regtest address via Blocktank API
#
# Usage:
#   ./scripts/fund-address.sh <address> [amount_sats]
#
# Examples:
#   ./scripts/fund-address.sh bcrt1q...                   # deposits default amount (100k sats)
#   ./scripts/fund-address.sh bcrt1q... 50000              # deposits 50000 sats
#   ./scripts/fund-address.sh bitcoin:bcrt1q...            # BIP21 URI (strips prefix)
#   ./scripts/fund-address.sh "bitcoin:bcrt1q...?amount=0.001"  # BIP21 URI with params
#

set -e

ADDRESS="$1"

# Strip BIP21 "bitcoin:" prefix and query params if present
ADDRESS="${ADDRESS#bitcoin:}"
ADDRESS="${ADDRESS%%\?*}"
AMOUNT_SAT="$2"
BLOCKTANK_URL="${BLOCKTANK_URL:-https://api.stag0.blocktank.to/blocktank/api/v2}"
ENDPOINT="${BLOCKTANK_URL}/regtest/chain/deposit"

if [ -z "$ADDRESS" ]; then
  echo "Usage: $0 <address> [amount_sats]"
  exit 1
fi

if [ -n "$AMOUNT_SAT" ]; then
  BODY="{\"address\": \"${ADDRESS}\", \"amountSat\": ${AMOUNT_SAT}}"
  echo "→ Depositing ${AMOUNT_SAT} sats to ${ADDRESS}..."
else
  BODY="{\"address\": \"${ADDRESS}\"}"
  echo "→ Depositing to ${ADDRESS} (default amount)..."
fi

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
TXID=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "✓ txid: ${TXID}"
else
  echo "✗ Failed to deposit: HTTP $HTTP_CODE"
  echo "$TXID"
  exit 1
fi
