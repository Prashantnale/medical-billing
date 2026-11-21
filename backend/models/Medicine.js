'use strict';

const mongoose = require('mongoose');

/**
 * Medicine master (product presets for fast billing).
 * Created automatically the first time a product is billed, then offered
 * as a type-ahead selection on the bill form. Not inventory - no stock.
 */
const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    // lowercase unique key so "pan-o" and "PAN-O" are the same medicine
    nameLower: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 140 },
    composition: { type: String, trim: true, maxlength: 200, default: '' },
    hsnCode: { type: String, trim: true, maxlength: 20, default: '' },
    mrp: { type: Number, min: 0, default: 0 },
    rate: { type: Number, min: 0, default: 0 }, // default selling rate, auto-filled on the bill form
    unit: { type: String, trim: true, uppercase: true, maxlength: 20, default: 'TAB' },
    gstRate: { type: Number, min: 0, max: 100, default: 5 },
  },
  { timestamps: true }
);

/** Upsert by lowercase name - the single entry point for saving medicines.
 *  Accepts a bill item ({productName, ...}) or a direct API body ({name, ...}). */
medicineSchema.statics.upsertFromBillItem = async function upsertFromBillItem(item) {
  const name = String(item.productName || item.name || '').trim();
  if (!name) return null;
  return this.findOneAndUpdate(
    { nameLower: name.toLowerCase() },
    {
      $set: {
        name,
        nameLower: name.toLowerCase(),
        composition: String(item.composition || '').trim(),
        hsnCode: String(item.hsnCode || '').trim(),
        mrp: Math.max(0, Number(item.mrp) || 0),
        rate: Math.max(0, Number(item.rate) || 0),
        unit: String(item.unit || 'TAB').trim().toUpperCase() || 'TAB',
        gstRate: Math.min(100, Math.max(0, Number(item.gstRate) || 0)),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const Medicine = mongoose.model('Medicine', medicineSchema);
module.exports = Medicine;
