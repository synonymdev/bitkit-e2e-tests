package output

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"

	"github.com/synonymdev/bitkit-e2e-tests/tools/seedkit/internal/scenario"
)

func PrintResult(r *scenario.Result, backendLabel string) {
	fmt.Println()
	fmt.Println("--- seedkit ---")
	fmt.Printf("Scenario:  %s\n", r.Scenario.Description)
	fmt.Printf("Backend:   %s\n", backendLabel)
	fmt.Println()

	fmt.Println("Mnemonic:")
	fmt.Printf("  %s\n", r.Wallet.Mnemonic)
	copyToClipboard(r.Wallet.Mnemonic)
	fmt.Println("  (copied to clipboard)")
	fmt.Println()

	fmt.Println("Wallet Summary:")
	for _, a := range r.Addresses {
		status := "confirmed"
		if !a.Mined {
			status = "unconfirmed"
		}
		fmt.Printf("  [%d] %s  <- %s (%s)\n", a.Index, a.Address, FormatSats(a.Sats), status)
	}
	fmt.Println()
	fmt.Printf("  Total: %s\n", FormatSats(r.TotalSat))
	fmt.Printf("  UTXOs: %d\n", r.UTXOCount)
	fmt.Printf("  Blocks mined: %d\n", r.BlocksMined)
	fmt.Println()
	fmt.Println("Restore this mnemonic in Bitkit to see the wallet.")
	fmt.Println()
}

func copyToClipboard(text string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("pbcopy")
	case "linux":
		cmd = exec.Command("xclip", "-selection", "clipboard")
	default:
		return
	}
	cmd.Stdin = strings.NewReader(text)
	_ = cmd.Run()
}

func FormatSats(sats int64) string {
	if sats >= 100_000_000 {
		return fmt.Sprintf("%.8f BTC", float64(sats)/1e8)
	}
	s := fmt.Sprintf("%d", sats)
	if len(s) <= 3 {
		return s + " sat"
	}
	var result []byte
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			result = append(result, ',')
		}
		result = append(result, byte(c))
	}
	return string(result) + " sat"
}
