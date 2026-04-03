const express = require('express');
const router = express.Router();
const { encode } = require('lnurl');

const config = require('../config');
const db = require('../database');
const Validation = require('../utils/validation');
const Logger = require('../utils/logger');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

// LNURL-auth endpoint
router.get('/', asyncHandler(async (req, res) => {
    const { sig, key, k1 } = req.query;

    if (sig && key && k1) {
        // Verify signed request
        await handleSignedRequest(req, res);
    } else {
        // Generate new auth challenge
        await handleEmptyRequest(req, res);
    }
}));

async function handleSignedRequest(req, res) {
    const { tag, k1, sig, key, action } = req.query;

    // Validate input params
    if (!Validation.isValidK1(k1)) {
        throw new ValidationError('Invalid k1 parameter - must be 32-byte hex string');
    }

    if (!Validation.isValidSignature(sig)) {
        throw new ValidationError('Invalid sig parameter - must be DER-hex-encoded ECDSA signature');
    }

    if (!Validation.isValidPublicKey(key)) {
        throw new ValidationError('Invalid key parameter - must be compressed 33-byte secp256k1 public key');
    }

    // action: optional, but if present must be valid enum
    if (!Validation.isValidAuthAction(action)) {
        throw new ValidationError('Invalid action parameter');
    }

    // Get session from db
    const authSession = await db.getAuthSession(k1);
    if (!authSession) {
        Logger.error('Auth session not found or expired for k1:', k1);
        return res.status(400).json({
            status: 'ERROR',
            reason: 'Invalid or expired k1'
        });
    }

    // Verify the signature
    const isValidSignature = Validation.verifyLnurlAuthSignature(k1, sig, key);
    if (!isValidSignature) {
        Logger.error('Invalid auth signature', { k1, pubkey: key });
        return res.status(400).json({
            status: 'ERROR',
            reason: 'Invalid signature'
        });
    }

    await db.authenticateSession(k1, key);

    // Return success without JWT token
    res.json({ 
        status: 'OK'
    });
}

async function handleEmptyRequest(req, res) {
    const { action = 'login' } = req.query;

    if (!Validation.isValidAuthAction(action)) {
        throw new ValidationError('Invalid action parameter');
    }

    // Generate k1 and session
    const k1 = Validation.generateK1();
    const sessionId = Validation.generateId();
    
    // Calculate expiration time
    const expiresAt = Validation.calculateSessionExpiry();

    // Store auth session in db
    await db.createAuthSession(sessionId, k1, expiresAt.toISOString());

    // Build auth URL
    const authUrl = `${config.domain}/auth?tag=login&k1=${k1}&action=${action}`;
    
    // Return raw callback URL (for ldk-node vss auth via LNURL)
    res.type('text/plain').send(authUrl);
}

module.exports = router;
