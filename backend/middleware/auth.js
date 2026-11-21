'use strict';

const Admin = require('../models/Admin');

/**
 * Load lightweight auth state for every request: does an admin exist,
 * and is the current session authenticated?
 */
async function attachAuthState(req, _res, next) {
  req.adminExists = req.app.get('adminExists') ?? (await Admin.estimatedDocumentCount()) > 0;
  req.isAuthenticated = Boolean(req.session && req.session.adminId);
  next();
}

/** Page guard: redirect guests to /login (or /register on first launch). */
function requireAuthPage(req, res, next) {
  if (!req.adminExists) return res.redirect('/register');
  if (!req.isAuthenticated) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

/** API guard: 401 JSON for unauthenticated calls. */
function requireAuthApi(req, res, next) {
  if (!req.adminExists) return res.status(503).json({ error: 'Setup not completed. Register the admin account first.' });
  if (!req.isAuthenticated) return res.status(401).json({ error: 'Authentication required' });
  next();
}

/** Only while no admin exists: the one-time registration screen. */
function requireSetupMode(req, res, next) {
  if (req.adminExists) return res.redirect('/login');
  next();
}

/** API version of the setup-mode guard. */
function requireSetupModeApi(req, res, next) {
  if (req.adminExists) return res.status(403).json({ error: 'Admin account already exists. Registration is permanently closed.' });
  next();
}

module.exports = { attachAuthState, requireAuthPage, requireAuthApi, requireSetupMode, requireSetupModeApi };
