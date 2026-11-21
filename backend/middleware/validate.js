'use strict';

const { validationResult } = require('express-validator');
const { AppError } = require('../utils/errors');

/** Terminate a request with 422 when express-validator found problems. */
function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array({ onlyFirstError: true }).map((e) => ({
    field: e.path,
    message: e.msg,
  }));
  next(new AppError(details[0] ? details[0].message : 'Invalid input', 422, details));
}

module.exports = { validate };
