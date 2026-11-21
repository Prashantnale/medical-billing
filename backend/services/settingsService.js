'use strict';

const ShopSettings = require('../models/ShopSettings');
const counterService = require('./counterService');

/** Get the singleton settings document (creates the default on first call). */
async function getSettings() {
  return ShopSettings.getSingleton();
}

/**
 * Update the singleton settings. Only whitelisted fields are copied in.
 * When nextInvoiceNumber moves forward, the invoice counter is synced so
 * future bills start from the requested number (never backward).
 */
async function updateSettings(patch) {
  const allowed = [
    'businessName', 'address', 'gstin', 'pan', 'drugLicenseNo', 'phone', 'altPhone', 'email',
    'invoicePrefix', 'invoicePadding', 'nextInvoiceNumber', 'defaultTaxMode', 'defaultRoundOff',
    'termsText', 'thankYouText', 'logoDataUrl',
  ];

  const doc = await ShopSettings.findById('main');
  if (!doc) {
    // first ever save
    await ShopSettings.updateOne({ _id: 'main' }, { $setOnInsert: { businessName: 'My Medical Store' } }, { upsert: true });
  }

  const update = {};
  for (const key of allowed) {
    if (patch[key] !== undefined) update[key] = patch[key];
  }

  const updated = await ShopSettings.findByIdAndUpdate('main', { $set: update }, { new: true, runValidators: true });
  await counterService.syncSequenceWithSettings(updated);
  return updated.toObject();
}

module.exports = { getSettings, updateSettings };
