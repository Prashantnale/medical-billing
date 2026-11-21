'use strict';

const { body } = require('express-validator');

const medicineRules = [
  body('name').trim().notEmpty().withMessage('Medicine name is required').isLength({ max: 140 }),
  body('composition').optional({ values: 'null' }).trim().isLength({ max: 200 }),
  body('hsnCode').optional({ values: 'null' }).trim().isLength({ max: 20 }),
  body('mrp').optional({ values: 'falsy' }).isFloat({ min: 0, max: 1e9 }).withMessage('MRP must be a positive number'),
  body('rate').optional({ values: 'falsy' }).isFloat({ min: 0, max: 1e9 }).withMessage('Rate must be a positive number'),
  body('unit').optional({ values: 'null' }).trim().isLength({ max: 20 }),
  body('gstRate').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100 }).withMessage('GST rate must be 0-100'),
];

module.exports = { medicineRules };
