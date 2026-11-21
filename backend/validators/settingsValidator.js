'use strict';

const { body } = require('express-validator');

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PHONE_RE = /^[+0-9()\-\s]{5,20}$/;

const optionalPattern = (field, regex, message) =>
  body(field)
    .optional({ values: 'falsy' })
    .trim()
    .matches(regex)
    .withMessage(message)
    .withMessage(`${field} format is invalid`);

const updateSettingsRules = [
  body('businessName').optional({ checkFalsy: false }).trim().isLength({ min: 1, max: 120 }).withMessage('Business name is required (max 120 chars)'),
  body('address.addressLine1').optional({ values: 'null' }).trim().isLength({ max: 120 }),
  body('address.addressLine2').optional({ values: 'null' }).trim().isLength({ max: 120 }),
  body('address.city').optional({ values: 'null' }).trim().isLength({ max: 60 }),
  body('address.state').optional({ values: 'null' }).trim().isLength({ max: 60 }),
  body('address.stateCode').optional({ values: 'null' }).trim().isLength({ max: 2 }).toUpperCase(),
  body('address.pincode').optional({ values: 'null' }).trim().isLength({ max: 10 }),
  optionalPattern('gstin', GSTIN_RE, 'GSTIN must be a valid 15-character GST number'),
  optionalPattern('pan', PAN_RE, 'PAN must be a valid 10-character PAN'),
  body('drugLicenseNo').optional({ values: 'null' }).trim().isLength({ max: 60 }),
  optionalPattern('phone', PHONE_RE, 'Phone must be 5-20 digits'),
  optionalPattern('altPhone', PHONE_RE, 'Alternate phone must be 5-20 digits'),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Enter a valid email').isLength({ max: 120 }),
  body('invoicePrefix').optional({ values: 'null' }).trim().isLength({ max: 12 }),
  body('invoicePadding').optional().isInt({ min: 3, max: 8 }).withMessage('Padding must be 3-8 digits'),
  body('nextInvoiceNumber').optional().isInt({ min: 1, max: 99999999 }).withMessage('Next invoice number must be positive'),
  body('defaultTaxMode').optional().isIn(['inclusive', 'exclusive']),
  body('defaultRoundOff').optional().isBoolean(),
  body('termsText').optional({ values: 'null' }).trim().isLength({ max: 500 }),
  body('thankYouText').optional({ values: 'null' }).trim().isLength({ max: 120 }),
  body('logoDataUrl')
    .optional({ values: 'null' })
    .custom((v) => v === '' || (/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= 220000))
    .withMessage('Logo must be a PNG/JPEG/WebP data URL under ~150 KB'),
];

module.exports = { updateSettingsRules };
