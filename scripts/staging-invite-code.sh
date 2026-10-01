#!/usr/bin/env bash
#
# Mint a one-time Pubky staging signup code and copy it to the clipboard.
#
# Usage:
#   HOMESERVER_ADMIN_PASSWORD=... ./scripts/staging-invite-code.sh
#
# The password is the staging homeserver admin password. It is not stored in this repo.

set -euo pipefail

if [[ -z "${HOMESERVER_ADMIN_PASSWORD:-}" ]]; then
  echo "Set HOMESERVER_ADMIN_PASSWORD." >&2
  exit 1
fi

code="$(
  curl --fail --silent --show-error \
    -H "X-Admin-Password: ${HOMESERVER_ADMIN_PASSWORD}" \
    -H "Content-Type: application/json" \
    "https://admin.homeserver.staging.pubky.app/generate_signup_token"
)"
code="$(printf '%s' "$code" | tr -d '[:space:]')"

if [[ -z "$code" ]]; then
  echo "Staging homeserver returned an empty signup code." >&2
  exit 1
fi

printf '%s' "$code" | pbcopy
printf '%s\n' "$code"
