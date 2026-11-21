'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const cors = require('cors');
const MongoStore = require('connect-mongo');

const env = require('./backend/config/env');
const { mongoose } = require('./backend/config/db');

const pageRoutes = require('./backend/routes/pageRoutes');
const authRoutes = require('./backend/routes/authRoutes');
const billRoutes = require('./backend/routes/billRoutes');
const settingsRoutes = require('./backend/routes/settingsRoutes');
const medicineRoutes = require('./backend/routes/medicineRoutes');

const { attachAuthState } = require('./backend/middleware/auth');
const { sameOriginGuard } = require('./backend/middleware/security');
const { apiLimiter } = require('./backend/middleware/rateLimiters');
const { notFoundHandler, errorHandler } = require('./backend/middleware/errorHandler');

const app = express();
app.disable('x-powered-by');

// ---------- Security headers ----------
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        // 'unsafe-inline' for styles only: pages ship small <style> blocks and
        // the print engine swaps @page rules dynamically. Scripts stay strict.
        'style-src': ["'self'", "'unsafe-inline'"],
        'script-src': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ---------- Compression (gzip) ----------
app.use(compression());

// ---------- Request logging (dev only) ----------
if (env.isDev) {
  const morgan = require('morgan');
  app.use(morgan('tiny', { skip: (req) => req.path.startsWith('/public') }));
}

// ---------- Static assets ----------
app.use(
  express.static(path.join(__dirname, 'public'), {
    etag: true,
    lastModified: true,
    maxAge: env.isProd ? '7d' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

// ---------- View engine ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (env.isProd) app.set('view cache', true);

// ---------- Body parsers (bounded request size) ----------
app.use(express.json({ limit: '300kb' })); // allows settings incl. base64 logo
app.use(express.urlencoded({ extended: false, limit: '300kb' }));

// ---------- CORS (restricted to the configured origin) ----------
if (env.appOrigin) {
  app.use('/api', cors({ origin: env.appOrigin, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
}

// ---------- Sessions ----------
// Sessions live in MongoDB (survive restarts, expire with the TTL index).
// clientPromise defers store creation until the connection is open.
const clientPromise = (async () => {
  const { connectDB } = require('./backend/config/db');
  const conn = await connectDB();
  return conn.getClient();
})();

const sessionParser = session({
  name: 'mb.sid',
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    clientPromise,
    collectionName: 'sessions',
    ttl: env.sessionMaxAgeHours * 3600,
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd, // HTTPS-only cookie in production
    maxAge: env.sessionMaxAgeHours * 3600 * 1000,
    path: '/',
  },
  rolling: false,
});
app.use(sessionParser);

// ---------- Auth state + CSRF-lite origin guard ----------
app.use(attachAuthState);
app.use(sameOriginGuard);

// ---------- Routes ----------
app.use('/', pageRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/bills', apiLimiter, billRoutes);
app.use('/api/settings', apiLimiter, settingsRoutes);
app.use('/api/medicines', apiLimiter, medicineRoutes);

// ---------- 404 + centralized errors ----------
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
