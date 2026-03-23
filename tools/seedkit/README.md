# seedkit

Generate realistic Bitcoin wallets on regtest for Bitkit.

seedkit creates regtest chain state matching predefined scenarios, outputting a BIP39 mnemonic that restores cleanly in Bitkit. Useful for demos, QA, marketing screenshots, and support.

## Quick Start

```bash
go build -o seedkit .

./seedkit list

./seedkit run first-time
```

## Prerequisites

- **Go 1.22+**
- **Local backend**: [bitkit-docker](https://github.com/synonymdev/bitkit-docker) running (Bitcoin Core RPC on localhost:43782)
- **Staging backend**: Access to Synonym staging network (api.stag0.blocktank.to)

## Usage

```bash
# List all scenarios
seedkit list

# Run a scenario (local backend, default)
seedkit run first-time

# Run against staging
seedkit run merchant --backend staging

# Custom Bitcoin Core RPC
seedkit run fragmented --rpc-url http://user:pass@host:port

# Custom Blocktank URL
seedkit run merchant --backend staging --blocktank-url https://custom.api/v2

# Use existing mnemonic
seedkit run dust --mnemonic "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"

# JSON output (for E2E test integration)
seedkit run first-time --output json

# Preview wallet state (reads mnemonic from clipboard)
seedkit preview

# Preview against staging
seedkit preview --backend staging
```

## Scenarios

| Scenario     | Description                                                 |
| ------------ | ----------------------------------------------------------- |
| `first-time` | Clean wallet with one confirmed receive (50,000 sat)        |
| `fragmented` | 18 small UTXOs (2,000-9,100 sat) for coin selection testing |
| `dust`       | Tiny UTXOs at spendability edge cases (330-1,000 sat)       |
| `merchant`   | 12 inbound payments across multiple blocks                  |
| `savings`    | Single large UTXO (1,000,000 sat)                           |

## Backends

### Local (default)

Connects to Bitcoin Core via JSON-RPC. Expects [bitkit-docker](https://github.com/synonymdev/bitkit-docker) or the [bitkit-e2e-tests](https://github.com/synonymdev/bitkit-e2e-tests) docker stack running.

- Default URL: `http://polaruser:polarpass@127.0.0.1:43782`
- Override with `--rpc-url`
- Automatically mines 101 blocks if the node wallet has insufficient funds

### Staging

Uses Synonym's Blocktank API for regtest operations.

- Default URL: `https://api.stag0.blocktank.to/blocktank/api/v2`
- Override with `--blocktank-url`

## JSON Output

When used with `--output json`, the `run` command outputs structured JSON for programmatic use:

```json
{
  "scenario": "first-time",
  "mnemonic": "word1 word2 ...",
  "addresses": [{ "index": 0, "address": "bcrt1q...", "amountSat": 50000, "confirmed": true }],
  "totalSat": 50000,
  "utxoCount": 1,
  "blocksMined": 1
}
```

## Wallet Derivation

- BIP39 mnemonic (12 words, 128-bit entropy)
- BIP84 derivation paths: `m/84'/1'/0'/0/i` (receive) and `m/84'/1'/0'/1/i` (change)
- P2WPKH addresses (`bcrt1...` prefix)

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design details.
