package cmd

import "github.com/spf13/cobra"

var rootCmd = &cobra.Command{
	Use:   "seedkit",
	Short: "Generate realistic Bitcoin wallets on regtest for Bitkit",
	Long: `seedkit creates regtest chain state matching predefined scenarios,
outputting a BIP39 mnemonic that restores cleanly in Bitkit.

Useful for demos, QA, marketing screenshots, and support.`,
}

func Execute() error {
	return rootCmd.Execute()
}
