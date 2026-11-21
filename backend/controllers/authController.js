'use strict';

const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const { asyncHandler, AppError } = require('../utils/errors');

const BCRYPT_ROUNDS = 10;

/** One-time owner registration. Guarded at route level (setup mode) AND here. */
const register = asyncHandler(async (req, res) => {
  const exists = (await Admin.estimatedDocumentCount()) > 0;
  if (exists) throw new AppError('Admin account already exists. Registration is permanently closed.', 403);

  const { name, email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  let admin;
  try {
    admin = await Admin.create({ name, email, passwordHash });
  } catch (err) {
    // The unique singleton index is the final backend-level guarantee.
    if (err.code === 11000) throw new AppError('Admin account already exists. Registration is permanently closed.', 403);
    throw err;
  }

  // Cache for the auth-state middleware
  req.app.set('adminExists', true);

  // Log the owner straight in (fresh session to prevent fixation)
  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.adminId = admin._id.toString();
  await new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  res.status(201).json({ message: 'Registration complete. Welcome!', admin: admin.toSafeJSON() });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email }).select('+passwordHash');
  const ok = admin && (await bcrypt.compare(password, admin.passwordHash));
  if (!ok) throw new AppError('Invalid email or password', 401);

  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.adminId = admin._id.toString();
  admin.lastLoginAt = new Date();
  await admin.save();
  await new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  res.json({ message: 'Logged in', admin: admin.toSafeJSON() });
});

const logout = asyncHandler(async (req, res) => {
  await new Promise((resolve) => {
    req.session.destroy(() => resolve());
  });
  res.clearCookie('connect.sid', { path: '/' });
  res.json({ message: 'Logged out' });
});

const status = (req, res) => {
  res.json({
    adminExists: req.adminExists,
    authenticated: req.isAuthenticated,
    admin: req.isAuthenticated && req.session.admin ? req.session.admin : null,
  });
};

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = await Admin.findById(req.session.adminId).select('+passwordHash');
  if (!admin) throw new AppError('Admin not found', 404);

  const ok = await bcrypt.compare(currentPassword, admin.passwordHash);
  if (!ok) throw new AppError('Current password is incorrect', 401);

  admin.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await admin.save();
  res.json({ message: 'Password updated' });
});

module.exports = { register, login, logout, status, changePassword };
