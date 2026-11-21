'use strict';

const Admin = require('../models/Admin');
const { Bill } = require('../models/Bill');
const billService = require('../services/billService');
const settingsService = require('../services/settingsService');
const counterService = require('../services/counterService');
const { asyncHandler, AppError } = require('../utils/errors');

/** Shared context for every rendered page. */
async function viewContext(req, extra = {}) {
  let admin = null;
  if (req.isAuthenticated) {
    admin = await Admin.findById(req.session.adminId).select('name email').lean();
  }
  const settings = await settingsService.getSettings();
  return {
    title: '',
    path: req.path,
    admin,
    businessName: settings.businessName,
    logoDataUrl: settings.logoDataUrl,
    ...extra,
  };
}

const home = (req, res) => {
  if (!req.adminExists) return res.redirect('/register');
  if (!req.isAuthenticated) return res.redirect('/login');
  res.redirect('/dashboard');
};

const registerPage = (req, res) => {
  res.render('pages/register', { title: 'Create Owner Account', path: '/register' });
};

const loginPage = (req, res) => {
  res.render('pages/login', { title: 'Login', path: '/login' });
};

const dashboardPage = asyncHandler(async (req, res) => {
  const [stats, recent, settings] = await Promise.all([
    billService.dashboardStats(),
    billService.recentBills(6),
    settingsService.getSettings(),
  ]);
  const seq = (await counterService.currentSequence()) + 1;
  res.render('pages/dashboard', await viewContext(req, {
    title: 'Dashboard',
    path: '/dashboard',
    stats,
    recent,
    nextInvoiceNumber: counterService.formatInvoiceNumber(settings.invoicePrefix, settings.invoicePadding, seq),
  }));
});

const createBillPage = asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings();
  const seq = (await counterService.currentSequence()) + 1;
  res.render('pages/bill-create', await viewContext(req, {
    title: 'Create New Bill',
    path: '/bills/new',
    settings,
    nextInvoiceNumber: counterService.formatInvoiceNumber(settings.invoicePrefix, settings.invoicePadding, seq),
  }));
});

const billsPage = asyncHandler(async (req, res) => {
  res.render('pages/bills', await viewContext(req, { title: 'Previous Bills', path: '/bills' }));
});

const billViewPage = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id).lean();
  if (!bill) throw new AppError('Bill not found', 404);
  res.render('pages/bill-view', await viewContext(req, { title: `Bill ${bill.invoiceNumber}`, path: '/bills', bill }));
});

const settingsPage = asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings();
  res.render('pages/settings', await viewContext(req, { title: 'Business Settings', path: '/settings', settings }));
});

const medicinesPage = asyncHandler(async (req, res) => {
  res.render('pages/medicines', await viewContext(req, { title: 'Medicines', path: '/medicines' }));
});

module.exports = { home, registerPage, loginPage, dashboardPage, createBillPage, billsPage, billViewPage, medicinesPage, settingsPage };
