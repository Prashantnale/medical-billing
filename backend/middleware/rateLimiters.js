'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const skip = () => env.isTest; // integration tests perform many auth calls by design

/**
 * Single-user app: limiters exist to blunt brute-force and runaway
 * clients, not to throttle normal use.
 */

// Login/register attempts: 10 per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { error: 'Too many attempts. Please wait 15 minutes and try again.' },
});

// General API: 300 requests / 15 min is generous for one user + screen readers.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { error: 'Too many requests. Please slow down.' },
});

module.exports = { authLimiter, apiLimiter };
