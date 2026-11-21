'use strict';

/**
 * Entry point: validates env, connects to MongoDB, starts the HTTP server,
 * and shuts down gracefully on SIGINT/SIGTERM.
 */
const env = require('./backend/config/env');
const { connectDB, disconnectDB, mongoose } = require('./backend/config/db');
const app = require('./app');

let server;

async function start() {
  // one retry: cloud DBs / DNS hiccups can fail a first attempt transiently
  try {
    await connectDB();
  } catch (firstErr) {
    console.warn('[server] First DB connect attempt failed:', firstErr.message);
    console.warn('[server] Retrying once in 3 seconds...');
    await new Promise((r) => setTimeout(r, 3000));
    await connectDB();
  }

  server = app.listen(env.port, () => {
    console.log(`[server] Bill Generation Software running on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  server.headersTimeout = 65000;
  server.keepAliveTimeout = 61000;
}

async function shutdown(signal) {
  console.log(`\n[server] ${signal} received - shutting down gracefully...`);
  if (server) {
    server.close(() => console.log('[server] HTTP server closed'));
  }
  try {
    await disconnectDB();
    await mongoose.connection.close();
  } catch {
    /* already closed */
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  process.exit(1);
});
