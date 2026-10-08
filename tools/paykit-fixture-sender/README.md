# Fixed-price Paykit fixture sender

Standalone rc71 sender for Bitkit iOS #887 / Android #1437. The SDK source is
pinned to Git revision `e4e58d3ee6c6aa19d6262d4cd96a58890a65b6fa`. No app rebuild is needed.

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

`--rate` is repeatable; its value means BTC per unit of the requested asset.
`btc-regtest` overrides `btc` for this sender's regtest on-chain endpoint.
Passing any `--rate` replaces the preset's entire rates list. `--amount`,
`--asset`, `--note`, and `--expires-in` also work with presets. Without a preset
or rates, a BTC request has no conversion terms. Other unpriced denominations
can be sent to exercise Bitkit's rejection behavior.

The optional `expected_sats` preview rounds on-chain amounts upward; if its
bounded arithmetic cannot represent the calculation it is null. Request terms
retain their original decimal strings and are validated by the real rc71 SDK.
The sender currently supplies a regtest P2WPKH endpoint, not Lightning invoices.

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
