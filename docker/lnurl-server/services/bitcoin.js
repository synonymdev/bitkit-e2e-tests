const config = require('../config');

class BitcoinService {
    constructor() {
        this.host = config.bitcoin.host;
        this.port = config.bitcoin.port;
        this.user = config.bitcoin.user;
        this.pass = config.bitcoin.pass;
    }

    async rpc(method, params = []) {
        const response = await fetch(`http://${this.host}:${this.port}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${this.user}:${this.pass}`).toString('base64')
            },
            body: JSON.stringify({
                jsonrpc: '1.0',
                id: 'lnurl',
                method,
                params
            })
        });

        const data = await response.json();
        if (data.error) {
            throw new Error(`Bitcoin RPC error: ${data.error.message}`);
        }
        return data.result;
    }

    async getBlockCount() {
        return this.rpc('getblockcount');
    }

    async getBlockHash(height) {
        return this.rpc('getblockhash', [height]);
    }

    async getBlock(hash) {
        return this.rpc('getblock', [hash]);
    }

    async getBlockchainInfo() {
        return this.rpc('getblockchaininfo');
    }
}

module.exports = new BitcoinService();
