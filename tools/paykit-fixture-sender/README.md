# Paykit fixture peer

Real rc71 peer for Bitkit payment journeys. The SDK source is pinned to Git
revision `e4e58d3ee6c6aa19d6262d4cd96a58890a65b6fa`. For local USDT execution,
use app builds configured for the same fork as described below.

Run from this directory:

```sh
./sender init
```

This creates **one separate test identity**, registers App ID `paykit-server`,
and prints its public key. Add that identity as a contact in both Bitkit fixtures,
with contact payments enabled. Keep Bitkit foregrounded while linking:

```sh
./sender link '<iOS fixture pubky>'
./sender link '<Android fixture pubky>'
```

Use a valid, **unused regtest P2WPKH receive address** owned by the test recipient.
The sender has no Bitcoin wallet. It publishes the provided address and includes
the same endpoint in the request's immutable terms; no placeholder address works.

Send one request at a time, inspect and dismiss its confirmation, then send the next:

```sh
./sender send '<payer pubky>' usd --address '<bcrt1q...>'
# Expect 21,000 sats; local fiat estimate uses Bitkit's market rate.
./sender send '<payer pubky>' btc --address '<bcrt1q...>'
# Expect 50,000 sats; btc-regtest:0.5 overrides btc:2.
```

## Custom requests

`usd` and `btc` are convenient presets, not required cases. Omit the preset and
choose your requested amount/asset and optional fixed conversion rates:

```sh
./sender send '<payer pubky>' --asset usd --amount 5 \
  --rate btc=0.00003 --address '<unused bcrt1q...>'
# 5 USD at 0.00003 BTC/USD = 15,000 sats.

./sender send '<payer pubky>' --asset btc --amount 0.001 \
  --rate btc=2 --rate btc-regtest=0.5 --address '<unused bcrt1q...>'
# Regtest rate wins: 50,000 sats.

./sender preview --asset usdt --amount 10 \
  --rate btc=0.000021 --note 'Custom QA' --expires-in 3600 \
  --address '<unused bcrt1q...>'
```

`--rate` is repeatable; its value means payment-asset units per unit of the requested asset.
`btc-regtest` overrides `btc` for this sender's regtest on-chain endpoint.
Passing any `--rate` replaces the preset's entire rates list. `--amount`,
`--asset`, `--note`, and `--expires-in` also work with presets. Without a preset
or rates, a BTC request has no conversion terms. Other unpriced denominations
can be sent to exercise Bitkit's rejection behavior.

The optional `expected_sats` preview rounds on-chain amounts upward; if its
bounded arithmetic cannot represent the calculation it is null. Request terms
retain their original decimal strings and are validated by the real rc71 SDK.
The sender supplies regtest P2WPKH and/or Arbitrum USDT endpoints, not Lightning invoices.

Repeat for the other payer. These commands create requests; they never broadcast
Bitcoin transactions. For this confirmation journey, dismiss the sheet without
paying. Actual payment checks require an independently controlled recipient wallet.
If you pay a request, get a fresh unused recipient address before the next request:
Bitkit filters used on-chain addresses from one-time requests. Reusing that address
can leave the next confirmation waiting for usable payment details.

```sh
./sender preview usd --address '<bcrt1q...>' # offline terms inspection
./sender status
./sender poll --seconds 30                 # receive/retry messages
```

A send command always creates a **new** request. If delivery failed after a request
was created, use `poll`, not `send`, to retry that existing request. Delivery failure
is reported as an error; a saved request receipt identifies the queued request.

`state/` contains the identity secret, grant and durable SDK state. It is local,
ignored by Git, protected with owner-only permissions, and locked against concurrent
sender processes. Keep it to resume; do not copy or run the identity concurrently.
Run `poll` separately from the other commands. `--state` is a global option,
placed before the command, for example:

```sh
./sender --state '/absolute/path/to/existing-issuer-state' status
```

Signup defaults to staging Homegate's IP-verification endpoint. If rate-limited,
provide a staging homeserver and set `PAYKIT_SIGNUP_CODE` in the environment:

```sh
./sender init --homeserver '<staging homeserver pubky>'
```

## Installation and state

On macOS or Linux, install Rust 1.91.1 or newer with Cargo, Git, and a C
toolchain, then build:

```sh
cargo build --locked
cargo test --locked
./sender --help
```

Cargo fetches the exact SDK commit recorded in `SDK_REVISION`; no sibling SDK
checkout is needed. The wrapper builds on first use. After updating source, run
`cargo build --locked` again. The wrapper honors `RUSTUP_TOOLCHAIN` and
`CARGO_TARGET_DIR`.

`init` creates and publishes the issuer only on first use. Later runs reuse the
saved identity and complete any missing registration; they do not reset contacts,
requests, or proofs. Each `--state` directory owns a separate SDK identity. Keep
that directory between commands, private and outside version control. When moving
an existing issuer to this tool, use its original directory via `--state` rather
than copying credentials into this repository. `preview` is offline and does not
need initialization.

## USDT and recurring journeys

Use only the dedicated local fork described in [USDT E2E setup](../../docs/usdt-e2e.md).
The sender can publish a USDT endpoint, a Bitcoin endpoint, or both. It sends real
SDK messages over staging Pubky; it never executes a payment itself.

```sh
# Receive into a named local Core wallet from bitkit-docker:
USDT_WALLET_NAME=receiver ./usdt-fixture wallet address
# Back in this tool's directory, insert that address:
./sender send '<payer pubky>' --asset usd --amount 2.50 \
  --usdt-address '0x...' --rate usdt=1 --payment-in 3600
# Add --address '<bcrt1q...>' --rate btc-regtest=0.00002 for both choices.

./sender preview --asset usd --amount 5 --usdt-address '0x...' --per-period \
  --recurrence '{"every":1,"unit":"month","starts_at":"2026-10-01T00:00:00Z","anchor":"2026-10-01T00:00:00Z","ends_at":null}'
```

`--payment-in` is the one-time **payment** deadline; `--expires-in` remains the
proposal acceptance deadline. Rates are payment-asset units per requested unit;
rail selectors override asset-wide selectors. Recurring requests can use fixed
rates or `--per-period`, which requires a later quote. The SDK validates terms
and lifecycle transitions. Use current/future periods in an actual journey.

The peer can also act as the payer of a Bitkit-created request:

```sh
./sender poll --seconds 5
./sender accept '<requester pubky>' '<request id>'
./sender proof '<requester pubky>' '<request id>' proof-submission.json
./sender quote '<payer pubky>' '<request id>' quote.json
```

A quote file contains `billing_period` (`starts_at`, `ends_at`), `rates`
(`asset`, `value`) and `expires_at`. A proof submission file contains
`payment_app_id`, `payment_endpoint_identifier`, optional `billing_period` and
`conversion_quote_id`, plus `proof`: the exact `erc20-transfer-eip712` object
from `./usdt-fixture wallet proof ID BINDING_FILE`. Pay the matching recipient
with `wallet send` first; retain its payment ID and immutable request binding.
Proof retries must reuse that payment, never run `send` again.

To verify a payment from Bitkit:

```sh
./sender poll --seconds 5
./sender evidence '<payer pubky>' '<request id>' > evidence.json
jq '.proofs[0].binding' evidence.json > binding.json
jq '.proofs[0].proof' evidence.json > proof.json
# From bitkit-docker, with absolute file paths:
USDT_WALLET_NAME=receiver ./usdt-fixture wallet verify /path/binding.json /path/proof.json
```

`evidence` derives payer/payee from the authenticated SDK record, not the proof's
claimed identity. It exports evidence; it does not declare the request paid.
Assert the verified amount, request price/deadline and unique payment identity in
the journey. `ProofSubmitted` alone is not payment verification. Save files under
ignored `state/` or the E2E artifacts directory; never commit test identity state.
