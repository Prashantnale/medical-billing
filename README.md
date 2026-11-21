# Medical Billing — Single-User Bill Generation Software

A lightweight, production-ready **GST invoice / billing software** for a single shop owner.
Built with **Node.js + Express.js + MongoDB (Mongoose)** on the backend and
**EJS templates + Tailwind CSS + Vanilla JavaScript (ES6+) + Lucide Icons** on the frontend.
**No React, no Next.js, no frontend framework** — one Express server serves everything.

---

## Features

| Area | Details |
|---|---|
| Single-owner auth | First-launch registration (allowed exactly once, enforced by a DB unique index), bcrypt password hashing, secure HTTP-only session cookies stored in MongoDB, login/logout, change password |
| Dashboard | Today / this-month / all-time sales, bill counts, next invoice number, recent bills |
| Bill creation | Mobile-first item cards, live GST calculation preview, multiple items, per-item %/fixed discount, CGST+SGST or IGST, GST inclusive/exclusive, additional charges, round-off, notes |
| Medicine master | Dedicated **/medicines** page: add/update (upsert by name), edit-fill, delete, live search. Medicines also save automatically the first time they are billed; after that, type the name on the bill form and composition/HSN/MRP/**rate**/unit/GST% auto-fill |
| Calculation engine | Server-authoritative decimal math (Decimal.js), half-up 2-dp rounding, client totals are never trusted |
| Invoice numbering | Atomic MongoDB counter (`findOneAndUpdate` + `$inc`), prefix + zero padding, duplicates impossible via unique index + retry |
| Invoice preview | Professional A4 tax invoice + 80mm thermal receipt templates, A4/80mm toggle, amount in words (Indian system), cancelled watermark |
| Printing | Dedicated print CSS, dynamic `@page` size (A4 / 80mm auto), repeated table headers, no UI elements in print |
| PDF | Server-side PDFKit generation (`GET /api/bills/:id/pdf`, `?download=1` for attachment) |
| Previous bills | Paginated list (20/page), debounced search (invoice no / customer / doctor), date range, status filter, regex-escaped queries, responsive cards on mobile / table on desktop |
| Cancellation | Cancelled bills are preserved with `cancelledAt` + `cancelledReason` audit fields; excluded from sales stats |
| Business settings | Shop identity (name, GSTIN, PAN, drug licence, phone, email), address, invoice prefix/padding/next number, GST defaults, terms, thank-you note, logo (data URL) — every bill stores an immutable seller snapshot |
| Security | Helmet (strict CSP, no CDN needed), CORS allow-list, rate limiting (auth + API), SameSite=Lax sessions, origin-check on mutating requests, express-validator input validation, Mongoose `sanitizeFilter` (NoSQL injection protection), 300 KB request limit, centralized error handling |
| Performance | Gzip compression, static asset caching (7d in production), indexed queries, `.lean()` reads, single aggregation for dashboard stats, no polling, tiny dependency set |

## Pages

`/register` (first launch only) · `/login` · `/dashboard` · `/bills/new` · `/bills` · `/bills/view/:id` · `/settings`
All app pages and APIs are protected after setup.

## Project structure

```
backend/
  config/       env validation, MongoDB connection (memoized, pooled x5)
  models/       Admin, ShopSettings, Bill (snapshot schema), Medicine, Counter
  controllers/  auth, bills, settings, medicines, pages
  routes/       /api/auth, /api/bills, /api/settings, /api/medicines, page routes
  middleware/   auth guards, central error handler, rate limiters, CSRF-lite, validation
  services/     calculationEngine, billService, counterService, settingsService, pdfService
  validators/   express-validator rule sets
  utils/        errors, money (Decimal.js helpers), numberToWords
views/          EJS templates (layouts via partials, A4 + thermal invoice partials)
public/         compiled tailwind.css, print.css, vanilla JS modules, vendored lucide icons
tests/          unit (engine, helpers) + full HTTP integration suite (39 tests)
app.js          Express app wiring
server.js       entry point (graceful shutdown)
scripts/        copy-vendor.js (postinstall)
```

---

## 1. Installation

Requires **Node.js ≥ 18.17** and **MongoDB** (local or Atlas).

```bash
npm install          # installs deps, copies the lucide icon bundle
cp .env.example .env # then edit .env (see below)
```

### Configure `.env`

```ini
PORT=3000
NODE_ENV=development

# MongoDB connection URL (local instance):
MONGODB_URI=mongodb://127.0.0.1:27017/medical-billing
# MongoDB Atlas example:
# MONGODB_URI=mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/medical-billing?retryWrites=true&w=majority

# Generate with:  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
SESSION_SECRET=<long-random-string>
SESSION_MAX_AGE_HOURS=8

# The single allowed origin (no trailing slash)
APP_ORIGIN=http://localhost:3000
```

### Run

```bash
npm run build:css   # compile Tailwind (already committed; needed only after editing styles)
npm start           # production
npm run dev         # development with nodemon
```

Open **http://localhost:3000** → first launch shows **owner registration**.
After registration the setup screen disappears permanently — every later visit shows **login**.

## 2. Testing

The suite needs a MongoDB URL (tests use their own database and wipe only that one):

```bash
# uses MONGODB_URI from the environment, defaults to the test DB below:
NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/medical-billing-test npm test
```

Covers: registration-once + duplicate prevention, login/logout, session guards,
protected pages/APIs, GST math (inclusive/exclusive, CGST/SGST/IGST, discounts,
round-off), atomic invoice numbering, duplicate-invoice prevention, search +
regex-escaping, XSS escaping on rendered pages, PDF generation, cancellation
audit, NoSQL-injection rejection, validation failures.

## 3. Printing

- **A4**: open a bill → *Print* (browser dialog, `@page A4, 8mm margins`).
- **80mm thermal**: toggle *80mm* → *Print* (`@page 80mm auto, 3mm margins`).
- **PDF**: *PDF* button → server-generated PDFKit file (matches the A4 layout).
- Print CSS hides all app chrome; only the chosen invoice template prints.
  Table headers repeat across pages; rows never split mid-line.

## 4. Production deployment

### A. Any VPS (Ubuntu + systemd + Nginx) — recommended

```bash
# 1. Node + MongoDB (or use Atlas URI)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
# install & start mongod, then:

# 2. App
git clone <your-repo> /opt/medical-billing && cd /opt/medical-billing
npm ci --omit=dev
cp .env.example .env   # set NODE_ENV=production, MONGODB_URI, strong SESSION_SECRET, APP_ORIGIN=https://billing.example.com

# 3. systemd unit /etc/systemd/system/billing.service
[Unit]
Description=Medical Billing App
After=network.target mongod.service
[Service]
Type=simple
WorkingDirectory=/opt/medical-billing
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production
User=www-data
[Install]
WantedBy=multi-user.target

sudo systemctl enable --now billing

# 4. Nginx reverse proxy (HTTPS via certbot)
server {
  server_name billing.example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Set `APP_ORIGIN=https://billing.example.com` so cookies become `Secure` (automatic with `NODE_ENV=production`) and CORS/origin checks pass.

### B. Docker (single container + Mongo)

```bash
docker run -d --name billing-mongo -v billing-mongo-data:/data/db mongo:7
docker run -d --name billing -p 3000:3000 --link billing-mongo \
  -e NODE_ENV=production \
  -e MONGODB_URI=mongodb://billing-mongo:27017/medical-billing \
  -e SESSION_SECRET=<long-random> \
  -e APP_ORIGIN=http://localhost:3000 \
  -v /opt/billing:/app -w /app node:20 node server.js
```

### C. Render / Railway / Fly.io

Use the GitHub repo, `npm ci --omit=dev && npm start`, set the env vars in the
dashboard, attach MongoDB Atlas. `APP_ORIGIN` must equal the public URL.

### Production checklist

- [ ] `NODE_ENV=production` (secure cookies, view caching, static caching, no stack traces)
- [ ] Strong 48-byte `SESSION_SECRET`
- [ ] `MONGODB_URI` points to a persistent database with auth enabled
- [ ] `APP_ORIGIN` matches the exact public origin
- [ ] HTTPS termination in front of the app
- [ ] `npm run build:css` executed if styles were modified
- [ ] MongoDB backups scheduled (`mongodump` cron or Atlas backups)

## 5. Daily use notes

- Invoice numbers auto-increment (`PREFIX0001…`); set the next number in
  **Settings → Invoice Numbering** before your first real bill (it can only move forward).
- Old bills keep the seller details they were printed with (snapshot) — changing
  settings never rewrites history.
- Cancelling a bill keeps the record (audit-safe) and removes it from sales totals.
- Logo: upload a PNG/JPG under 150 KB in Settings; it appears on invoices, PDFs and receipts.
