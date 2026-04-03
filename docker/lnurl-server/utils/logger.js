const config = require('../config');

class Logger {
    static info(message, data = {}) {
        const timestamp = new Date().toISOString();
        const output = Object.keys(data).length > 0 ? `\n${JSON.stringify(data, null, 2)}` : '';
        console.log(`[${timestamp}] INFO: ${message}${output}`);
    }

    static error(message, error = null) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ERROR: ${message}`, error ? error.message : '');
        if (error && error.stack && config.nodeEnv === 'development') {
            console.error(error.stack);
        }
    }

    static warn(message, data = {}) {
        const timestamp = new Date().toISOString();
        const output = Object.keys(data).length > 0 ? `\n${JSON.stringify(data, null, 2)}` : '';
        console.warn(`[${timestamp}] WARN: ${message}${output}`);
    }

    static debug(message, data = {}) {
        if (config.nodeEnv === 'development') {
            const timestamp = new Date().toISOString();
            const output = Object.keys(data).length > 0 ? `\n${JSON.stringify(data, null, 2)}` : '';
            console.log(`[${timestamp}] DEBUG: ${message}${output}`);
        }
    }

    // Specific logging methods for different operations
    static payment(operation, data = {}) {
        this.info(`Payment ${operation}`, data);
    }

    static withdrawal(operation, data = {}) {
        this.info(`Withdrawal ${operation}`, data);
    }

    static channel(operation, data = {}) {
        this.info(`Channel ${operation}`, data);
    }

    static connection(service, status, data = {}) {
        this.info(`${service} connection ${status}`, data);
    }

    static api(endpoint, method, status, data = {}) {
        this.info(`API ${method} ${endpoint} - ${status}`, data);
    }
}

module.exports = Logger;
