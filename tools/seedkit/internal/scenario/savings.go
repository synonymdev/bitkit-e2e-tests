package scenario

func init() {
	Register(&Scenario{
		Name:        "savings",
		Description: "Large single UTXO, simple balance",
		Steps: []Step{
			{Description: "Savings deposit", AddressIdx: 0, AmountSat: 1_000_000, Mine: 1},
		},
	})
}
