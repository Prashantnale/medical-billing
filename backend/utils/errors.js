'use strict';

/**
 * Operational error with an HTTP status code. Anything thrown that is not
 * an AppError is treated as an unexpected 500 by the central error handler.
 */
class AppError extends Error {
  constructor(message, statusCode = 400, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    if (details) this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** Wrap an async route handler so rejections reach the central error handler. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { AppError, asyncHandler };
