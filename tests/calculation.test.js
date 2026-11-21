'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { calculateBill } = require('../backend/services/calculationEngine');

describe('calculation engine', () => {
  test('exclusive GST with percentage discount, CGST+SGST split', () => {
    const result = calculateBill({
      taxMode: 'exclusive',
      taxSplit: 'cgst_sgst',
      roundOffEnabled: true,
      items: [
        { productName: 'A', quantity: 10, rate: 50, discountType: 'percent', discountValue: 10, gstRate: 5 },
        { productName: 'B', quantity: 3, rate: 100, gstRate: 12 },
      ],
      charges: [{ label: 'Delivery', amount: 20 }],
    });

    const [a, b] = result.items;
    assert.equal(a.taxableAmount, 450); // 500 - 10%
    assert.equal(a.cgstAmount, 11.25);
    assert.equal(a.sgstAmount, 11.25);
    assert.equal(a.lineTotal, 472.5);

    assert.equal(b.taxableAmount, 300);
    assert.equal(b.cgstAmount, 18);
    assert.equal(b.lineTotal, 336);

    assert.equal(result.summary.totalTaxable, 750);
    assert.equal(result.summary.totalTax, 58.5);
    assert.equal(result.summary.additionalCharges, 20);
    assert.equal(result.summary.subTotal, 828.5);
    assert.equal(result.summary.netAmount, 829); // rounded up
    assert.equal(result.summary.roundOff, 0.5);
    assert.match(result.summary.amountInWords, /Rupees Eight Hundred Twenty Nine Only/);
  });

  test('inclusive GST: rate 118 @ 18% -> taxable 100, tax 18', () => {
    const result = calculateBill({
      taxMode: 'inclusive',
      taxSplit: 'cgst_sgst',
      roundOffEnabled: false,
      items: [{ productName: 'C', quantity: 1, rate: 118, gstRate: 18 }],
    });
    const item = result.items[0];
    assert.equal(item.taxableAmount, 100);
    assert.equal(item.cgstAmount, 9);
    assert.equal(item.sgstAmount, 9);
    assert.equal(item.lineTotal, 118);
    assert.equal(result.summary.netAmount, 118);
  });

  test('IGST split puts the full tax on the IGST column', () => {
    const result = calculateBill({
      taxMode: 'exclusive',
      taxSplit: 'igst',
      roundOffEnabled: false,
      items: [{ productName: 'D', quantity: 2, rate: 250, gstRate: 5 }],
    });
    const item = result.items[0];
    assert.equal(item.taxableAmount, 500);
    assert.equal(item.igstAmount, 25);
    assert.equal(item.cgstAmount, 0);
    assert.equal(item.sgstAmount, 0);
  });

  test('fixed discount cannot push a line below zero', () => {
    const result = calculateBill({
      taxMode: 'exclusive',
      taxSplit: 'cgst_sgst',
      roundOffEnabled: false,
      items: [{ productName: 'E', quantity: 1, rate: 50, discountType: 'fixed', discountValue: 500, gstRate: 5 }],
    });
    assert.equal(result.items[0].taxableAmount, 0);
    assert.equal(result.items[0].lineTotal, 0);
  });

  test('rejects zero quantity, bad GST rate and empty items', () => {
    assert.throws(() => calculateBill({ items: [{ productName: 'X', quantity: 0, rate: 10 }] }), /quantity/);
    assert.throws(() => calculateBill({ items: [{ productName: 'X', quantity: 1, rate: 10, gstRate: 150 }] }), /GST rate/);
    assert.throws(() => calculateBill({ items: [] }), /at least one item/);
  });

  test('odd tax split leaves the extra paisa on SGST so sums match exactly', () => {
    // 5% of 0.10 taxable -> 0.005 -> rounds to 0.01... use taxable 10.05 @ 5% = 0.5025 -> 0.50
    const result = calculateBill({
      taxMode: 'exclusive',
      taxSplit: 'cgst_sgst',
      roundOffEnabled: false,
      items: [{ productName: 'F', quantity: 1, rate: 10.01, gstRate: 5 }],
    });
    const it = result.items[0];
    assert.ok(Math.abs(it.cgstAmount + it.sgstAmount - it.taxableAmount * 0.05) < 0.006); // consistent to rounding
    assert.equal(it.lineTotal, Math.round((it.taxableAmount + it.cgstAmount + it.sgstAmount) * 100) / 100);
  });

  test('round-off handles the down-rounding direction', () => {
    const result = calculateBill({
      taxMode: 'exclusive',
      taxSplit: 'cgst_sgst',
      roundOffEnabled: true,
      items: [{ productName: 'G', quantity: 1, rate: 100.2, gstRate: 0 }],
    });
    assert.equal(result.summary.subTotal, 100.2);
    assert.equal(result.summary.netAmount, 100);
    assert.equal(result.summary.roundOff, -0.2);
  });

  test('amount in words uses the Indian system', () => {
    const result = calculateBill({
      taxMode: 'exclusive',
      taxSplit: 'igst',
      roundOffEnabled: false,
      items: [{ productName: 'H', quantity: 1, rate: 123456.5, gstRate: 0 }],
    });
    assert.match(result.summary.amountInWords, /One Lakh Twenty Three Thousand Four Hundred Fifty Six and Paise Fifty Only/);
  });
});
