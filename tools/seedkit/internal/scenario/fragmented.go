package scenario

func init() {
	Register(&Scenario{
		Name:        "fragmented",
		Description: "Many small UTXOs for coin selection and fee testing",
		Steps: []Step{
			{Description: "Deposit #1", AddressIdx: 0, AmountSat: 2_000},
			{Description: "Deposit #2", AddressIdx: 1, AmountSat: 3_500},
			{Description: "Deposit #3", AddressIdx: 2, AmountSat: 4_200},
			{Description: "Deposit #4", AddressIdx: 3, AmountSat: 5_000},
			{Description: "Deposit #5", AddressIdx: 4, AmountSat: 6_100},
			{Description: "Deposit #6", AddressIdx: 5, AmountSat: 7_800},
			{Description: "Deposit #7", AddressIdx: 6, AmountSat: 2_500},
			{Description: "Deposit #8", AddressIdx: 7, AmountSat: 3_000},
			{Description: "Deposit #9", AddressIdx: 8, AmountSat: 8_900},
			{Description: "Deposit #10", AddressIdx: 9, AmountSat: 4_500},
			{Description: "Deposit #11", AddressIdx: 10, AmountSat: 2_100},
			{Description: "Deposit #12", AddressIdx: 11, AmountSat: 5_500},
			{Description: "Deposit #13", AddressIdx: 12, AmountSat: 3_200},
			{Description: "Deposit #14", AddressIdx: 13, AmountSat: 6_700},
			{Description: "Deposit #15", AddressIdx: 14, AmountSat: 9_100},
			{Description: "Deposit #16", AddressIdx: 15, AmountSat: 4_800},
			{Description: "Deposit #17", AddressIdx: 16, AmountSat: 2_700},
			{Description: "Deposit #18", AddressIdx: 17, AmountSat: 7_300, Mine: 1},
		},
	})
}
