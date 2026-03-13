package scenario

func init() {
	Register(&Scenario{
		Name:        "dust",
		Description: "Tiny UTXOs at spendability edge cases",
		Steps: []Step{
			{Description: "Near dust (330 sat)", AddressIdx: 0, AmountSat: 330},
			{Description: "P2PKH dust line (546 sat)", AddressIdx: 1, AmountSat: 546},
			{Description: "Just above (600 sat)", AddressIdx: 2, AmountSat: 600},
			{Description: "Tiny but spendable (800 sat)", AddressIdx: 3, AmountSat: 800},
			{Description: "Small (1000 sat)", AddressIdx: 4, AmountSat: 1_000, Mine: 1},
		},
	})
}
