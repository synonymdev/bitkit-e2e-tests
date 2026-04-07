const express = require('express');
const router = express.Router();
const bolt11 = require('bolt11');
const lnurl = require('lnurl');

const templates = require('../templates');
const Logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse a BIP21 URI into its components
 * Format: bitcoin:<address>?param1=value1&param2=value2
 * Common params: amount, label, message, lightning
 */
function parseBIP21(uri) {
    if (!uri.toLowerCase().startsWith('bitcoin:')) {
        throw new Error('Invalid BIP21 URI: must start with "bitcoin:"');
    }

    const withoutScheme = uri.slice(8);
    const questionIndex = withoutScheme.indexOf('?');

    let address, queryString;
    if (questionIndex === -1) {
        address = withoutScheme;
        queryString = '';
    } else {
        address = withoutScheme.slice(0, questionIndex);
        queryString = withoutScheme.slice(questionIndex + 1);
    }

    if (!address) {
        throw new Error('Invalid BIP21 URI: missing Bitcoin address');
    }

    const params = {};
    if (queryString) {
        const urlParams = new URLSearchParams(queryString);
        for (const [key, value] of urlParams) {
            params[key.toLowerCase()] = value;
        }
    }

    return {
        address,
        amount: params.amount ? parseFloat(params.amount) : null,
        label: params.label || null,
        message: params.message || null,
        lightning: params.lightning || null,
        otherParams: Object.fromEntries(
            Object.entries(params).filter(([k]) =>
                !['amount', 'label', 'message', 'lightning'].includes(k)
            )
        )
    };
}

/**
 * Detect the type of input string
 * Returns: 'bip21', 'bolt11', 'lnurl', or 'unknown'
 */
function detectInputType(input) {
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();

    if (lower.startsWith('bitcoin:')) {
        return 'bip21';
    }

    if (lower.startsWith('lnurl') || /^lnurl1[a-z0-9]+$/i.test(trimmed)) {
        return 'lnurl';
    }

    if (/^ln(bc|bcrt|tb|tbs)/.test(lower)) {
        return 'bolt11';
    }

    return 'unknown';
}

/**
 * Helper to extract tag data from bolt11 tags array
 */
function getTagData(tags, tagName) {
    if (!tags) return null;
    const tag = tags.find(t => t.tagName === tagName);
    return tag ? tag.data : null;
}

/**
 * Decode a BOLT11 invoice with comprehensive field extraction
 * Matches fields shown by lightningdecoder.com
 */
function decodeBolt11Full(invoice) {
    const decoded = bolt11.decode(invoice);

    // Extract values from tags array (bolt11 library stores most fields here)
    const tags = decoded.tags || [];
    const description = getTagData(tags, 'description');
    const descriptionHash = getTagData(tags, 'purpose_commit_hash');
    const paymentHash = getTagData(tags, 'payment_hash');
    const paymentSecret = getTagData(tags, 'payment_secret');
    const expireTime = getTagData(tags, 'expire_time');
    const minFinalCltvExpiry = getTagData(tags, 'min_final_cltv_expiry');
    const routingInfo = getTagData(tags, 'routing_info');
    const fallbackAddress = getTagData(tags, 'fallback_address');
    const featureBits = getTagData(tags, 'feature_bits');

    // Calculate time expire date
    const timeExpireDate = decoded.timeExpireDate ||
        (decoded.timestamp && expireTime ? decoded.timestamp + expireTime : null);

    // Extract prefix from decoded object or invoice string
    const prefix = decoded.prefix || invoice.toLowerCase().match(/^(lnbcrt|lnbc|lntbs|lntb)/)?.[1] || null;

    // Signature and recovery flag
    const signatureHex = typeof decoded.signature === 'string' ? decoded.signature : null;
    const recoveryFlag = decoded.recoveryFlag !== undefined ? decoded.recoveryFlag : null;

    // Collect unknown tags (tags not in standard set)
    const knownTags = ['description', 'purpose_commit_hash', 'payment_hash', 'payment_secret',
                       'expire_time', 'min_final_cltv_expiry', 'routing_info', 'fallback_address',
                       'feature_bits', 'payee_node_key'];
    const unknownTags = tags
        .filter(t => !knownTags.includes(t.tagName))
        .map(t => ({
            tagName: t.tagName,
            tagCode: t.tagCode || null,
            data: t.data
        }));

    return {
        // Network info
        chain: decoded.network || null,
        prefix: prefix,

        // Amount
        amount: decoded.millisatoshis ? {
            millisatoshis: decoded.millisatoshis,
            satoshis: Math.floor(parseInt(decoded.millisatoshis) / 1000),
            btc: parseInt(decoded.millisatoshis) / 100000000000
        } : (decoded.satoshis ? {
            millisatoshis: decoded.satoshis * 1000,
            satoshis: decoded.satoshis,
            btc: decoded.satoshis / 100000000
        } : null),

        // Payee info
        payeePubKey: decoded.payeeNodeKey || getTagData(tags, 'payee_node_key') || null,

        // Payment identification
        paymentHash: paymentHash || null,
        paymentSecret: paymentSecret || null,

        // Description
        description: description || null,
        descriptionHash: descriptionHash || null,

        // Timestamps
        timestamp: decoded.timestamp || null,
        timestampString: decoded.timestampString ||
            (decoded.timestamp ? new Date(decoded.timestamp * 1000).toISOString() : null),

        // Expiry
        expiry: expireTime || null,
        timeExpireDate: timeExpireDate || null,
        timeExpireDateString: decoded.timeExpireDateString ||
            (timeExpireDate ? new Date(timeExpireDate * 1000).toISOString() : null),

        // CLTV
        minFinalCltvExpiry: minFinalCltvExpiry || null,

        // Signature
        recoveryFlag: recoveryFlag,
        signature: decoded.signature || null,
        signatureHex: signatureHex,

        // Routing info with detailed fields
        routingInfo: routingInfo ? routingInfo.map(hop => ({
            pubKey: hop.pubkey || null,
            shortChannelId: hop.short_channel_id || null,
            feeBaseMsat: hop.fee_base_msat || null,
            feeProportionalMillionths: hop.fee_proportional_millionths || null,
            cltvExpiryDelta: hop.cltv_expiry_delta || null
        })) : [],

        // Fallback addresses
        fallbackAddresses: fallbackAddress ? [fallbackAddress] : (decoded.fallbackAddresses || []),

        // Features
        features: featureBits || decoded.features || {},

        // Unknown tags
        unknownTags: unknownTags.length > 0 ? unknownTags : [],

        // Raw invoice
        invoice: invoice
    };
}

/**
 * Decode LNURL string
 */
function decodeLNURL(lnurlString) {
    return lnurl.decode(lnurlString);
}

/**
 * Decode BIP21 URI with embedded Lightning invoice
 */
function decodeBIP21Full(uri) {
    const parsed = parseBIP21(uri);

    const result = {
        onchain: {
            address: parsed.address,
            amount: parsed.amount,
            amountSats: parsed.amount ? Math.round(parsed.amount * 100000000) : null,
            label: parsed.label,
            message: parsed.message,
            otherParams: Object.keys(parsed.otherParams).length > 0 ? parsed.otherParams : undefined
        }
    };

    // If there's a lightning invoice embedded, decode it
    if (parsed.lightning) {
        try {
            result.lightning = {
                invoice: parsed.lightning,
                decoded: decodeBolt11Full(parsed.lightning)
            };
        } catch (error) {
            result.lightning = {
                invoice: parsed.lightning,
                error: 'Failed to decode embedded Lightning invoice: ' + error.message
            };
        }
    }

    return result;
}

// Serve the decoder page UI
router.get('/', asyncHandler(async (req, res) => {
    const html = templates.renderDecoderPage();
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
}));

// ============================================================================
// API Endpoints
// ============================================================================

// Unified decode endpoint with auto-detection
router.post('/auto', asyncHandler(async (req, res) => {
    const { input } = req.body;

    if (!input) {
        return res.status(400).json({
            success: false,
            error: 'Missing input parameter'
        });
    }

    const inputType = detectInputType(input);

    try {
        let decoded;

        switch (inputType) {
            case 'bip21':
                decoded = decodeBIP21Full(input);
                Logger.info('BIP21 URI decoded', { address: decoded.onchain.address });
                break;

            case 'bolt11':
                decoded = decodeBolt11Full(input);
                Logger.info('BOLT11 invoice decoded', { paymentHash: decoded.paymentHash });
                break;

            case 'lnurl':
                decoded = decodeLNURL(input);
                Logger.info('LNURL decoded', { decoded });
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: 'Unable to detect input type. Supported types: BIP21 URI (bitcoin:...), BOLT11 invoice (lnbc...), LNURL (lnurl1...)'
                });
        }

        res.json({
            success: true,
            type: inputType,
            input: input,
            decoded: decoded
        });

    } catch (error) {
        Logger.error('Error decoding input', { type: inputType, error: error.message });
        res.status(400).json({
            success: false,
            type: inputType,
            error: error.message
        });
    }
}));

// BIP21 decode endpoint
router.post('/bip21', asyncHandler(async (req, res) => {
    const { uri } = req.body;

    if (!uri) {
        return res.status(400).json({
            success: false,
            error: 'Missing uri parameter'
        });
    }

    try {
        const decoded = decodeBIP21Full(uri);
        Logger.info('BIP21 URI decoded', { address: decoded.onchain.address });

        res.json({
            success: true,
            type: 'bip21',
            uri: uri,
            decoded: decoded
        });
    } catch (error) {
        Logger.error('Error decoding BIP21 URI', error);
        res.status(400).json({
            success: false,
            error: 'Invalid BIP21 URI: ' + error.message
        });
    }
}));

// Decode Lightning invoice endpoint (enhanced with full fields)
router.post('/lightning', asyncHandler(async (req, res) => {
    const { invoice } = req.body;

    if (!invoice) {
        return res.status(400).json({
            error: 'Missing invoice parameter'
        });
    }

    try {
        const decoded = decodeBolt11Full(invoice);
        Logger.info('Lightning invoice decoded', {
            paymentHash: decoded.paymentHash,
            amount: decoded.amount?.millisatoshis
        });

        res.json({
            success: true,
            type: 'bolt11',
            invoice: invoice,
            decoded: decoded
        });
    } catch (error) {
        Logger.error('Error decoding Lightning invoice', error);
        res.status(400).json({
            success: false,
            error: 'Invalid Lightning invoice: ' + error.message
        });
    }
}));

// Decode LNURL endpoint
router.post('/lnurl/decode', asyncHandler(async (req, res) => {
    const { lnurlString } = req.body;

    if (!lnurlString) {
        return res.status(400).json({
            error: 'Missing lnurlString parameter'
        });
    }

    try {
        const decoded = lnurl.decode(lnurlString);
        Logger.info('LNURL decoded', {
            original: lnurlString,
            decoded: decoded
        });

        res.json({
            success: true,
            lnurl: lnurlString,
            decoded: decoded
        });
    } catch (error) {
        Logger.error('Error decoding LNURL', error);
        res.status(400).json({
            success: false,
            error: 'Invalid LNURL: ' + error.message
        });
    }
}));

// Encode URL to LNURL endpoint
router.post('/lnurl/encode', asyncHandler(async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({
            error: 'Missing url parameter'
        });
    }

    try {
        // Validate URL format
        new URL(url);

        const encoded = lnurl.encode(url);
        Logger.info('URL encoded to LNURL', {
            original: url,
            encoded: encoded
        });

        res.json({
            success: true,
            url: url,
            encoded: encoded
        });
    } catch (error) {
        Logger.error('Error encoding URL to LNURL', error);
        res.status(400).json({
            success: false,
            error: 'Invalid URL or encoding error: ' + error.message
        });
    }
}));

module.exports = router;