'use strict';

/**
 * Centralized environment configuration with fail-fast validation.
 * Never hardcode secrets - everything comes from process.env (.env).
 */
require('dotenv').config();

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Copy .env.example to .env and set it.`);
  }
  return value;
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  isDev: process.env.NODE_ENV === 'development',
  isTest: process.env.NODE_ENV === 'test',
  port: parseInt(process.env.PORT || '3000', 10),
  mongodbUri: required('MONGODB_URI'),
  sessionSecret: required('SESSION_SECRET'),
  sessionMaxAgeHours: parseInt(process.env.SESSION_MAX_AGE_HOURS || '8', 10),
  appOrigin: process.env.APP_ORIGIN || '',
};

if (env.isProd && env.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters in production.');
}

module.exports = env;
