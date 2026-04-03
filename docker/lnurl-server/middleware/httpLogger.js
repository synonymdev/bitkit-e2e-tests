const Logger = require('../utils/logger');

// Helper function to detect HTML content
const isHtmlContent = (data) => {
    if (typeof data !== 'string') return false;
    const htmlPattern = /<\s*html[^>]*>|<\s*!doctype\s+html|<\s*head[^>]*>|<\s*body[^>]*>/i;
    return htmlPattern.test(data.trim());
};

// Log HTTP requests and responses
const httpLogger = (req, res, next) => {
    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    const method = req.method;
    
    // Log incoming request with separator
    console.log('---');
    const requestData = { method, url: fullUrl };
    if (Object.keys(req.query).length > 0) requestData.query = req.query;
    if (req.body && Object.keys(req.body).length > 0) {
        requestData.body = isHtmlContent(req.body) ? 'html' : req.body;
    }
    
    Logger.info(`HTTP REQUEST`, requestData);
    
    // Track if we've already logged the response to avoid duplicates
    let responseLogged = false;
    
    const logResponse = (data) => {
        if (responseLogged) return;
        responseLogged = true;
        
        console.log('---');
        const responseData = { method, url: fullUrl, status: res.statusCode };
        if (Object.keys(req.query).length > 0) responseData.query = req.query;
        if (data !== undefined && data !== null) {
            responseData.body = isHtmlContent(data) ? 'html' : data;
        }
        
        Logger.info(`HTTP RESPONSE`, responseData);
    };
    
    // Capture original res.json and res.send methods to log responses
    const originalJson = res.json;
    const originalSend = res.send;
    
    res.json = function(obj) {
        logResponse(obj);
        return originalJson.call(this, obj);
    };
    
    res.send = function(data) {
        // Only log if it's not already logged by res.json
        if (!responseLogged) {
            logResponse(data);
        }
        return originalSend.call(this, data);
    };
    
    next();
};

module.exports = httpLogger; 