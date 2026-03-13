package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/synonymdev/bitkit-e2e-tests/tools/seedkit/internal/backend"
	"github.com/synonymdev/bitkit-e2e-tests/tools/seedkit/internal/output"
	"github.com/synonymdev/bitkit-e2e-tests/tools/seedkit/internal/scenario"
	"github.com/synonymdev/bitkit-e2e-tests/tools/seedkit/internal/wallet"
)

const (
	defaultLocalRPC     = "http://polaruser:polarpass@127.0.0.1:43782"
	defaultBlocktankURL = "https://api.stag0.blocktank.to/blocktank/api/v2"
)

var (
	backendFlag   string
	rpcURLFlag    string
	blocktankFlag string
	mnemonicFlag  string
	outputFlag    string
)

func init() {
	runCmd.Flags().StringVarP(&backendFlag, "backend", "b", "local", "Backend: local or staging")
	runCmd.Flags().StringVar(&rpcURLFlag, "rpc-url", "", "Custom Bitcoin Core RPC URL (local backend)")
	runCmd.Flags().StringVar(&blocktankFlag, "blocktank-url", "", "Custom Blocktank API URL (staging backend)")
	runCmd.Flags().StringVarP(&mnemonicFlag, "mnemonic", "m", "", "Use existing mnemonic instead of generating")
	runCmd.Flags().StringVarP(&outputFlag, "output", "o", "text", "Output format: text or json")
	rootCmd.AddCommand(runCmd)
}

var runCmd = &cobra.Command{
	Use:   "run [scenario]",
	Short: "Run a scenario to generate a wallet",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		s := scenario.Get(args[0])
		if s == nil {
			fmt.Fprintf(os.Stderr, "Unknown scenario: %s\n\nAvailable scenarios:\n", args[0])
			for _, sc := range scenario.All {
				fmt.Fprintf(os.Stderr, "  %s\n", sc.Name)
			}
			return fmt.Errorf("unknown scenario %q", args[0])
		}

		b, label, err := createBackend()
		if err != nil {
			return fmt.Errorf("backend: %w", err)
		}

		fmt.Fprintf(os.Stderr, "Running scenario: %s\n", s.Name)
		fmt.Fprintf(os.Stderr, "Backend: %s\n\n", label)

		if err := b.EnsureFunds(); err != nil {
			return fmt.Errorf("ensure funds: %w", err)
		}

		w, err := createWallet()
		if err != nil {
			return fmt.Errorf("wallet: %w", err)
		}

		result, err := s.Execute(w, b)
		if err != nil {
			return fmt.Errorf("execute: %w", err)
		}

		if outputFlag == "json" {
			return printJSON(result)
		}
		output.PrintResult(result, label)
		return nil
	},
}

func createBackend() (backend.Backend, string, error) {
	switch backendFlag {
	case "local":
		url := rpcURLFlag
		if url == "" {
			url = defaultLocalRPC
		}
		return backend.NewLocalBackend(url), fmt.Sprintf("local (%s)", url), nil
	case "staging":
		url := blocktankFlag
		if url == "" {
			url = defaultBlocktankURL
		}
		return backend.NewStagingBackend(url), fmt.Sprintf("staging (%s)", url), nil
	default:
		return nil, "", fmt.Errorf("unknown backend %q (use 'local' or 'staging')", backendFlag)
	}
}

func createWallet() (*wallet.Wallet, error) {
	if mnemonicFlag != "" {
		return wallet.FromMnemonic(mnemonicFlag)
	}
	return wallet.New()
}

type jsonOutput struct {
	Scenario    string       `json:"scenario"`
	Mnemonic    string       `json:"mnemonic"`
	Addresses   []jsonAddr   `json:"addresses"`
	TotalSat    int64        `json:"totalSat"`
	UTXOCount   int          `json:"utxoCount"`
	BlocksMined int          `json:"blocksMined"`
}

type jsonAddr struct {
	Index     uint32 `json:"index"`
	Address   string `json:"address"`
	AmountSat int64  `json:"amountSat"`
	Confirmed bool   `json:"confirmed"`
}

func printJSON(r *scenario.Result) error {
	out := jsonOutput{
		Scenario:    r.Scenario.Name,
		Mnemonic:    r.Wallet.Mnemonic,
		TotalSat:    r.TotalSat,
		UTXOCount:   r.UTXOCount,
		BlocksMined: r.BlocksMined,
	}
	for _, a := range r.Addresses {
		out.Addresses = append(out.Addresses, jsonAddr{
			Index:     a.Index,
			Address:   a.Address,
			AmountSat: a.Sats,
			Confirmed: a.Mined,
		})
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(out)
}
