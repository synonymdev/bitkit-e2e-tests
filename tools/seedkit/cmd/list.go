package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/synonymdev/bitkit-e2e-tests/tools/seedkit/internal/scenario"
)

func init() {
	rootCmd.AddCommand(listCmd)
}

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "List available scenarios",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Available scenarios:")
		fmt.Println()
		for _, s := range scenario.All {
			fmt.Printf("  %-15s %s\n", s.Name, s.Description)
		}
		fmt.Println()
	},
}
