'use strict';

const { Bill } = require('../models/Bill');
const ShopSettings = require('../models/ShopSettings');
const Medicine = require('../models/Medicine');
const { calculateBill } = require('./calculationEngine');
const counterService = require('./counterService');
const { AppError } = require('../utils/errors');

/** Build the immutable seller snapshot from current shop settings. */
function sellerSnapshot(settings) {
  const a = settings.address || {};
  const addressLines = [a.addressLine1, a.addressLine2, [a.city, a.state, a.pincode].filter(Boolean).join(' - ')]
    .map((l) => (l || '').trim())
    .filter(Boolean);
  return {
    businessName: settings.businessName || '',
    addressText: addressLines.join('\n'),
    gstin: settings.gstin || '',
    pan: settings.pan || '',
    drugLicenseNo: settings.drugLicenseNo || '',
    phone: settings.phone || '',
    email: settings.email || '',
    stateCode: a.stateCode || '',
    logoDataUrl: settings.logoDataUrl || '',
  };
}

/**
 * Create a finalized bill:
 * 1. recalculate every value server-side (never trust client totals)
 * 2. snapshot seller details from settings
 * 3. reserve an invoice number atomically; retry on unique-key clash
 * @param {object} payload bill input
 * @param {string} [userName] display name of the logged-in owner
 */
async function createBill(payload, userName = '') {
  const settings = await ShopSettings.getSingleton();
  const calculated = calculateBill(payload);

  const invoiceDate = payload.invoiceDate ? new Date(payload.invoiceDate) : new Date();
  if (Number.isNaN(invoiceDate.getTime())) throw new AppError('Invalid invoice date', 422);

  const billData = {
    invoiceDate,
    invoiceTime: payload.invoiceTime || new Date().toTimeString().slice(0, 5),
    invoiceType: payload.invoiceType || 'Tax Invoice',
    paymentMode: payload.paymentMode || 'Cash',
    taxMode: calculated.taxMode,
    taxSplit: calculated.taxSplit,
    userName: String(userName || '').trim(),
    seller: sellerSnapshot(settings),
    customer: {
      name: String(payload.customer?.name || '').trim(),
      address: String(payload.customer?.address || '').trim(),
      gstin: String(payload.customer?.gstin || '').trim().toUpperCase(),
      phone: String(payload.customer?.phone || '').trim(),
      doctorName: String(payload.customer?.doctorName || '').trim(),
      stateCode: String(payload.customer?.stateCode || '').trim().toUpperCase(),
    },
    items: calculated.items,
    charges: calculated.charges,
    roundOffEnabled: payload.roundOffEnabled !== false,
    summary: calculated.summary,
    notes: String(payload.notes || '').trim(),
    termsText: settings.termsText || '',
  };

  if (!billData.customer.name) throw new AppError('Customer / party name is required', 422);

  // Reserve number + save. A unique-index clash (should not happen with the
  // atomic counter, but possible if the counter was reset) triggers a retry.
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const seq = await counterService.nextSequence();
    const invoiceNumber = counterService.formatInvoiceNumber(
      settings.invoicePrefix,
      settings.invoicePadding,
      seq
    );
    try {
      const bill = await Bill.create({ ...billData, invoiceNumber });
      // keep the medicine master current so every product is re-selectable
      for (const item of calculated.items) {
        try {
          await Medicine.upsertFromBillItem(item);
        } catch (medErr) {
          console.error('[medicine] auto-save failed:', medErr.message); // never block billing
        }
      }
      return bill;
    } catch (err) {
      if (err.code === 11000 && err.keyPattern && err.keyPattern.invoiceNumber) {
        lastError = err;
        continue; // sequence collided -> reserve the next number
      }
      throw err;
    }
  }
  throw new AppError('Could not assign a unique invoice number. Please try again.', 500, { cause: lastError });
}

/**
 * Paginated + filtered bill list for the Previous Bills screen.
 * Uses .lean() and covered indexes; caps page size.
 */
async function listBills({ page = 1, limit = 20, q = '', from = '', to = '', status = 'all' }) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

  const filter = {};
  if (status === 'active' || status === 'cancelled') filter.status = status;

  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    filter.$or = [{ invoiceNumber: rx }, { 'customer.name': rx }, { 'customer.doctorName': rx }];
  }

  if (from || to) {
    filter.invoiceDate = {};
    if (from) {
      const d = new Date(`${from}T00:00:00`);
      if (Number.isNaN(d.getTime())) throw new AppError('Invalid "from" date', 422);
      filter.invoiceDate.$gte = d;
    }
    if (to) {
      const d = new Date(`${to}T23:59:59.999`);
      if (Number.isNaN(d.getTime())) throw new AppError('Invalid "to" date', 422);
      filter.invoiceDate.$lte = d;
    }
  }

  const [items, total] = await Promise.all([
    Bill.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .select('invoiceNumber invoiceDate invoiceTime customer.name summary.netAmount summary.totalTaxable status createdAt')
      .lean(),
    Bill.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page: pageNum,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    limit: pageSize,
  };
}

/** Dashboard stats in a single aggregation round-trip. */
async function dashboardStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

  const stats = await Bill.aggregate([
    { $match: { status: 'active' } },
    {
      $facet: {
        today: [{ $match: { createdAt: { $gte: startOfToday } } },
          { $group: { _id: null, total: { $sum: '$summary.netAmount' }, count: { $sum: 1 } } }],
        month: [{ $match: { createdAt: { $gte: startOfMonth } } },
          { $group: { _id: null, total: { $sum: '$summary.netAmount' }, count: { $sum: 1 } } }],
        allTime: [{ $group: { _id: null, total: { $sum: '$summary.netAmount' }, count: { $sum: 1 } } }],
      },
    },
  ]);

  const pick = (arr) => (arr[0] ? { total: Math.round(arr[0].total * 100) / 100, count: arr[0].count } : { total: 0, count: 0 });
  const f = stats[0] || {};
  return { today: pick(f.today || []), month: pick(f.month || []), allTime: pick(f.allTime || []) };
}

/** Recent bills for the dashboard (active first, newest first). */
async function recentBills(limit = 6) {
  return Bill.find({ status: 'active' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('invoiceNumber invoiceDate customer.name summary.netAmount status createdAt')
    .lean();
}

/** Cancel a bill (preserved record + audit trail, never deleted). */
async function cancelBill(billId, reason) {
  const bill = await Bill.findById(billId);
  if (!bill) throw new AppError('Bill not found', 404);
  if (bill.status === 'cancelled') throw new AppError('Bill is already cancelled', 409);

  bill.status = 'cancelled';
  bill.cancelledAt = new Date();
  bill.cancelledReason = String(reason || '').trim().slice(0, 200);
  await bill.save();
  return bill;
}

module.exports = { createBill, listBills, dashboardStats, recentBills, cancelBill, sellerSnapshot };
