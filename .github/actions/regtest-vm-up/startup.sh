#!/usr/bin/env bash
set -euo pipefail

# GCE startup script for the ephemeral regtest VM. Runs as root on every boot.
# Output lands in the serial console and /var/log/syslog.
#
# Reads from instance metadata:
#   stack-bundle  base64 tar.gz of the compose directory, written by regtest-vm-up
#   ttl-minutes   self-destruct timer, backstop for a skipped CI teardown
#   creds-token   random path segment the VM serves tls.cert / admin.macaroon under
#   creds-port    port for that server
#
# The stack files arrive in metadata rather than being cloned, so the VM needs no
# repository access, no token, and no network path to GitHub.

WORKDIR="${WORKDIR:-/opt/regtest}"
READY_MARKER="${READY_MARKER:-/var/run/regtest-ready}"

meta() {
  curl -fsS -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/$1" 2>/dev/null || true
}

log() { echo "[regtest-startup] $*"; }

# Each value falls back to metadata, so the script can be exercised outside GCE by
# exporting them.
STACK_BUNDLE="${STACK_BUNDLE:-$(meta instance/attributes/stack-bundle)}"
CREDS_TOKEN="${CREDS_TOKEN:-$(meta instance/attributes/creds-token)}"
CREDS_PORT="${CREDS_PORT:-$(meta instance/attributes/creds-port)}"
CREDS_PORT="${CREDS_PORT:-8081}"
EXTERNAL_IP="${EXTERNAL_IP:-$(meta instance/network-interfaces/0/access-configs/0/external-ip)}"

: "${STACK_BUNDLE:?stack-bundle metadata is required}"
: "${EXTERNAL_IP:?instance has no external IP}"

# Nothing here schedules the VM's own destruction: regtest-vm-up sets
# --max-run-duration with --instance-termination-action=DELETE, so GCE deletes it
# whatever happens in here — including if this script never runs at all.

if ! command -v docker >/dev/null 2>&1; then
  log "installing docker"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl netcat-openbsd
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

log "unpacking stack bundle"
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
printf '%s' "$STACK_BUNDLE" | base64 -d | tar xz -C "$WORKDIR"

cd "$WORKDIR"

# LND writes tls.cert and the macaroons here on first start; the container runs as a
# different uid, so the directory has to be world-writable before it comes up.
mkdir -p lnd
chmod 777 lnd

# LND advertises this address to peers. Left at the compose default of 127.0.0.1 the
# app would dial itself instead of the VM.
export LND_EXTERNAL_IP="$EXTERNAL_IP"

# Not used by the default profile, but set so the adhoc lnurl-server hands out
# reachable URLs if that profile is ever enabled on a VM.
export LNURL_DOMAIN="http://${EXTERNAL_IP}:${LNURL_SERVER_PORT:-30001}"

log "external ip $EXTERNAL_IP"

# Only the default profile is started, matching what the e2e workflows run today:
# bitcoind, lnd, bitcoinsetup, darkhttpd, electrs, ldk-backup-server. The adhoc,
# homegate and trezor profiles stay off.
docker compose pull --quiet
docker compose up -d

log "waiting for electrs"
until nc -z 127.0.0.1 60001; do sleep 2; done

log "waiting for lnd macaroon"
until [ -f lnd/data/chain/bitcoin/regtest/admin.macaroon ]; do sleep 2; done
chmod -R 777 lnd

if [ -n "$CREDS_TOKEN" ]; then
  # LND generates tls.cert and admin.macaroon on first start, so they exist only
  # here — but the tests need them as files on the runner, which cannot SSH in.
  # Serving them over a random path means reaching the port is not enough; the
  # firewall already limits that port to the runner's own IP.
  creds_dir="/opt/creds/${CREDS_TOKEN}"
  mkdir -p "$creds_dir"
  cp lnd/tls.cert "$creds_dir/tls.cert"
  cp lnd/data/chain/bitcoin/regtest/admin.macaroon "$creds_dir/admin.macaroon"
  # Fetch target for proving a client reached this VM. The access log is the
  # evidence, so the contents do not matter.
  echo ok > "$creds_dir/ping.txt"
  chmod -R a+r /opt/creds

  # systemd-run so the server outlives this startup script, which runs as a unit
  # whose children are killed when it exits. Absolute path because the transient
  # unit does not inherit this shell's PATH.
  # StandardOutput=journal+console puts the access log on the serial port, so a
  # request can be confirmed with gcloud instead of needing SSH onto the VM.
  systemd-run --unit=regtest-creds --collect \
    --property=StandardOutput=journal+console \
    --property=StandardError=journal+console \
    /usr/bin/python3 -m http.server "$CREDS_PORT" --bind 0.0.0.0 --directory /opt/creds \
    || log "WARNING: systemd-run failed"

  for _ in $(seq 1 15); do
    nc -z 127.0.0.1 "$CREDS_PORT" && break
    sleep 1
  done
  if nc -z 127.0.0.1 "$CREDS_PORT"; then
    log "serving credentials on :$CREDS_PORT"
  else
    log "ERROR: credential server not listening on :$CREDS_PORT"
    systemctl status regtest-creds --no-pager --lines=20 || true
  fi
fi

touch "$READY_MARKER"
log "stack ready"
