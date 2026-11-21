'use strict';

const { Bill } = require('../models/Bill');
const Admin = require('../models/Admin');
const billService = require('../services/billService');
const settingsService = require('../services/settingsService');
const counterService = require('../services/counterService');
const pdfService = require('../services/pdfService');
const { asyncHandler, AppError } = require('../utils/errors');

/** POST /api/bills - create a finalized bill (totals recomputed server-side). */
const create = asyncHandler(async (req, res) => {
  let userName = '';
  if (req.session.adminId) {
    const admin = await Admin.findById(req.session.adminId).select('name').lean();
    userName = admin ? admin.name : '';
  }
  const bill = await billService.createBill(req.body, userName);
  res.status(201).json({ message: `Bill ${bill.invoiceNumber} created`, bill });
});

/** GET /api/bills - paginated, searchable list. */
const list = asyncHandler(async (req, res) => {
  const { page, limit, q, from, to, status } = req.query;
  const result = await billService.listBills({
    page: parseInt(page, 10) || 1,
    limit: parseInt(limit, 10) || 20,
    q: String(q || '').slice(0, 60),
    from: String(from || ''),
    to: String(to || ''),
    status: String(status || 'all'),
  });
  res.json(result);
});

/** GET /api/bills/next-number - preview of the next invoice number (no increment). */
const nextNumber = asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings();
  const seq = (await counterService.currentSequence()) + 1;
  res.json({
    invoiceNumber: counterService.formatInvoiceNumber(settings.invoicePrefix, settings.invoicePadding, seq),
  });
});

/** GET /api/bills/stats - dashboard numbers. */
const stats = asyncHandler(async (req, res) => {
  const [stat, recent] = await Promise.all([billService.dashboardStats(), billService.recentBills(6)]);
  res.json({ stats: stat, recent });
});

/** GET /api/bills/:id - full bill document. */
const getById = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id).lean();
  if (!bill) throw new AppError('Bill not found', 404);
  res.json({ bill });
});

/** POST /api/bills/:id/cancel - cancel with audit info (record preserved). */
const cancel = asyncHandler(async (req, res) => {
  const bill = await billService.cancelBill(req.params.id, req.body.reason);
  res.json({ message: `Bill ${bill.invoiceNumber} cancelled`, bill });
});

/** GET /api/bills/:id/pdf - server-generated A4 PDF (inline or download). */
const pdf = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id).lean();
  if (!bill) throw new AppError('Bill not found', 404);

  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  const filename = `${bill.invoiceNumber.replace(/[^\w.-]+/g, '_')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);

  const doc = pdfService.buildInvoicePdf(bill);
  doc.pipe(res);
  doc.on('end', () => res.end());
  req.on('close', () => doc.destroy?.());
});

module.exports = { create, list, nextNumber, stats, getById, cancel, pdf };
