'use strict';

const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    addressLine1: { type: String, trim: true, maxlength: 120, default: '' },
    addressLine2: { type: String, trim: true, maxlength: 120, default: '' },
    city: { type: String, trim: true, maxlength: 60, default: '' },
    state: { type: String, trim: true, maxlength: 60, default: '' },
    stateCode: { type: String, trim: true, maxlength: 2, uppercase: true, default: '' },
    pincode: { type: String, trim: true, maxlength: 10, default: '' },
  },
  { _id: false }
);

/**
 * Shop/business settings - a single singleton document (fixed _id).
 * Every bill stores an immutable snapshot of these values at creation time.
 */
const shopSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'main' },
    businessName: { type: String, required: true, trim: true, maxlength: 120 },
    address: { type: addressSchema, default: () => ({}) },
    gstin: { type: String, trim: true, uppercase: true, maxlength: 15, default: '' },
    pan: { type: String, trim: true, uppercase: true, maxlength: 10, default: '' },
    drugLicenseNo: { type: String, trim: true, maxlength: 60, default: '' },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    altPhone: { type: String, trim: true, maxlength: 20, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
    // Invoice numbering
    invoicePrefix: { type: String, trim: true, maxlength: 12, default: 'INV-' },
    invoicePadding: { type: Number, min: 3, max: 8, default: 4 },
    nextInvoiceNumber: { type: Number, min: 1, default: 1 },
    // Billing defaults
    defaultTaxMode: { type: String, enum: ['inclusive', 'exclusive'], default: 'exclusive' },
    defaultRoundOff: { type: Boolean, default: true },
    // Invoice extras
    termsText: {
      type: String,
      trim: true,
      maxlength: 500,
      default: 'Goods once sold will not be taken back. Subject to local jurisdiction.',
    },
    thankYouText: { type: String, trim: true, maxlength: 120, default: 'Thank you for your business!' },
    // Small logo stored as data URL (kept under ~150 KB)
    logoDataUrl: {
      type: String,
      trim: true,
      maxlength: 220000,
      default: '',
      validate: {
        validator: (v) => !v || /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(v),
        message: 'logoDataUrl must be a base64 PNG/JPEG/WebP data URL',
      },
    },
  },
  { timestamps: true }
);

/** Return the singleton settings document, creating it on first use. */
shopSettingsSchema.statics.getSingleton = async function getSingleton() {
  let doc = await this.findById('main').lean();
  if (!doc) {
    await this.updateOne({ _id: 'main' }, { $setOnInsert: { businessName: 'My Medical Store' } }, { upsert: true });
    doc = await this.findById('main').lean();
  }
  return doc;
};

const ShopSettings = mongoose.model('ShopSettings', shopSettingsSchema);
module.exports = ShopSettings;
