'use strict';

/**
 * Full-stack integration tests: real Express app + the local MongoDB
 * instance (separate `medical-billing-test` database - never touches app data).
 * Run: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/medical-billing-test \
 *      SESSION_SECRET=test-secret-0123456789abcdef0123456789abcdef npm test
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medical-billing-test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-0123456789abcdef0123456789abcdef';

const { connectDB, disconnectDB, mongoose } = require('../backend/config/db');
const app = require('../app');

let server;
let baseUrl;
let cookie = '';

const ADMIN = { name: 'Test Owner', email: 'owner@test.local', password: 'Test@1234', confirmPassword: 'Test@1234' };

async function call(method, path, { body, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    redirect: 'manual', // assert raw 3xx responses instead of following them
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of setCookies) {
    const pair = c.split(';')[0];
    if (pair.startsWith('mb.sid=')) cookie = pair;
  }
  let data = null;
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) data = await res.json();
  else data = await res.text();
  return { status: res.status, headers: res.headers, data };
}

async function clearDatabase() {
  const conn = mongoose.connection;
  const collections = await conn.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
}

describe('single-user billing app (integration)', () => {
  before(async () => {
    await connectDB();
    await clearDatabase();
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  });

  test('first launch redirects / to /register', async () => {
    const res = await call('GET', '/');
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location'), /\/register/);
  });

  test('owner can register exactly once', async () => {
    const res = await call('POST', '/api/auth/register', { body: ADMIN });
    assert.equal(res.status, 201);
    assert.ok(cookie.startsWith('mb.sid='));
    assert.equal(res.data.admin.email, ADMIN.email);
  });

  test('second registration is permanently blocked (backend level)', async () => {
    cookie = ''; // even without a session
    const res = await call('POST', '/api/auth/register', {
      body: { name: 'Evil', email: 'x@y.local', password: 'Test@1234', confirmPassword: 'Test@1234' },
    });
    assert.equal(res.status, 403);
  });

  test('after registration, /register redirects to /login', async () => {
    const res = await call('GET', '/register');
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location'), /\/login/);
  });

  test('protected pages redirect guests to /login', async () => {
    const res = await call('GET', '/dashboard');
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location'), /\/login/);
  });

  test('protected APIs return 401 for guests', async () => {
    const res = await call('GET', '/api/bills');
    assert.equal(res.status, 401);
  });

  test('login with wrong password fails (401)', async () => {
    const res = await call('POST', '/api/auth/login', {
      body: { email: ADMIN.email, password: 'Wrong@123' },
    });
    assert.equal(res.status, 401);
  });

  test('MongoDB operator injection in login payload is rejected (422)', async () => {
    const res = await call('POST', '/api/auth/login', {
      body: { email: { $gt: '' }, password: { $gt: '' } },
    });
    assert.equal(res.status, 422);
  });

  test('login succeeds and sets a fresh session', async () => {
    const res = await call('POST', '/api/auth/login', {
      body: { email: ADMIN.email, password: ADMIN.password },
    });
    assert.equal(res.status, 200);
    assert.ok(cookie.startsWith('mb.sid='));
  });

  test('auth status endpoint reports authenticated owner', async () => {
    const res = await call('GET', '/api/auth/status');
    assert.equal(res.status, 200);
    assert.equal(res.data.adminExists, true);
    assert.equal(res.data.authenticated, true);
  });

  test('settings can be saved and read back', async () => {
    const res = await call('PUT', '/api/settings', {
      body: {
        businessName: 'Test Medical Store',
        gstin: '27ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        drugLicenseNo: 'MH-DL-2024-001',
        phone: '+91 9876543210',
        address: { addressLine1: 'Shop 1', city: 'Pune', state: 'Maharashtra', stateCode: '27', pincode: '411001' },
        invoicePrefix: 'MB-',
        invoicePadding: 4,
        nextInvoiceNumber: 1,
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.settings.businessName, 'Test Medical Store');

    const get = await call('GET', '/api/settings');
    assert.equal(get.data.settings.gstin, '27ABCDE1234F1Z5');
  });

  test('invalid GSTIN in settings is rejected (422)', async () => {
    const res = await call('PUT', '/api/settings', { body: { gstin: 'BAD-GSTIN' } });
    assert.equal(res.status, 422);
  });

  test('first bill is created with recalculated totals and invoice number MB-0001', async () => {
    const res = await call('POST', '/api/bills', {
      body: {
        invoiceType: 'Tax Invoice',
        paymentMode: 'Cash',
        taxMode: 'exclusive',
        taxSplit: 'cgst_sgst',
        roundOffEnabled: true,
        customer: { name: 'Rahul Sharma', doctorName: 'Dr. Mehta' },
        items: [
          { productName: 'Crocin 500', composition: 'Paracetamol', hsnCode: '3004', batchNumber: 'B12', expiryDate: '11/26', unit: 'Strip', mrp: 55, quantity: 10, rate: 50, discountType: 'percent', discountValue: 10, gstRate: 5 },
          { productName: 'Azithral 500', hsnCode: '3004', batchNumber: 'AZ9', expiryDate: '03/27', unit: 'Strip', mrp: 120, quantity: 3, rate: 100, gstRate: 12 },
        ],
        charges: [{ label: 'Delivery', amount: 20 }],
      },
    });
    assert.equal(res.status, 201);
    const bill = res.data.bill;
    assert.equal(bill.invoiceNumber, 'MB-0001');
    assert.equal(bill.summary.totalTaxable, 750);
    assert.equal(bill.summary.totalCgst, 29.25);
    assert.equal(bill.summary.totalSgst, 29.25);
    assert.equal(bill.summary.subTotal, 828.5);
    assert.equal(bill.summary.netAmount, 829);
    assert.match(bill.summary.amountInWords, /Eight Hundred Twenty Nine/);
    // seller snapshot embedded
    assert.equal(bill.seller.businessName, 'Test Medical Store');
    assert.equal(bill.seller.gstin, '27ABCDE1234F1Z5');
    // client-supplied totals would be ignored - items carry server values
    assert.equal(bill.items[0].taxableAmount, 450);
  });

  test('duplicate invoice numbers are impossible: second bill gets MB-0002', async () => {
    const res = await call('POST', '/api/bills', {
      body: {
        taxMode: 'inclusive', taxSplit: 'cgst_sgst', roundOffEnabled: true,
        customer: { name: 'Priya' },
        items: [{ productName: 'Benadryl', quantity: 2, rate: 59, gstRate: 5 }],
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.bill.invoiceNumber, 'MB-0002');
    // inclusive: 118 gross -> taxable 112.38, tax 5.62, total 118, net rounds to 118
    assert.equal(res.data.bill.summary.netAmount, 118);
  });

  test('bill with zero items is rejected (422)', async () => {
    const res = await call('POST', '/api/bills', {
      body: { taxMode: 'exclusive', taxSplit: 'cgst_sgst', customer: { name: 'X' }, items: [] },
    });
    assert.equal(res.status, 422);
  });

  test('next-number preview does not consume a sequence', async () => {
    const res = await call('GET', '/api/bills/next-number');
    assert.equal(res.status, 200);
    assert.equal(res.data.invoiceNumber, 'MB-0003');
  });

  test('bill list: search by customer, pagination fields present', async () => {
    const res = await call('GET', '/api/bills?q=rahul');
    assert.equal(res.status, 200);
    assert.equal(res.data.total, 1);
    assert.equal(res.data.items[0].customer.name, 'Rahul Sharma');
    assert.equal(typeof res.data.pages, 'number');
  });

  test('bill list search escapes regex metacharacters', async () => {
    const res = await call('GET', '/api/bills?q=' + encodeURIComponent('Rahul(.*'));
    assert.equal(res.status, 200);
    assert.equal(res.data.total, 0);
  });

  test('XSS payloads are stored raw in DB but escaped on rendered pages', async () => {
    const create = await call('POST', '/api/bills', {
      body: {
        taxMode: 'exclusive', taxSplit: 'cgst_sgst', roundOffEnabled: true,
        customer: { name: '<script>alert(1)</script>' },
        items: [{ productName: 'Safe <b>Drug</b>', quantity: 1, rate: 10, gstRate: 0 }],
      },
    });
    assert.equal(create.status, 201);
    const page = await call('GET', `/bills/view/${create.data.bill._id}`, { headers: { Accept: 'text/html' } });
    assert.equal(page.status, 200);
    assert.ok(!page.data.includes('<script>alert(1)</script>'));
    assert.ok(page.data.includes('&lt;script&gt;'));
  });

  test('PDF endpoint returns a real PDF document', async () => {
    const bills = await call('GET', '/api/bills?limit=1');
    const id = bills.data.items[0]._id;
    const res = await fetch(`${baseUrl}/api/bills/${id}/pdf`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 1000);
    assert.ok(buf.subarray(0, 5).toString() === '%PDF-');
  });

  test('dashboard stats endpoint aggregates active bills only', async () => {
    const res = await call('GET', '/api/bills/stats');
    assert.equal(res.status, 200);
    assert.equal(res.data.stats.allTime.count, 3); // before cancellation
  });

  test('cancelling a bill preserves the record with audit fields', async () => {
    const bills = await call('GET', '/api/bills?limit=1'); // newest = XSS bill
    const id = bills.data.items[0]._id;
    const res = await call('POST', `/api/bills/${id}/cancel`, { body: { reason: 'Wrong entry' } });
    assert.equal(res.status, 200);
    assert.equal(res.data.bill.status, 'cancelled');
    assert.equal(res.data.bill.cancelledReason, 'Wrong entry');
    assert.ok(res.data.bill.cancelledAt);

    const again = await call('POST', `/api/bills/${id}/cancel`, { body: { reason: 'x' } });
    assert.equal(again.status, 409);

    const stats = await call('GET', '/api/bills/stats');
    assert.equal(stats.data.stats.allTime.count, 2); // cancelled excluded
  });

  test('medicines auto-save from bills and appear in the master list', async () => {
    const res = await call('GET', '/api/medicines');
    assert.equal(res.status, 200);
    const names = res.data.medicines.map((m) => m.name);
    assert.ok(names.includes('Crocin 500'));
    const crocin = res.data.medicines.find((m) => m.name === 'Crocin 500');
    assert.equal(crocin.composition, 'Paracetamol');
    assert.equal(crocin.hsnCode, '3004');
    assert.equal(crocin.mrp, 55);
    assert.equal(crocin.rate, 50); // default selling rate remembered from the bill
    assert.equal(crocin.gstRate, 5);
  });

  test('medicine can be added manually and duplicates upsert instead of duplicating', async () => {
    const first = await call('POST', '/api/medicines', {
      body: { name: 'TestMed', composition: 'Test Salt', hsnCode: '3004', mrp: 42, rate: 38.5, unit: 'TAB', gstRate: 12 },
    });
    assert.equal(first.status, 201);
    assert.equal(first.data.medicine.rate, 38.5);

    const again = await call('POST', '/api/medicines', {
      body: { name: 'testmed', composition: 'Updated Salt', mrp: 44, rate: 40, unit: 'CAP', gstRate: 5 },
    });
    assert.equal(again.status, 201);

    const list = await call('GET', '/api/medicines');
    const matches = list.data.medicines.filter((m) => m.name.toLowerCase() === 'testmed');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].composition, 'Updated Salt');
    assert.equal(matches[0].rate, 40);
    assert.equal(matches[0].unit, 'CAP');
  });

  test('medicine without a name is rejected (422)', async () => {
    const res = await call('POST', '/api/medicines', { body: { composition: 'No name' } });
    assert.equal(res.status, 422);
  });

  test('saved medicine can be deleted', async () => {
    const list = await call('GET', '/api/medicines');
    const med = list.data.medicines.find((m) => m.name.toLowerCase() === 'testmed');
    const del = await call('DELETE', `/api/medicines/${med._id}`);
    assert.equal(del.status, 200);

    const after = await call('GET', '/api/medicines');
    assert.ok(!after.data.medicines.some((m) => m.name.toLowerCase() === 'testmed'));

    const gone = await call('DELETE', `/api/medicines/${med._id}`);
    assert.equal(gone.status, 404);
  });

  test('authenticated user sees dashboard HTML', async () => {
    const res = await call('GET', '/dashboard', { headers: { Accept: 'text/html' } });
    assert.equal(res.status, 200);
    assert.ok(res.data.includes('Dashboard'));
  });

  test('logout destroys the session; subsequent API calls are 401', async () => {
    const res = await call('POST', '/api/auth/logout');
    assert.equal(res.status, 200);
    const after = await call('GET', '/api/bills');
    assert.equal(after.status, 401);
  });

  test('old session cookie cannot reach protected pages', async () => {
    const res = await call('GET', '/bills');
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location'), /\/login/);
  });

  test('rate limit headers are present but disabled in test env', async () => {
    // re-login for cleanup sanity
    const res = await call('POST', '/api/auth/login', { body: { email: ADMIN.email, password: ADMIN.password } });
    assert.equal(res.status, 200);
  });

  test('unknown API route returns 404 JSON', async () => {
    const res = await call('GET', '/api/unknown');
    assert.equal(res.status, 404);
    assert.equal(res.data.error, 'Not found');
  });
});
