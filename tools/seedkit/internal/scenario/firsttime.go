package scenario

func init() {
	Register(&Scenario{
		Name:        "first-time",
		Description: "Clean wallet with one confirmed receive",
		Steps: []Step{
			{Description: "Initial receive", AddressIdx: 0, AmountSat: 50_000, Mine: 1},
		},
	})
}
