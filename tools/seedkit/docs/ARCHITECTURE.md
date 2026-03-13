# seedkit - Architecture

A Go CLI that: picks a scenario -> generates a BIP39 mnemonic -> derives BIP84 addresses -> deposits/mines on regtest -> prints a human-readable summary.

```mermaid
flowchart TD
    CLI[CLI: cobra] --> Scenario[Scenario Engine]
    Scenario --> Wallet[Wallet: mnemonic + BIP84 derivation]
    Scenario --> Backend[Backend Interface]
    Backend --> Local[Local: Bitcoin Core RPC\nlocalhost:43782\npolaruser:polarpass]
    Backend --> Staging[Staging: Blocktank API\napi.stag0.blocktank.to]
    Scenario --> Summary[Summary Printer]
```

## Two Backends

Both backends implement the same `Backend` interface with three methods:

- **`Deposit(address, amountSat)`** - send funds to an address
  - Local: `sendtoaddress` RPC call
  - Staging: `POST /regtest/chain/deposit`
- **`Mine(count)`** - mine N blocks
  - Local: `generatetoaddress` RPC call
  - Staging: `POST /regtest/chain/mine`
- **`EnsureFunds()`** - make sure the backend has spendable coins
  - Local: checks balance, mines 101 blocks if needed
  - Staging: no-op (Blocktank handles funding)

Connection details from existing infra:

- **Local** (bitkit-docker / E2E docker): `http://polaruser:polarpass@127.0.0.1:43782`
- **Staging**: `https://api.stag0.blocktank.to/blocktank/api/v2`

## Wallet Derivation

- Generate BIP39 mnemonic (12 words / 128-bit entropy by default)
- Derive BIP84 (`m/84'/1'/0'/0/i`) native segwit addresses (coin type 1 for testnet/regtest)
- Libraries: `go-bip39` + `btcutil/hdkeychain`
- Generate enough addresses per scenario (some need 1, "fragmented" needs 18)

## Scenarios (MVP)

These scenarios only need deposit + mine, no outgoing tx signing:

| Scenario | What it creates | Addresses | Deposits |
|----------|----------------|-----------|----------|
| **first-time** | Clean wallet, one confirmed receive | 1 | 1 x 50,000 sat, mine 1 block |
| **fragmented** | Many small UTXOs for coin selection testing | 18 | 18 x 2,000-9,100 sat each, mine |
| **dust** | Tiny UTXOs at spendability edge | 5 | Mix of 330, 546, 600, 800, 1000 sat, mine |
| **merchant** | Many inbound payments, rich history | 12 | 12 varied amounts (2k-85k sat), mined across multiple blocks |
| **savings** | Large single UTXO, simple balance | 1 | 1 x 1,000,000 sat, mine |

### Future scenarios (require transaction building - Phase 2)

These need the tool to sign and broadcast transactions FROM the wallet, which requires UTXO selection + tx building. Deferred to Phase 2, local backend only:

- **rbf-ready**: Unconfirmed outgoing tx marked replaceable
- **cpfp-ready**: Parent/child fee rescue
- **oops**: Awkward change distribution, failed-looking state

## Project Structure

```
seedkit/
  main.go
  go.mod
  cmd/
    root.go             # cobra root command
    list.go             # list available scenarios
    run.go              # run a scenario (main entry point)
  internal/
    backend/
      backend.go        # Backend interface (Deposit, Mine, EnsureFunds)
      local.go          # Bitcoin Core JSON-RPC client
      staging.go        # Blocktank HTTP API client
    wallet/
      wallet.go         # BIP39 mnemonic + BIP84 address derivation
    scenario/
      scenario.go       # Scenario type, registry, execution engine
      firsttime.go
      fragmented.go
      dust.go
      merchant.go
      savings.go
    output/
      summary.go        # Human-readable terminal output
  docs/
    ARCHITECTURE.md     # This file
  README.md
```

## Key Go Dependencies

- `github.com/tyler-smith/go-bip39` - BIP39 mnemonic generation
- `github.com/btcsuite/btcd/btcutil/hdkeychain` - BIP32 HD key derivation
- `github.com/btcsuite/btcd/chaincfg` - Bitcoin network params (regtest)
- `github.com/btcsuite/btcd/btcutil` - Address encoding
- `github.com/spf13/cobra` - CLI framework

## Design Decisions

- **Scenario registration via `init()`**: Each scenario file registers itself, keeping the registry decentralized and easy to extend.
- **No config file**: All configuration via CLI flags. Defaults match bitkit-docker.
- **Minimal JSON-RPC client**: Hand-rolled to avoid pulling in a heavy dependency for 3 RPC calls.
- **12-word mnemonics**: Matches Bitkit's default mnemonic length.
- **Phase 2 boundary**: Scenarios requiring transaction signing (RBF, CPFP) are deferred because they need a full wallet implementation (UTXO selection, tx building, signing).
