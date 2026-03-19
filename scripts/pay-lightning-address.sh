#!/bin/bash
#
# Pay a Lightning invoice via Blocktank staging regtest API
#
# Accepts:
#   BOLT11 invoice:     lnbcrt1p5m4tld...
#   Lightning address:  satoshi@domain.com
#   BIP21 URI:          bitcoin:bcrt1q...?lightning=lnbcrt1p5m4tld...
#
# Usage:
#   ./scripts/pay-lightning-address.sh <target> [amount_sats]
#
# Examples:
#   ./scripts/pay-lightning-address.sh lnbcrt1p5m4tld...
#   ./scripts/pay-lightning-address.sh 'bitcoin:bcrt1q...?lightning=lnbcrt1p5m4tld...'
#   ./scripts/pay-lightning-address.sh satoshi@localhost:3003 500
#
# Environment:
#   BLOCKTANK_URL   → override API base (default: staging)
#   LNURL_SCHEME    → http or https for LN address resolution (default: auto)

set -e

INPUT="$1"
AMOUNT_SATS="${2:-100}"
BLOCKTANK_URL="${BLOCKTANK_URL:-https://api.stag0.blocktank.to/blocktank/api/v2}"

if [ -z "$INPUT" ]; then
  echo "Usage: $0 <target> [amount_sats]"
  echo ""
  echo "  BOLT11:    $0 lnbcrt1p5m4tld..."
  echo "  BIP21:     $0 'bitcoin:bcrt1q...?lightning=lnbcrt1p5m4tld...'"
  echo "  LN addr:   $0 satoshi@localhost:3003 500"
  exit 1
fi

INVOICE=""

# --- Detect input type ---

# BIP21 URI with lightning= parameter
if echo "$INPUT" | grep -qi "^bitcoin:.*lightning="; then
  INVOICE=$(echo "$INPUT" | sed -n 's/.*[?&]lightning=\([^&]*\).*/\1/p' | tr -d '[:space:]')
  if [ -z "$INVOICE" ]; then
    echo "✗ Could not extract lightning invoice from BIP21 URI"
    exit 1
  fi
  echo "→ Extracted invoice from BIP21 URI (${#INVOICE} chars)"

# Raw BOLT11 invoice
elif echo "$INPUT" | grep -qiE "^ln(bc|tb|tbs|bcrt)"; then
  INVOICE=$(echo "$INPUT" | tr -d '[:space:]')
  echo "→ Using BOLT11 invoice (${#INVOICE} chars)"

# Lightning address (user@domain)
elif echo "$INPUT" | grep -q "@"; then
  if ! command -v jq &> /dev/null; then
    echo "✗ jq required for LN address. Install: brew install jq"
    exit 1
  fi

  USERNAME="${INPUT%%@*}"
  DOMAIN="${INPUT#*@}"

  if [ -n "$LNURL_SCHEME" ]; then
    SCHEME="$LNURL_SCHEME"
  elif echo "$DOMAIN" | grep -qE "^(localhost|127\.0\.0\.1)"; then
    SCHEME="http"
  else
    SCHEME="https"
  fi

  AMOUNT_MSATS=$((AMOUNT_SATS * 1000))
  echo "→ Resolving ${USERNAME}@${DOMAIN}..."

  LNURL_RESPONSE=$(curl -sf "${SCHEME}://${DOMAIN}/.well-known/lnurlp/${USERNAME}")
  if [ $? -ne 0 ]; then
    echo "✗ Failed to resolve lightning address"
    exit 1
  fi

  CALLBACK=$(echo "$LNURL_RESPONSE" | jq -r '.callback')
  MIN_SENDABLE=$(echo "$LNURL_RESPONSE" | jq -r '.minSendable')
  MAX_SENDABLE=$(echo "$LNURL_RESPONSE" | jq -r '.maxSendable')

  if [ "$AMOUNT_MSATS" -lt "$MIN_SENDABLE" ] || [ "$AMOUNT_MSATS" -gt "$MAX_SENDABLE" ]; then
    echo "✗ ${AMOUNT_SATS} sats out of range [$((MIN_SENDABLE/1000))-$((MAX_SENDABLE/1000))] sats"
    exit 1
  fi

  echo "→ Requesting invoice for ${AMOUNT_SATS} sats..."
  SEP="?"; echo "$CALLBACK" | grep -q "?" && SEP="&"
  INVOICE_RESPONSE=$(curl -sf "${CALLBACK}${SEP}amount=${AMOUNT_MSATS}")
  INVOICE=$(echo "$INVOICE_RESPONSE" | jq -r '.pr' | tr -d '[:space:]')

  if [ -z "$INVOICE" ] || [ "$INVOICE" = "null" ]; then
    echo "✗ No invoice in callback response"
    echo "$INVOICE_RESPONSE" | jq .
    exit 1
  fi
  echo "→ Got invoice (${#INVOICE} chars)"
else
  echo "✗ Unrecognized format. Use: BOLT11, BIP21 URI, or lightning address"
  exit 1
fi

# --- Pay via Blocktank ---

BODY="{\"invoice\": \"${INVOICE}\""
if [ -n "$AMOUNT_SATS" ] && [ "$AMOUNT_SATS" -gt 0 ] 2>/dev/null; then
  BODY="${BODY}, \"amountSat\": ${AMOUNT_SATS}"
fi
BODY="${BODY}}"

echo "→ Paying ${AMOUNT_SATS} sats via Blocktank..."
PAY_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BLOCKTANK_URL}/regtest/channel/pay" \
  -H "Content-Type: application/json" \
  -d "$BODY")

HTTP_CODE=$(echo "$PAY_RESPONSE" | tail -n1)
BODY=$(echo "$PAY_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "✓ Payment sent"
  [ -n "$BODY" ] && echo "  $BODY"
else
  echo "✗ Payment failed: HTTP $HTTP_CODE"
  echo "  $BODY"
  exit 1
fi
