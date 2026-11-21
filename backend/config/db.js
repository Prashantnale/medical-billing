'use strict';

const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);
// Strip query operator injection ($gt, $ne, ...) from user-supplied filter objects.
mongoose.set('sanitizeFilter', true);

let connected = false;
let connectPromise = null;

/**
 * Connect to MongoDB once and reuse the connection across the app.
 * Memoized so concurrent callers (app + session store) share one connect.
 */
async function connectDB(uri = env.mongodbUri) {
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    mongoose.connection.on('connected', () => console.log('[db] MongoDB connected'));
    mongoose.connection.on('error', (err) => console.error('[db] MongoDB error:', err.message));
    mongoose.connection.on('disconnected', () => console.warn('[db] MongoDB disconnected'));

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 5, // single user - a tiny pool is more than enough
    });

    connected = true;
    return mongoose.connection;
  })();

  return connectPromise;
}

async function disconnectDB() {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
  connectPromise = null;
}

module.exports = { connectDB, disconnectDB, mongoose };
