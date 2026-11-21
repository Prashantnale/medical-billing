'use strict';

const { AppError } = require('../utils/errors');
const env = require('../config/env');

function notFoundHandler(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).render('pages/404');
}

/**
 * Single centralized error handler. Operational errors (AppError) keep
 * their status and message; everything else becomes an opaque 500.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details; // AppError carries structured details (e.g. field errors)

  // Mongoose validation -> 422 with field errors
  if (err.name === 'ValidationError') {
    status = 422;
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    message = details[0] ? details[0].message : 'Validation failed';
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    message = `Duplicate value for ${field}`;
  }

  if (status >= 500) {
    console.error('[error]', err);
  }

  if (env.isDev && status >= 500) {
    details = { stack: err.stack };
  }

  if (req.path.startsWith('/api/') || req.xhr || (req.headers.accept || '').includes('application/json')) {
    return res.status(status).json({ error: message, ...(details ? { details } : {}) });
  }

  if (err.name === 'ValidationError' || err.statusCode) {
    return res.status(status).render('pages/error', { title: 'Error', statusCode: status, message, details });
  }
  res.status(status).render('pages/error', {
    title: 'Error',
    statusCode: status,
    message: status >= 500 ? 'Something went wrong on our side. Please try again.' : message,
    details: undefined,
  });
}

module.exports = { notFoundHandler, errorHandler };
