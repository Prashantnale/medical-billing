'use strict';

const mongoose = require('mongoose');

const UNITS = ['Strip', 'Tablet', 'Capsule', 'Bottle', 'Box', 'Vial', 'Syrup', 'Tube', 'Sachet', 'Piece', 'Unit'];

const itemSchema = new mongoose.Schema(
  {
    productName: { type: String, required: true, trim: true, maxlength: 140 },
    composition: { type: String, trim: true, maxlength: 200, default: '' },
    hsnCode: { type: String, trim: true, maxlength: 20, default: '' },
    batchNumber: { type: String, trim: true, maxlength: 40, default: '' },
    expiryDate: { type: String, trim: true, maxlength: 10, default: '' }, // stored as MM/YY
    unit: { type: String, trim: true, maxlength: 20, default: 'Unit' },
    mrp: { type: Number, min: 0, default: 0 },
    quantity: { type: Number, required: true, min: 0.001, max: 1000000 },
    rate: { type: Number, required: true, min: 0 },
    discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
    discountValue: { type: Number, min: 0, default: 0 },
    gstRate: { type: Number, min: 0, max: 100, default: 0 },
    // Computed server-side (never trusted from the client)
    taxableAmount: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    lineTotal: { type: Number, default: 0 },
  },
  { _id: false }
);

const sellerSnapshotSchema = new mongoose.Schema(
  {
    businessName: { type: String, default: '' },
    addressText: { type: String, default: '' }, // pre-joined single/multi-line address
    gstin: { type: String, default: '' },
    pan: { type: String, default: '' },
    drugLicenseNo: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    stateCode: { type: String, default: '' },
    logoDataUrl: { type: String, default: '' },
  },
  { _id: false }
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    address: { type: String, trim: true, maxlength: 300, default: '' },
    gstin: { type: String, trim: true, uppercase: true, maxlength: 15, default: '' },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    doctorName: { type: String, trim: true, maxlength: 120, default: '' },
    stateCode: { type: String, trim: true, uppercase: true, maxlength: 2, default: '' },
  },
  { _id: false }
);

const chargeSchema = new mongoose.Schema(
  { label: { type: String, trim: true, maxlength: 60 }, amount: { type: Number, default: 0 } },
  { _id: false }
);

const summarySchema = new mongoose.Schema(
  {
    totalQuantity: { type: Number, default: 0 },
    grossAmount: { type: Number, default: 0 }, // sum(qty*rate) before discount
    totalDiscount: { type: Number, default: 0 },
    totalTaxable: { type: Number, default: 0 },
    totalCgst: { type: Number, default: 0 },
    totalSgst: { type: Number, default: 0 },
    totalIgst: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    additionalCharges: { type: Number, default: 0 },
    subTotal: { type: Number, default: 0 }, // before round off
    roundOff: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    amountInWords: { type: String, default: '' },
  },
  { _id: false }
);

const billSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, trim: true },
    invoiceDate: { type: Date, required: true }, // date only (time midnight)
    invoiceTime: { type: String, required: true, match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time (HH:mm)'] },
    invoiceType: {
      type: String,
      enum: ['Tax Invoice', 'Retail Invoice', 'GST Invoice', 'Bill of Supply', 'Credit Invoice'],
      default: 'Tax Invoice',
    },
    paymentMode: { type: String, enum: ['Cash', 'UPI', 'Card', 'Cheque', 'Credit'], default: 'Cash' },
    taxMode: { type: String, enum: ['inclusive', 'exclusive'], required: true },
    taxSplit: { type: String, enum: ['cgst_sgst', 'igst'], required: true },
    status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
    // name of the logged-in owner who created the bill ("User : MAIN" line)
    userName: { type: String, trim: true, maxlength: 80, default: '' },

    // Immutable snapshots
    seller: { type: sellerSnapshotSchema, required: true },
    customer: { type: customerSchema, required: true },
    items: { type: [itemSchema], required: true },

    // Additional charges (packing/delivery etc.)
    charges: { type: [chargeSchema], default: [] },
    roundOffEnabled: { type: Boolean, default: true },

    summary: { type: summarySchema, required: true },
    notes: { type: String, trim: true, maxlength: 300, default: '' },
    termsText: { type: String, maxlength: 500, default: '' },

    // Cancellation audit
    cancelledAt: { type: Date },
    cancelledReason: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true }
);

// Search / list indexes (single-user volume, but indexed keeps queries covered)
billSchema.index({ invoiceDate: -1 });
billSchema.index({ createdAt: -1 });
billSchema.index({ 'customer.name': 1 });
billSchema.index({ status: 1, createdAt: -1 });

const Bill = mongoose.model('Bill', billSchema);
module.exports = { Bill, UNITS };
