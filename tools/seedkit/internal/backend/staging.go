package backend

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type StagingBackend struct {
	baseURL string
	client  *http.Client
}

func NewStagingBackend(baseURL string) *StagingBackend {
	return &StagingBackend{
		baseURL: baseURL,
		client:  &http.Client{},
	}
}

func (b *StagingBackend) Deposit(address string, amountSat int64) error {
	payload := map[string]interface{}{
		"address":   address,
		"amountSat": amountSat,
	}
	return b.post("/regtest/chain/deposit", payload)
}

func (b *StagingBackend) Mine(count int) error {
	payload := map[string]interface{}{
		"count": count,
	}
	return b.post("/regtest/chain/mine", payload)
}

func (b *StagingBackend) EnsureFunds() error {
	return nil
}

func (b *StagingBackend) post(path string, payload interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	resp, err := b.client.Post(b.baseURL+path, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("POST %s: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("POST %s: status %d: %s", path, resp.StatusCode, string(respBody))
	}
	return nil
}
