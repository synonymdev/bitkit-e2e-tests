#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker/docker-compose.yml"
HOST="${EXTERNAL_HOST:-0.0.0.0}"
PORT="${EXTERNAL_PORT:-9735}"
NETWORK="${LND_NETWORK:-regtest}"
LND_DIR="${LND_DIR:-/home/lnd/.lnd}"
TLS_CERT_PATH="${TLS_CERT_PATH:-$LND_DIR/tls.cert}"
MACAROON_PATH="${MACAROON_PATH:-$LND_DIR/data/chain/bitcoin/$NETWORK/admin.macaroon}"
FUND_BTC="${FUND_BTC:-1}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed or not in PATH" >&2
  exit 1
fi

echo "Starting lnd (and required services if missing)..."
docker compose -f "$COMPOSE_FILE" up -d bitcoind bitcoinsetup darkhttpd lnd >/dev/null

echo "Waiting for lnd to become ready..."
lnd_info=""
for _ in $(seq 1 90); do
  set +e
  lnd_info="$(
    docker compose -f "$COMPOSE_FILE" exec -T lnd \
      lncli \
      --network="$NETWORK" \
      --lnddir="$LND_DIR" \
      --tlscertpath="$TLS_CERT_PATH" \
      --macaroonpath="$MACAROON_PATH" \
      getinfo 2>/dev/null
  )"
  status=$?
  set -e
  if [[ $status -eq 0 && -n "$lnd_info" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$lnd_info" ]]; then
  echo "ERROR: lnd did not become ready in time." >&2
  exit 1
fi

LND_NODE_ID="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read()).get("identity_pubkey",""))' <<<"$lnd_info")"
if [[ -z "$LND_NODE_ID" ]]; then
  echo "ERROR: Could not read lnd identity_pubkey." >&2
  exit 1
fi

echo "Funding LND wallet with ${FUND_BTC} BTC and mining 1 block..."
lnd_addr_json="$(
  docker compose -f "$COMPOSE_FILE" exec -T lnd \
    lncli \
    --network="$NETWORK" \
    --lnddir="$LND_DIR" \
    --tlscertpath="$TLS_CERT_PATH" \
    --macaroonpath="$MACAROON_PATH" \
    newaddress p2wkh
)"
LND_ADDRESS="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read()).get("address",""))' <<<"$lnd_addr_json")"
if [[ -z "$LND_ADDRESS" ]]; then
  echo "ERROR: Could not get LND on-chain address." >&2
  exit 1
fi

docker compose -f "$COMPOSE_FILE" exec -T bitcoind \
  bitcoin-cli -regtest -rpcconnect=127.0.0.1 -rpcport=43782 -rpcuser=polaruser -rpcpassword=polarpass \
  sendtoaddress "$LND_ADDRESS" "$FUND_BTC" >/dev/null

MINER_ADDRESS="$(
  docker compose -f "$COMPOSE_FILE" exec -T bitcoind \
    bitcoin-cli -regtest -rpcconnect=127.0.0.1 -rpcport=43782 -rpcuser=polaruser -rpcpassword=polarpass \
    getnewaddress
)"
docker compose -f "$COMPOSE_FILE" exec -T bitcoind \
  bitcoin-cli -regtest -rpcconnect=127.0.0.1 -rpcport=43782 -rpcuser=polaruser -rpcpassword=polarpass \
  generatetoaddress 1 "$MINER_ADDRESS" >/dev/null

echo
echo "External channel connection data:"
echo "id:   $LND_NODE_ID"
echo "host: $HOST"
echo "port: $PORT"
echo "uri:  ${LND_NODE_ID}@${HOST}:${PORT}"
echo
echo "Manual app flow:"
echo "Settings -> Advanced -> Channels -> Add -> Manual"
echo
echo "lnd remains online after this script exits."
