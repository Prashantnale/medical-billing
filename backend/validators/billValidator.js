'use strict';

const { body } = require('express-validator');

/**
 * Numeric field: absent -> skipped (engine defaults it to 0); present ->
 * sanitized to a Number and range-checked.
 */
const num = (field, { min = -1e12, max = 1e12 } = {}) =>
  body(field)
    .optional({ values: 'undefined' })
    .customSanitizer((v) => (v === '' || v === null ? 0 : Number(v)))
    .custom((v) => Number.isFinite(v))
    .withMessage(`${field} must be a number`)
    .custom((v) => v >= min && v <= max)
    .withMessage(`${field} must be between ${min} and ${max}`);

const str = (field, { max = 200, required = false } = {}) =>
  body(field)
    .customSanitizer((v) => (typeof v === 'string' ? v.trim().slice(0, max * 3) : v))
    .isString()
    .isLength({ min: required ? 1 : 0, max })
    .withMessage(`${field} must be ${required ? 'non-empty and ' : ''}at most ${max} characters`);

const createBillRules = [
  body('invoiceDate').optional({ values: 'falsy' }).isISO8601({ strict: true }).withMessage('Invalid invoice date'),
  body('invoiceTime').optional({ values: 'falsy' }).matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Invalid time (HH:mm)'),
  body('invoiceType').optional().isIn(['Tax Invoice', 'Retail Invoice', 'GST Invoice', 'Bill of Supply', 'Credit Invoice']),
  body('paymentMode').optional().isIn(['Cash', 'UPI', 'Card', 'Cheque', 'Credit']),
  body('taxMode').isIn(['inclusive', 'exclusive']).withMessage('taxMode must be inclusive or exclusive'),
  body('taxSplit').isIn(['cgst_sgst', 'igst']).withMessage('taxSplit must be cgst_sgst or igst'),
  body('roundOffEnabled').optional().isBoolean(),

  str('customer.name', { max: 140 }),
  body('customer.address').optional({ values: 'null' }).isString().trim().isLength({ max: 300 }),
  body('customer.gstin').optional({ values: 'null' }).trim().isLength({ max: 15 }),
  body('customer.phone').optional({ values: 'null' }).trim().isLength({ max: 20 }),
  body('customer.doctorName').optional({ values: 'null' }).trim().isLength({ max: 120 }),
  body('customer.stateCode').optional({ values: 'null' }).trim().isLength({ max: 2 }),

  body('items').isArray({ min: 1, max: 100 }).withMessage('At least one item is required'),
  body('items.*.productName').trim().notEmpty().withMessage('Product name is required').isLength({ max: 140 }),
  body('items.*.composition').optional({ values: 'null' }).trim().isLength({ max: 200 }),
  body('items.*.hsnCode').optional({ values: 'null' }).trim().isLength({ max: 20 }),
  body('items.*.batchNumber').optional({ values: 'null' }).trim().isLength({ max: 40 }),
  body('items.*.expiryDate').optional({ values: 'null' }).trim().isLength({ max: 10 }),
  body('items.*.unit').optional({ values: 'null' }).trim().isLength({ max: 20 }),
  num('items.*.mrp', { min: 0, max: 1e9 }),
  num('items.*.quantity', { min: 0.001, max: 1e6 }),
  num('items.*.rate', { min: 0, max: 1e9 }),
  body('items.*.discountType').optional().isIn(['percent', 'fixed']),
  num('items.*.discountValue', { min: 0, max: 1e9 }),
  num('items.*.gstRate', { min: 0, max: 100 }),

  body('charges').optional({ values: 'null' }).isArray({ max: 5 }),
  body('charges.*.label').optional().trim().isLength({ max: 60 }),
  num('charges.*.amount', { min: -1e9, max: 1e9 }),

  body('notes').optional({ values: 'null' }).trim().isLength({ max: 300 }),
];

const cancelBillRules = [str('reason', { max: 200 })];

module.exports = { createBillRules, cancelBillRules };
