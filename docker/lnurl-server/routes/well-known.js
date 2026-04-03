const express = require('express');
const router = express.Router();

const config = require('../config');
const db = require('../database');
const Logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

// LNURL-address resolution (well-known)
router.get('/.well-known/lnurlp/:username', asyncHandler(async (req, res) => {
    const { username } = req.params;

    const domain = config.domain.replace(/^https?:\/\//, '');
    const lightningAddress = `${username}@${domain}`;

    // LUD-16 compliant metadata
    const metadata = JSON.stringify([
        ["text/plain", `Payment to ${lightningAddress}`],
        ["text/identifier", lightningAddress]
    ]);

    const paymentId = require('crypto').createHash('sha256').update(username).digest('hex');

    // Store or update payment configuration for this Lightning Address
    await db.createPaymentConfig(paymentId, config.limits.minSendable, config.limits.maxSendable, 100);

    Logger.info('Lightning Address config created', { username, paymentId });

    res.json({
        tag: 'payRequest',
        callback: `${config.domain}/pay/${paymentId}/callback`,
        minSendable: config.limits.minSendable,
        maxSendable: config.limits.maxSendable,
        metadata,
        commentAllowed: config.limits.commentAllowed
    });
}));

module.exports = router; 