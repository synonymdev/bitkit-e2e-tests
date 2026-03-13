package cmd

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"

	"github.com/spf13/cobra"
	"github.com/synonymdev/bitkit-e2e-tests/tools/seedkit/internal/electrum"
	"github.com/synonymdev/bitkit-e2e-tests/tools/seedkit/internal/output"
	"github.com/synonymdev/bitkit-e2e-tests/tools/seedkit/internal/wallet"
)

const (
	defaultLocalElectrum   = "127.0.0.1:60001"
	defaultStagingElectrum = "electrs.bitkit.stag0.blocktank.to:9999"
	addressGapLimit        = 5
	maxAddresses           = 30
)

var (
	previewBackendFlag  string
	previewMnemonicFlag string
	electrumFlag        string
)

func init() {
	previewCmd.Flags().StringVarP(&previewBackendFlag, "backend", "b", "local", "Backend: local or staging")
	previewCmd.Flags().StringVarP(&previewMnemonicFlag, "mnemonic", "m", "", "Mnemonic (reads from clipboard if omitted)")
	previewCmd.Flags().StringVar(&electrumFlag, "electrum", "", "Custom Electrum server (host:port)")
	rootCmd.AddCommand(previewCmd)
}

var previewCmd = &cobra.Command{
	Use:   "preview",
	Short: "Preview wallet state for a mnemonic",
	Long:  "Connects to an Electrum server to show UTXOs and address history.\nReads mnemonic from clipboard by default (since 'run' copies it there).",
	RunE: func(cmd *cobra.Command, args []string) error {
		mnemonic, err := resolveMnemonic()
		if err != nil {
			return err
		}

		w, err := wallet.FromMnemonic(mnemonic)
		if err != nil {
			return fmt.Errorf("invalid mnemonic: %w", err)
		}

		electrumAddr, useTLS, err := resolveElectrumAddr()
		if err != nil {
			return err
		}

		proto := "tcp"
		if useTLS {
			proto = "tls"
		}
		fmt.Printf("Connecting to Electrum at %s (%s)...\n", electrumAddr, proto)
		client, err := electrum.NewClient(electrumAddr, useTLS)
		if err != nil {
			return fmt.Errorf("electrum: %w", err)
		}
		defer client.Close()

		fmt.Println()
		fmt.Println("--- seedkit preview ---")
		fmt.Printf("Electrum: %s\n", electrumAddr)
		fmt.Printf("Mnemonic: %s\n", mnemonic)
		fmt.Println()

		type chainDef struct {
			label   string
			derive  func(uint32) (string, error)
		}
		chains := []chainDef{
			{"Receive (m/84'/1'/0'/0)", w.DeriveAddress},
			{"Change  (m/84'/1'/0'/1)", w.DeriveChangeAddress},
		}

		var totalSat int64
		var utxoCount int
		var activeAddrs int
		var usedAddrs int

		for _, chain := range chains {
			fmt.Printf("%s:\n", chain.label)
			gap := 0
			found := false

			for i := uint32(0); i < maxAddresses && gap < addressGapLimit; i++ {
				addr, err := chain.derive(i)
				if err != nil {
					return fmt.Errorf("derive address: %w", err)
				}

				scripthash, err := electrum.AddressToScripthash(addr)
				if err != nil {
					return fmt.Errorf("scripthash for %s: %w", addr, err)
				}

				utxos, err := client.ListUnspent(scripthash)
				if err != nil {
					return fmt.Errorf("listunspent: %w", err)
				}

				history, err := client.GetHistory(scripthash)
				if err != nil {
					return fmt.Errorf("get_history: %w", err)
				}

				if len(history) == 0 && len(utxos) == 0 {
					gap++
					continue
				}
				gap = 0
				found = true

				if len(utxos) > 0 {
					var addrTotal int64
					confirmed := 0
					unconfirmed := 0
					for _, u := range utxos {
						addrTotal += u.Value
						if u.Height > 0 {
							confirmed++
						} else {
							unconfirmed++
						}
					}
					totalSat += addrTotal
					utxoCount += len(utxos)
					activeAddrs++

					status := "confirmed"
					if unconfirmed > 0 && confirmed == 0 {
						status = "unconfirmed"
					} else if unconfirmed > 0 {
						status = "mixed"
					}

					fmt.Printf("  [%d] %s  %s (%d UTXO, %s)\n",
						i, addr, output.FormatSats(addrTotal), len(utxos), status)
				} else {
					usedAddrs++
					fmt.Printf("  [%d] %s  (used, now empty)\n", i, addr)
				}
			}

			if !found {
				fmt.Println("  (none)")
			}
			fmt.Println()
		}

		fmt.Printf("  Total: %s (%d UTXOs)\n", output.FormatSats(totalSat), utxoCount)
		fmt.Printf("  Active: %d addresses\n", activeAddrs)
		if usedAddrs > 0 {
			fmt.Printf("  Used (empty): %d addresses\n", usedAddrs)
		}
		fmt.Println()

		return nil
	},
}

func resolveMnemonic() (string, error) {
	if previewMnemonicFlag != "" {
		return previewMnemonicFlag, nil
	}
	clip, err := readClipboard()
	if err != nil || strings.TrimSpace(clip) == "" {
		return "", fmt.Errorf("no mnemonic provided and clipboard is empty (use --mnemonic)")
	}
	mnemonic := strings.TrimSpace(clip)
	fmt.Printf("Read mnemonic from clipboard: %s...\n", truncateWords(mnemonic, 3))
	return mnemonic, nil
}

func resolveElectrumAddr() (string, bool, error) {
	if electrumFlag != "" {
		useTLS := previewBackendFlag == "staging"
		return electrumFlag, useTLS, nil
	}
	switch previewBackendFlag {
	case "local":
		return defaultLocalElectrum, false, nil
	case "staging":
		return defaultStagingElectrum, true, nil
	default:
		return "", false, fmt.Errorf("unknown backend %q (use 'local' or 'staging')", previewBackendFlag)
	}
}

func readClipboard() (string, error) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("pbpaste")
	case "linux":
		cmd = exec.Command("xclip", "-selection", "clipboard", "-o")
	default:
		return "", fmt.Errorf("clipboard not supported on %s", runtime.GOOS)
	}
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func truncateWords(s string, n int) string {
	words := strings.SplitN(s, " ", n+1)
	if len(words) <= n {
		return s
	}
	return strings.Join(words[:n], " ") + " ..."
}
