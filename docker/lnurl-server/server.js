const express = require('express');
const cors = require('cors');

// Import configuration and services
const config = require('./config');
const Logger = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const httpLogger = require('./middleware/httpLogger');
const backgroundJobs = require('./services/backgroundJobs');

// Import route modules
const withdrawRoutes = require('./routes/withdraw');
const channelRoutes = require('./routes/channel');
const payRoutes = require('./routes/pay');
const adminRoutes = require('./routes/admin');
const generateRoutes = require('./routes/generate');
const wellKnownRoutes = require('./routes/well-known');
const authRoutes = require('./routes/auth');
const decoderRoutes = require('./routes/decoder');

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(httpLogger); // Request logging middleware (must stay before routes)

// Routes
app.use('/withdraw', withdrawRoutes);
app.use('/channel', channelRoutes);
app.use('/pay', payRoutes);
app.use('/', adminRoutes); // Health check and monitoring endpoints
app.use('/auth', authRoutes);
app.use('/', wellKnownRoutes);
app.use('/generate', generateRoutes);
app.use('/decode', decoderRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  Logger.info('SIGTERM received, shutting down gracefully');
  backgroundJobs.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  Logger.info('SIGINT received, shutting down gracefully');
  backgroundJobs.stop();
  process.exit(0);
});

// Start server
app.listen(config.port, async () => {
  Logger.info('LNURL server starting', {
    port: config.port,
    domain: config.domain,
    nodeEnv: config.nodeEnv
  });

  Logger.info('Configuration loaded', {
    bitcoin: `${config.bitcoin.host}:${config.bitcoin.port}`,
    lnd: `${config.lnd.restHost}:${config.lnd.restPort}`,
    database: config.database.path
  });

  // Wait a bit for services to be ready
  setTimeout(async () => {
    Logger.info('Starting background jobs');
    backgroundJobs.start();
  }, 5000);
});

module.exports = app;
