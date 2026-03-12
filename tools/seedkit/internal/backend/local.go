package backend

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
)

type LocalBackend struct {
	endpoint string
	user     string
	password string
	client   *http.Client
}

func NewLocalBackend(rpcURL string) *LocalBackend {
	u, _ := url.Parse(rpcURL)
	user := ""
	password := ""
	if u.User != nil {
		user = u.User.Username()
		password, _ = u.User.Password()
	}
	u.User = nil
	return &LocalBackend{
		endpoint: u.String(),
		user:     user,
		password: password,
		client:   &http.Client{},
	}
}

func (b *LocalBackend) Deposit(address string, amountSat int64) error {
	amountBTC := float64(amountSat) / 1e8
	_, err := b.call("sendtoaddress", address, amountBTC)
	return err
}

func (b *LocalBackend) Mine(count int) error {
	raw, err := b.call("getnewaddress")
	if err != nil {
		return fmt.Errorf("getnewaddress: %w", err)
	}
	var addr string
	if err := json.Unmarshal(raw, &addr); err != nil {
		return fmt.Errorf("parse address: %w", err)
	}
	_, err = b.call("generatetoaddress", count, addr)
	return err
}

func (b *LocalBackend) EnsureFunds() error {
	raw, err := b.call("getbalance")
	if err != nil {
		return fmt.Errorf("getbalance: %w", err)
	}
	var balance float64
	if err := json.Unmarshal(raw, &balance); err != nil {
		return fmt.Errorf("parse balance: %w", err)
	}
	if balance >= 1.0 {
		return nil
	}
	fmt.Fprintln(os.Stderr, "Mining 101 blocks to generate funds...")
	return b.Mine(101)
}

type rpcRequest struct {
	JSONRPC string        `json:"jsonrpc"`
	ID      string        `json:"id"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params"`
}

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *rpcError       `json:"error"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *rpcError) Error() string {
	return fmt.Sprintf("RPC error %d: %s", e.Code, e.Message)
}

func (b *LocalBackend) call(method string, params ...interface{}) (json.RawMessage, error) {
	if params == nil {
		params = []interface{}{}
	}
	reqBody := rpcRequest{
		JSONRPC: "1.0",
		ID:      "seedkit",
		Method:  method,
		Params:  params,
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequest("POST", b.endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if b.user != "" {
		httpReq.SetBasicAuth(b.user, b.password)
	}

	resp, err := b.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", method, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%s: read response: %w", method, err)
	}

	var rpcResp rpcResponse
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return nil, fmt.Errorf("%s: parse response: %w", method, err)
	}
	if rpcResp.Error != nil {
		return nil, fmt.Errorf("%s: %w", method, rpcResp.Error)
	}

	return rpcResp.Result, nil
}
