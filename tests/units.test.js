'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { amountToWords, integerToIndianWords } = require('../backend/utils/numberToWords');
const { formatINR } = require('../backend/utils/money');
const { formatInvoiceNumber } = require('../backend/services/counterService');

test('integerToIndianWords basics', () => {
  assert.equal(integerToIndianWords(0), 'Zero');
  assert.equal(integerToIndianWords(5), 'Five');
  assert.equal(integerToIndianWords(21), 'Twenty One');
  assert.equal(integerToIndianWords(100), 'One Hundred');
  assert.equal(integerToIndianWords(1000), 'One Thousand');
  assert.equal(integerToIndianWords(100000), 'One Lakh');
  assert.equal(integerToIndianWords(10000000), 'One Crore');
  assert.equal(integerToIndianWords(123456789), 'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine');
});

test('amountToWords with paise', () => {
  assert.equal(amountToWords(1.5), 'Rupees One and Paise Fifty Only');
  assert.equal(amountToWords(829), 'Rupees Eight Hundred Twenty Nine Only');
  assert.equal(amountToWords(0), 'Rupees Zero Only');
  assert.equal(amountToWords(-10), 'Minus Rupees Ten Only');
  assert.equal(amountToWords(99.99), 'Rupees Ninety Nine and Paise Ninety Nine Only');
});

test('formatINR Indian grouping', () => {
  assert.equal(formatINR(123456.5), '₹1,23,456.50');
  assert.equal(formatINR(100), '₹100.00');
  assert.equal(formatINR(10000000), '₹1,00,00,000.00');
  assert.equal(formatINR(-2500), '-₹2,500.00');
});

test('invoice number formatting pads correctly', () => {
  assert.equal(formatInvoiceNumber('INV-', 4, 1), 'INV-0001');
  assert.equal(formatInvoiceNumber('MB/', 5, 42), 'MB/00042');
  assert.equal(formatInvoiceNumber('', 3, 123), '123');
});
