package electrum

import (
	"bufio"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"sync/atomic"

	"github.com/btcsuite/btcd/btcutil"
	"github.com/btcsuite/btcd/chaincfg"
	"github.com/btcsuite/btcd/txscript"
)

type Client struct {
	conn    net.Conn
	scanner *bufio.Scanner
	nextID  atomic.Int64
}

func NewClient(addr string, useTLS bool) (*Client, error) {
	var conn net.Conn
	var err error
	if useTLS {
		conn, err = tls.Dial("tcp", addr, &tls.Config{})
	} else {
		conn, err = net.Dial("tcp", addr)
	}
	if err != nil {
		return nil, fmt.Errorf("connect to %s: %w", addr, err)
	}
	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	return &Client{conn: conn, scanner: scanner}, nil
}

func (c *Client) Close() error {
	return c.conn.Close()
}

type UTXO struct {
	TxHash string `json:"tx_hash"`
	TxPos  int    `json:"tx_pos"`
	Height int    `json:"height"`
	Value  int64  `json:"value"`
}

type HistoryEntry struct {
	TxHash string `json:"tx_hash"`
	Height int    `json:"height"`
}

func (c *Client) ListUnspent(scripthash string) ([]UTXO, error) {
	raw, err := c.call("blockchain.scripthash.listunspent", scripthash)
	if err != nil {
		return nil, err
	}
	var utxos []UTXO
	if err := json.Unmarshal(raw, &utxos); err != nil {
		return nil, fmt.Errorf("parse utxos: %w", err)
	}
	return utxos, nil
}

func (c *Client) GetHistory(scripthash string) ([]HistoryEntry, error) {
	raw, err := c.call("blockchain.scripthash.get_history", scripthash)
	if err != nil {
		return nil, err
	}
	var history []HistoryEntry
	if err := json.Unmarshal(raw, &history); err != nil {
		return nil, fmt.Errorf("parse history: %w", err)
	}
	return history, nil
}

func AddressToScripthash(address string) (string, error) {
	addr, err := btcutil.DecodeAddress(address, &chaincfg.RegressionNetParams)
	if err != nil {
		return "", fmt.Errorf("decode address: %w", err)
	}
	script, err := txscript.PayToAddrScript(addr)
	if err != nil {
		return "", fmt.Errorf("create script: %w", err)
	}
	hash := sha256.Sum256(script)
	for i, j := 0, len(hash)-1; i < j; i, j = i+1, j-1 {
		hash[i], hash[j] = hash[j], hash[i]
	}
	return hex.EncodeToString(hash[:]), nil
}

type rpcRequest struct {
	JSONRPC string        `json:"jsonrpc"`
	ID      int64         `json:"id"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params"`
}

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func (c *Client) call(method string, params ...interface{}) (json.RawMessage, error) {
	id := c.nextID.Add(1)
	req := rpcRequest{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}
	data, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	data = append(data, '\n')
	if _, err := c.conn.Write(data); err != nil {
		return nil, fmt.Errorf("write: %w", err)
	}

	if !c.scanner.Scan() {
		if err := c.scanner.Err(); err != nil {
			return nil, fmt.Errorf("read: %w", err)
		}
		return nil, fmt.Errorf("connection closed")
	}

	var resp rpcResponse
	if err := json.Unmarshal(c.scanner.Bytes(), &resp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	if resp.Error != nil {
		return nil, fmt.Errorf("electrum error %d: %s", resp.Error.Code, resp.Error.Message)
	}
	return resp.Result, nil
}
