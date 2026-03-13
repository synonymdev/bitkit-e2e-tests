package backend

type Backend interface {
	Deposit(address string, amountSat int64) error
	Mine(count int) error
	EnsureFunds() error
}
