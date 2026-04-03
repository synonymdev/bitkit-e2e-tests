const https = require('https');
const fs = require('fs');
const config = require('../config');

class LNDService {
    constructor() {
        this.host = config.lnd.restHost;
        this.port = config.lnd.restPort;
        this.macaroonPath = config.lnd.macaroonPath;
        this.tlsCertPath = config.lnd.tlsCertPath;
    }

    async rest(endpoint, method = 'POST', body = null) {
        const url = `https://${this.host}:${this.port}${endpoint}`;

        // Read macaroon for authentication
        let macaroon = '';
        try {
            if (this.macaroonPath && fs.existsSync(this.macaroonPath)) {
                macaroon = fs.readFileSync(this.macaroonPath).toString('hex');
            }
        } catch (error) {
            console.warn('Could not read macaroon:', error.message);
        }

        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const postData = (method === 'POST' && body) ? JSON.stringify(body) : '';

            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname,
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                rejectUnauthorized: false
            };

            // Add Content-Length header only for POST requests with body
            if (method === 'POST' && postData) {
                options.headers['Content-Length'] = Buffer.byteLength(postData);
            }

            // Add macaroon authentication if available
            if (macaroon) {
                options.headers['Grpc-Metadata-macaroon'] = macaroon;
            }

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        if (!data || data.trim() === '') {
                            reject(new Error(`Empty response from LND REST API`));
                            return;
                        }

                        const jsonData = JSON.parse(data);

                        if (res.statusCode >= 400) {
                            reject(new Error(`LND REST error: ${jsonData.message || res.statusMessage}`));
                        } else {
                            resolve(jsonData);
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse LND response: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`LND REST request failed: ${error.message}`));
            });

            if (method === 'POST' && postData) {
                req.write(postData);
            }

            req.end();
        });
    }

    async call(method, params = {}) {
        try {
            const endpoint = `/v1/${method}`;
            // Use GET for getinfo, POST for other methods
            const httpMethod = method === 'getinfo' ? 'GET' : 'POST';
            return await this.rest(endpoint, httpMethod, params);
        } catch (error) {
            console.log(`LND REST API failed for ${method}:`, error.message);
            throw error;
        }
    }

    async getInfo() {
        return this.call('getinfo');
    }

    async createInvoice(value, memo, expiry = 3600) {
        return this.call('invoices', {
            value: value,
            memo: memo,
            expiry: expiry
        });
    }

    async getInvoice(paymentHash) {
        return this.rest(`/v1/invoice/${paymentHash}`, 'GET');
    }

    async decodePayReq(payReq) {
        return this.rest(`/v1/payreq/${payReq}`, 'GET');
    }

    async payInvoice(paymentRequest) {
        return this.rest('/v1/channels/transactions', 'POST', {
            payment_request: paymentRequest
        });
    }

    async getNodeURI() {
        try {
            const nodeInfo = await this.getInfo();
            const address = nodeInfo.uris && nodeInfo.uris.length > 0 ? nodeInfo.uris[0] : null;

            if (!address) {
                throw new Error('No public URI available for this node');
            }

            return address;
        } catch (error) {
            console.error('Failed to get node URI:', error.message);
            throw error;
        }
    }

    async getNewAddress() {
        try {
            return await this.rest('/v1/newaddress', 'GET');
        } catch (error) {
            console.error('Failed to get new address:', error.message);
            throw error;
        }
    }

    async getWalletBalance() {
        try {
            return await this.rest('/v1/balance/blockchain', 'GET');
        } catch (error) {
            console.error('Failed to get wallet balance:', error.message);
            throw error;
        }
    }

    async openChannel(nodePubkey, localFundingAmount, privateChannel = false) {
        try {
            const response = await this.rest('/v1/channels', 'POST', {
                node_pubkey_string: nodePubkey,
                local_funding_amount: localFundingAmount.toString(),
                private: privateChannel
            });

            console.log('Channel opening initiated:', response);
            return response;
        } catch (error) {
            console.error('Failed to open channel:', error.message);
            throw error;
        }
    }

    async getPendingChannels() {
        try {
            return await this.rest('/v1/channels/pending', 'GET');
        } catch (error) {
            console.error('Failed to get pending channels:', error.message);
            throw error;
        }
    }

    async getChannels() {
        try {
            return await this.rest('/v1/channels', 'GET');
        } catch (error) {
            console.error('Failed to get channels:', error.message);
            throw error;
        }
    }
}

module.exports = new LNDService();
