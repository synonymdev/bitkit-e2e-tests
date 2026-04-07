// Configuration file for LNURL server
const config = {
    // Server configuration
    port: process.env.PORT || 3000,
    domain: process.env.DOMAIN || `http://localhost:${process.env.PORT || 3000}`,
    nodeEnv: process.env.NODE_ENV || 'development',

    // Bitcoin RPC configuration
    bitcoin: {
        host: process.env.BITCOIN_RPC_HOST || 'host.docker.internal',
        port: process.env.BITCOIN_RPC_PORT || '18443',
        user: process.env.BITCOIN_RPC_USER || 'polaruser',
        pass: process.env.BITCOIN_RPC_PASS || 'polarpass'
    },

    // LND configuration
    lnd: {
        restHost: process.env.LND_REST_HOST || 'host.docker.internal',
        restPort: process.env.LND_REST_PORT || '8080',
        macaroonPath: process.env.LND_MACAROON_PATH,
        tlsCertPath: process.env.LND_TLS_CERT_PATH
    },

    // Database configuration
    database: {
        path: '/data/lnurl.db'
    },

    // LNURL limits and defaults
    limits: {
        minWithdrawable: 1000, // 1 sat minimum
        maxWithdrawable: 100000000, // 100,000 sats maximum
        minSendable: 1000, // 1 sat minimum
        maxSendable: 1000000000, // 1M sats maximum
        commentAllowed: 255, // Max comment length
        k1Length: 32, // k1 random bytes length
        idLength: 16, // ID random bytes length
        defaultChannelAmount: 100000, // 100,000 sats default channel size
        sessionTimeout: 600, // 10 minutes in seconds
    },

    // Background job intervals
    intervals: {
        paymentCheck: 10000, // 10 seconds
        authSessionCleanup: 300 * 1000 // 5 minutes
    }
};

module.exports = config;
