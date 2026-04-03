const crypto = require('crypto');
const secp256k1 = require('secp256k1');
const config = require('../config');

class Validation {
    // Validate k1 parameter (32-byte hex string)
    static isValidK1(k1) {
        if (!k1 || typeof k1 !== 'string') {
            return false;
        }
        return /^[a-fA-F0-9]{64}$/.test(k1);
    }

    // Validate payment request (Lightning invoice)
    static isValidPaymentRequest(pr) {
        if (!pr || typeof pr !== 'string') {
            return false;
        }
        // Basic validation - starts with 'lnbc' for mainnet or 'lntb' for testnet
        return /^ln(bc|tb|rt)[a-zA-Z0-9]+$/.test(pr);
    }

    // Validate amount in millisatoshis
    static isValidAmount(amount) {
        const num = parseInt(amount);
        return !isNaN(num) && num > 0;
    }

    // Validate amount is within limits
    static isAmountInRange(amount, min, max) {
        const num = parseInt(amount);
        return !isNaN(num) && num >= min && num <= max;
    }

    // Validate remote node ID (33-byte hex string starting with 02 or 03)
    static isValidRemoteId(remoteId) {
        if (!remoteId || typeof remoteId !== 'string') {
            return false;
        }
        return /^0[23][a-fA-F0-9]{64}$/.test(remoteId);
    }

    // Validate payment ID (hex string)
    static isValidPaymentId(paymentId) {
        if (!paymentId || typeof paymentId !== 'string') {
            return false;
        }
        return /^[a-fA-F0-9]+$/.test(paymentId);
    }

    // Validate comment length
    static isValidComment(comment, maxLength = config.limits.commentAllowed) {
        if (!comment) {
            return true; // Comments are optional
        }
        return typeof comment === 'string' && comment.length <= maxLength;
    }

    // Validate boolean parameter
    static isValidBoolean(value) {
        if (value === undefined || value === null) {
            return true; // Optional boolean
        }
        return value === '0' || value === '1' || value === true || value === false;
    }

    // Generate random k1 challenge
    static generateK1() {
        return crypto.randomBytes(config.limits.k1Length).toString('hex');
    }

    // Generate random ID
    static generateId() {
        return crypto.randomBytes(config.limits.idLength).toString('hex');
    }

    static calculateSessionExpiry() {
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + config.limits.sessionTimeout);
        return expiresAt;
    }

    static isValidPublicKey(pubkey) {
        try {
            if (!pubkey || typeof pubkey !== 'string') {
                return false;
            }

            // Check if it's a valid hex string of correct length (33 bytes = 66 hex chars)
            if (!/^[a-fA-F0-9]{66}$/.test(pubkey)) {
                return false;
            }

            const keyBuffer = Buffer.from(pubkey, 'hex');
            return secp256k1.publicKeyVerify(keyBuffer);
        } catch (error) {
            return false;
        }
    }

    static isValidSignature(signature) {
        try {
            if (!signature || typeof signature !== 'string') {
                return false;
            }

            // Check if it's a valid hex string
            if (!/^[a-fA-F0-9]+$/.test(signature)) {
                return false;
            }

            const sigBuffer = Buffer.from(signature, 'hex');
            
            // Try to parse as DER-encoded signature
            try {
                secp256k1.signatureImport(sigBuffer);
                return true; // Valid DER signature
            } catch (derError) {
                // If DER parsing fails, check if it's compact format (64 bytes = 128 hex chars)
                if (sigBuffer.length === 64) {
                    return true; // Valid compact signature
                }
                return false; // Invalid format
            }
        } catch (error) {
            return false;
        }
    }

    static verifyLnurlAuthSignature(k1, sig, key) {
        try {           
            // Convert hex strings to buffers
            const k1Buffer = Buffer.from(k1, 'hex');
            const sigBuffer = Buffer.from(sig, 'hex');
            const keyBuffer = Buffer.from(key, 'hex');

            // Verify the public key is valid
            if (!secp256k1.publicKeyVerify(keyBuffer)) {
                return false;
            }

            // Convert DER-encoded signature to compact format for secp256k1 verification
            let compactSig;
            try {
                compactSig = secp256k1.signatureImport(sigBuffer);
            } catch (derError) {
                // If DER parsing fails, try as compact signature (backwards compatibility)
                if (sigBuffer.length === 64) {
                    compactSig = sigBuffer;
                } else {
                    return false;
                }
            }

            // Verify the signature
            const isValid = secp256k1.ecdsaVerify(compactSig, k1Buffer, keyBuffer);
            return isValid;
        } catch (error) {
            return false;
        }
    }

    static isValidAuthAction(action) {
        if (!action) return true; // valid (no action provided)
        
        const validActions = ['register', 'login', 'link', 'auth'];
        return validActions.includes(action);
    }

    // Validate LNURL channel request parameters
    static validateChannelRequest(params) {
        const errors = [];

        if (params.cancel === '1') {
            // For cancellation, only k1 is required
            if (!this.isValidK1(params.k1)) {
                errors.push('Invalid k1 parameter');
            }
        } else {
            // For channel opening, k1 and remoteid are required
            if (!this.isValidK1(params.k1)) {
                errors.push('Invalid k1 parameter');
            }
            if (!this.isValidRemoteId(params.remoteid)) {
                errors.push('Invalid remoteid parameter');
            }
            if (params.private && !this.isValidBoolean(params.private)) {
                errors.push('Invalid private parameter');
            }
        }

        return errors;
    }

    // Validate LNURL withdraw callback parameters
    static validateWithdrawCallback(params) {
        const errors = [];

        if (!this.isValidK1(params.k1)) {
            errors.push('Invalid k1 parameter');
        }
        if (!this.isValidPaymentRequest(params.pr)) {
            errors.push('Invalid payment request');
        }

        return errors;
    }

    // Validate LNURL pay callback parameters
    static validatePayCallback(params) {
        const errors = [];

        if (!this.isValidAmount(params.amount)) {
            errors.push('Invalid amount parameter');
        }
        if (params.comment && !this.isValidComment(params.comment)) {
            errors.push('Comment too long');
        }

        return errors;
    }
}

module.exports = Validation;
