'use strict';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? ' ' + ONES[o] : '');
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let out = '';
  if (h) out += ONES[h] + ' Hundred';
  if (rest) out += (h ? ' ' : '') + twoDigits(rest);
  return out;
}

/**
 * Convert a non-negative integer (< 10^9) to words using the Indian system
 * (crore / lakh / thousand).
 */
function integerToIndianWords(num) {
  if (!Number.isInteger(num) || num < 0) throw new RangeError('num must be a non-negative integer');
  if (num === 0) return 'Zero';
  if (num >= 1e9) return 'Amount too large';

  const crore = Math.floor(num / 1e7);
  const lakh = Math.floor((num % 1e7) / 1e5);
  const thousand = Math.floor((num % 1e5) / 1e3);
  const rest = num % 1e3;

  const parts = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
}

/**
 * Convert a money value to words, e.g. 123456.5 ->
 * "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Paise Fifty Only"
 */
function amountToWords(value) {
  const negative = value < 0;
  const abs = Math.abs(value);
  let rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);
  // Rounding paise may push it to 100
  if (paise === 100) {
    rupees += 1;
  }
  let words = `Rupees ${integerToIndianWords(rupees)}`;
  if (paise > 0 && paise < 100) words += ` and Paise ${integerToIndianWords(paise)}`;
  words += ' Only';
  return negative ? `Minus ${words}` : words;
}

module.exports = { integerToIndianWords, amountToWords };
