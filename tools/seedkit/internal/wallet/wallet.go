package wallet

import (
	"fmt"

	"github.com/btcsuite/btcd/btcutil"
	"github.com/btcsuite/btcd/btcutil/hdkeychain"
	"github.com/btcsuite/btcd/chaincfg"
	"github.com/tyler-smith/go-bip39"
)

type Wallet struct {
	Mnemonic string
	master   *hdkeychain.ExtendedKey
}

func New() (*Wallet, error) {
	entropy, err := bip39.NewEntropy(128)
	if err != nil {
		return nil, fmt.Errorf("generate entropy: %w", err)
	}
	mnemonic, err := bip39.NewMnemonic(entropy)
	if err != nil {
		return nil, fmt.Errorf("generate mnemonic: %w", err)
	}
	return FromMnemonic(mnemonic)
}

func FromMnemonic(mnemonic string) (*Wallet, error) {
	if !bip39.IsMnemonicValid(mnemonic) {
		return nil, fmt.Errorf("invalid mnemonic")
	}
	seed := bip39.NewSeed(mnemonic, "")
	master, err := hdkeychain.NewMaster(seed, &chaincfg.RegressionNetParams)
	if err != nil {
		return nil, fmt.Errorf("derive master key: %w", err)
	}
	return &Wallet{Mnemonic: mnemonic, master: master}, nil
}

// DeriveAddress derives a BIP84 P2WPKH receive address at the given index.
// Path: m/84'/1'/0'/0/index (coin type 1 for testnet/regtest)
func (w *Wallet) DeriveAddress(index uint32) (string, error) {
	return w.deriveAtPath(0, index)
}

// DeriveChangeAddress derives a BIP84 P2WPKH change address at the given index.
// Path: m/84'/1'/0'/1/index
func (w *Wallet) DeriveChangeAddress(index uint32) (string, error) {
	return w.deriveAtPath(1, index)
}

func (w *Wallet) deriveAtPath(chain, index uint32) (string, error) {
	purpose, err := w.master.Derive(hdkeychain.HardenedKeyStart + 84)
	if err != nil {
		return "", fmt.Errorf("derive purpose: %w", err)
	}
	coinType, err := purpose.Derive(hdkeychain.HardenedKeyStart + 1)
	if err != nil {
		return "", fmt.Errorf("derive coin type: %w", err)
	}
	account, err := coinType.Derive(hdkeychain.HardenedKeyStart + 0)
	if err != nil {
		return "", fmt.Errorf("derive account: %w", err)
	}
	chainKey, err := account.Derive(chain)
	if err != nil {
		return "", fmt.Errorf("derive chain %d: %w", chain, err)
	}
	child, err := chainKey.Derive(index)
	if err != nil {
		return "", fmt.Errorf("derive child %d: %w", index, err)
	}

	pubKey, err := child.ECPubKey()
	if err != nil {
		return "", fmt.Errorf("get public key: %w", err)
	}
	pkHash := btcutil.Hash160(pubKey.SerializeCompressed())
	addr, err := btcutil.NewAddressWitnessPubKeyHash(pkHash, &chaincfg.RegressionNetParams)
	if err != nil {
		return "", fmt.Errorf("create address: %w", err)
	}
	return addr.EncodeAddress(), nil
}
