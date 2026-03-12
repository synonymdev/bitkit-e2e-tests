package scenario

func init() {
	Register(&Scenario{
		Name:        "merchant",
		Description: "Many inbound payments with rich transaction history",
		Steps: []Step{
			{Description: "Payment 1 (coffee)", AddressIdx: 0, AmountSat: 15_000, Mine: 1},
			{Description: "Payment 2 (snack)", AddressIdx: 1, AmountSat: 8_500},
			{Description: "Payment 3 (lunch)", AddressIdx: 2, AmountSat: 42_000, Mine: 1},
			{Description: "Payment 4 (drink)", AddressIdx: 3, AmountSat: 5_200},
			{Description: "Payment 5 (tip)", AddressIdx: 4, AmountSat: 2_100},
			{Description: "Payment 6 (dessert)", AddressIdx: 5, AmountSat: 12_800, Mine: 1},
			{Description: "Payment 7 (coffee)", AddressIdx: 6, AmountSat: 15_000},
			{Description: "Payment 8 (dinner)", AddressIdx: 7, AmountSat: 85_000, Mine: 1},
			{Description: "Payment 9 (tip)", AddressIdx: 8, AmountSat: 3_000},
			{Description: "Payment 10 (coffee)", AddressIdx: 9, AmountSat: 15_000},
			{Description: "Payment 11 (lunch)", AddressIdx: 10, AmountSat: 38_000, Mine: 1},
			{Description: "Payment 12 (snack)", AddressIdx: 11, AmountSat: 7_400, Mine: 1},
		},
	})
}
