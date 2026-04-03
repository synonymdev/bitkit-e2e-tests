const express = require('express');
const router = express.Router();
const { encode } = require('lnurl');
const QRCode = require('qrcode');

const config = require('../config');
const db = require('../database');
const lndService = require('../services/lnd');
const Validation = require('../utils/validation');
const Logger = require('../utils/logger');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const templates = require('../templates');

// Generate index HTML page
router.get('/', asyncHandler(async (req, res) => {
    const html = templates.renderGeneratorPage({});
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
}));

// Generate LNURL
router.get('/:type', asyncHandler(async (req, res) => {
    const { type } = req.params;
    const data = await generateLnurl(type, req.query);
    res.json(data);
}));

// Generate QR code in HTML
router.get('/:type/qr', asyncHandler(async (req, res) => {
    const { type } = req.params;
    const data = await generateLnurl(type, req.query);
    const html = templates.renderQrPage({
        type,
        qrCode: data.qrCode,
        url: data.url
    });

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
}));


const generateLnurl = async (type, query) => {
    switch (type) {
        case 'withdraw':
            return await generateLnurlWithdraw(query);
        case 'pay':
            return await generateLnurlPay(query);
        case 'channel':
            return await generateLnurlChannel();
        case 'auth':
            return await generateLnurlAuth(query);
        case 'bolt11':
            return await generateBolt11(query);
        default:
            throw new ValidationError('Invalid type. Use "withdraw", "pay", "channel", "auth", or "bolt11"');
    }
};

const generateLnurlWithdraw = async (query) => {
    const { minWithdrawable, maxWithdrawable } = query;

    // Build URL with optional params
    let url = `${config.domain}/withdraw`;
    const params = new URLSearchParams();
    if (minWithdrawable) params.append('minWithdrawable', minWithdrawable);
    if (maxWithdrawable) params.append('maxWithdrawable', maxWithdrawable);
    if (params.toString()) url += `?${params.toString()}`;

    const lnurl = encode(url);
    const qrCode = await QRCode.toDataURL(lnurl, {
        width: 256,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    });

    return {
        url,
        lnurl,
        qrCode,
        type: 'withdraw'
    };
};

const generateLnurlPay = async (query) => {
    const { minSendable, maxSendable, commentAllowed } = query;
    const paymentId = Validation.generateId();

    // Store payment configuration in database
    const minSendableValue = minSendable ? parseInt(minSendable) : config.limits.minSendable;
    const maxSendableValue = maxSendable ? parseInt(maxSendable) : config.limits.maxSendable;
    const commentAllowedValue = commentAllowed ? parseInt(commentAllowed) : config.limits.commentAllowed;

    await db.createPaymentConfig(paymentId, minSendableValue, maxSendableValue, commentAllowedValue);

    // Build URL (no query parameters needed since config is in DB)
    const paymentUrl = `${config.domain}/pay/${paymentId}`;
    const lnurl = encode(paymentUrl);
    const qrCode = await QRCode.toDataURL(lnurl, {
        width: 256,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    });

    Logger.info('Payment config created', { paymentId, minSendable: minSendableValue, maxSendable: maxSendableValue });

    return {
        url: paymentUrl,
        lnurl,
        qrCode,
        paymentId,
        type: 'pay',
        minSendable: minSendableValue,
        maxSendable: maxSendableValue,
        commentAllowed: commentAllowedValue
    };
};

const generateLnurlChannel = async () => {
    const channelUrl = `${config.domain}/channel`;
    const lnurl = encode(channelUrl);
    const qrCode = await QRCode.toDataURL(lnurl, {
        width: 256,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    });

    return {
        url: channelUrl,
        lnurl,
        qrCode,
        type: 'channel'
    };
};

const generateLnurlAuth = async (query) => {
    const { action = 'login' } = query;

    if (!Validation.isValidAuthAction(action)) {
        throw new ValidationError('Invalid action parameter');
    }

    const k1 = Validation.generateK1();
    const sessionId = Validation.generateId();

    // Calculate expiration time
    const expiresAt = Validation.calculateSessionExpiry();

    // Store session in db
    await db.createAuthSession(sessionId, k1, expiresAt.toISOString());

    // Build auth URL
    const authUrl = `${config.domain}/auth?tag=login&k1=${k1}&action=${action}`;
    
    const lnurl = encode(authUrl);
    const qrCode = await QRCode.toDataURL(lnurl, {
        width: 256,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    });

    const responseData = {
        status: 'OK',
        url: authUrl,
        lnurl,
        qrCode,
        type: 'auth',
        k1: k1
    };

    Logger.info('LNURL-auth generated', { authUrl, k1, sessionId });
    return responseData;
};

const generateBolt11 = async (query) => {
    const { amount } = query;

    // Default to 0 (zero-amount invoice) if not specified
    const amountSats = amount ? parseInt(amount) : 0;

    if (isNaN(amountSats) || amountSats < 0) {
        throw new ValidationError('Invalid amount. Must be zero or a positive integer.');
    }

    // Create invoice with LND
    const invoice = await lndService.createInvoice(amountSats, '', 3600);
    const paymentRequest = invoice.payment_request;

    const qrCode = await QRCode.toDataURL(paymentRequest, {
        width: 256,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    });

    Logger.info('Bolt11 invoice generated', { amount: amountSats, paymentHash: invoice.r_hash });

    return {
        bolt11: paymentRequest,
        qrCode,
        type: 'bolt11',
        amount: amountSats,
        paymentHash: invoice.r_hash
    };
};


module.exports = router;
