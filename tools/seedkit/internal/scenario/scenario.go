package scenario

import (
	"fmt"

	"github.com/synonymdev/bitkit-e2e-tests/tools/seedkit/internal/backend"
	"github.com/synonymdev/bitkit-e2e-tests/tools/seedkit/internal/wallet"
)

type Step struct {
	Description string
	AddressIdx  uint32
	AmountSat   int64
	Mine        int
}

type Scenario struct {
	Name        string
	Description string
	Steps       []Step
}

type AddressInfo struct {
	Index   uint32
	Address string
	Sats    int64
	Mined   bool
}

type Result struct {
	Scenario    *Scenario
	Wallet      *wallet.Wallet
	Addresses   []AddressInfo
	TotalSat    int64
	UTXOCount   int
	BlocksMined int
}

var All []*Scenario

func Register(s *Scenario) {
	All = append(All, s)
}

func Get(name string) *Scenario {
	for _, s := range All {
		if s.Name == name {
			return s
		}
	}
	return nil
}

func (s *Scenario) Execute(w *wallet.Wallet, b backend.Backend) (*Result, error) {
	result := &Result{
		Scenario: s,
		Wallet:   w,
	}

	for i, step := range s.Steps {
		addr, err := w.DeriveAddress(step.AddressIdx)
		if err != nil {
			return nil, fmt.Errorf("step %d: derive address: %w", i+1, err)
		}

		fmt.Printf("  [%d/%d] %s: %d sat -> %s\n", i+1, len(s.Steps), step.Description, step.AmountSat, addr)

		if err := b.Deposit(addr, step.AmountSat); err != nil {
			return nil, fmt.Errorf("step %d: deposit: %w", i+1, err)
		}

		mined := false
		if step.Mine > 0 {
			if err := b.Mine(step.Mine); err != nil {
				return nil, fmt.Errorf("step %d: mine: %w", i+1, err)
			}
			result.BlocksMined += step.Mine
			mined = true
		}

		result.Addresses = append(result.Addresses, AddressInfo{
			Index:   step.AddressIdx,
			Address: addr,
			Sats:    step.AmountSat,
			Mined:   mined,
		})
		result.TotalSat += step.AmountSat
		result.UTXOCount++
	}

	return result, nil
}
