'use strict';

const Decimal = require('decimal.js');

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const TWO_DP = new Decimal('0.01');

/** Round to 2 decimal places, half-up (money). */
const round2 = (value) => new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

/** Round to nearest integer, half-up. */
const roundInt = (value) => new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

/** Safe number coercion; null/undefined/''/NaN become 0. */
const toNum = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Format a number as Indian currency string: 123456.5 -> "1,23,456.50". */
const formatINR = (value) => {
  const negative = value < 0;
  const abs = Math.abs(value);
  const [intPart, decPart] = abs.toFixed(2).split('.');
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return `${negative ? '-' : ''}₹${grouped}.${decPart}`;
};

module.exports = { Decimal, TWO_DP, round2, roundInt, toNum, formatINR };
