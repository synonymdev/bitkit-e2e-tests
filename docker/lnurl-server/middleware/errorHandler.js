const Logger = require('../utils/logger');

// Error handling middleware
function errorHandler(err, req, res, next) {
    Logger.error('Unhandled error', err);

    // Default error response
    const errorResponse = {
        status: 'ERROR',
        reason: err.message || 'Internal server error'
    };

    // Set appropriate status code
    let statusCode = 500;

    if (err.name === 'ValidationError') {
        statusCode = 400;
    } else if (err.name === 'NotFoundError') {
        statusCode = 404;
    } else if (err.name === 'UnauthorizedError') {
        statusCode = 401;
    }

    res.status(statusCode).json(errorResponse);
}

// Async error wrapper for route handlers
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// Custom error classes
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotFoundError';
    }
}

class UnauthorizedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnauthorizedError';
    }
}

module.exports = {
    errorHandler,
    asyncHandler,
    ValidationError,
    NotFoundError,
    UnauthorizedError
};
