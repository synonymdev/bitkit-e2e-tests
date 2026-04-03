const express = require('express');
const router = express.Router();

const config = require('../config');
const db = require('../database');
const lndService = require('../services/lnd');
const Validation = require('../utils/validation');
const Logger = require('../utils/logger');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');

// LNURL-pay endpoint
router.get('/:paymentId', asyncHandler(async (req, res) => {
    const { paymentId } = req.params;

    if (!Validation.isValidPaymentId(paymentId)) {
        throw new ValidationError('Invalid payment ID');
    }

    // Get payment configuration from database
    const paymentConfig = await db.getPaymentConfig(paymentId);
    if (!paymentConfig) {
        throw new NotFoundError('Payment configuration not found');
    }

    const metadata = JSON.stringify([
        ['text/plain', `Payment for ${paymentId}`]
    ]);

    res.json({
        tag: 'payRequest',
        callback: `${config.domain}/pay/${paymentId}/callback`,
        minSendable: paymentConfig.min_sendable,
        maxSendable: paymentConfig.max_sendable,
        metadata: metadata,
        commentAllowed: paymentConfig.comment_allowed
    });
}));

// LNURL-pay callback
router.get('/:paymentId/callback', asyncHandler(async (req, res) => {
    const { amount, comment } = req.query;
    const { paymentId } = req.params;

    // Validate input parameters
    const validationErrors = Validation.validatePayCallback({ amount, comment });
    if (validationErrors.length > 0) {
        throw new ValidationError(validationErrors.join(', '));
    }

    const amountMsat = parseInt(amount);
    const amountSats = Math.floor(amountMsat / 1000);

    // Create invoice
    const invoice = await lndService.createInvoice(
        amountSats,
        comment ? `LNURL Payment ${paymentId} - ${comment}` : `LNURL Payment ${paymentId}`,
        3600
    );

    // Extract the payment hash in hex
    let paymentHashHex = '';
    if (invoice.r_hash_str) {
        paymentHashHex = invoice.r_hash_str;
    } else if (invoice.r_hash) {
        // Convert base64 to hex
        paymentHashHex = Buffer.from(invoice.r_hash, 'base64').toString('hex');
    } else if (invoice.payment_hash) {
        paymentHashHex = invoice.payment_hash;
    }

    // Generate unique payment record ID (different from paymentId used in URL)
    const uniquePaymentId = Validation.generateId();

    // Store payment info
    await db.createPayment(
        uniquePaymentId,
        amountSats,
        `LNURL Payment ${paymentId}`,
        paymentHashHex,
        comment || null
    );

    Logger.payment('invoice created', { paymentId, uniquePaymentId, amountSats });

    res.json({
        pr: invoice.payment_request,
        routes: []
    });
}));

module.exports = router; 
