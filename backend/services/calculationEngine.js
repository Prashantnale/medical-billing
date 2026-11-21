'use strict';

const { Decimal, round2, roundInt, toNum } = require('../utils/money');
const { amountToWords } = require('../utils/numberToWords');
const { AppError } = require('../utils/errors');

/**
 * Authoritative GST calculation engine. Runs ONLY on the server - the
 * client performs the same arithmetic locally purely for live preview,
 * but stored totals always come from here.
 *
 * Per line item:
 *   base      = quantity x rate
 *   discount  = percent: base x d/100   |   fixed: min(d, base)
 *   gross     = base - discount
 *   exclusive: taxable = gross,                 tax = gross x gst/100
 *   inclusive: taxable = gross / (1 + gst/100), tax = gross - taxable
 *   tax split = cgst_sgst: half each  |  igst: full as IGST
 *
 * Every stored per-item value is rounded half-up to 2 decimals; bill
 * totals are the sum of the already-rounded line values so the printed
 * invoice always adds up exactly.
 */
function calculateItem(item, taxMode, taxSplit) {
  const quantity = toNum(item.quantity);
  const rate = toNum(item.rate);
  const gstRate = toNum(item.gstRate);
  const discountValue = toNum(item.discountValue);
  const discountType = item.discountType === 'fixed' ? 'fixed' : 'percent';

  if (!(quantity > 0)) throw new AppError(`Item "${item.productName || 'unnamed'}": quantity must be greater than 0`, 422);
  if (rate < 0) throw new AppError(`Item "${item.productName || 'unnamed'}": rate cannot be negative`, 422);
  if (gstRate < 0 || gstRate > 100) throw new AppError(`Item "${item.productName || 'unnamed'}": GST rate must be 0-100`, 422);

  const base = new Decimal(quantity).times(rate);
  let discount;
  if (discountType === 'percent') {
    if (discountValue < 0 || discountValue > 100) {
      throw new AppError(`Item "${item.productName || 'unnamed'}": discount percent must be 0-100`, 422);
    }
    discount = base.times(discountValue).div(100);
  } else {
    discount = Decimal.min(discountValue, base); // cannot discount below zero
    if (discountValue < 0) throw new AppError(`Item "${item.productName || 'unnamed'}": discount cannot be negative`, 422);
  }

  const gross = base.minus(discount);

  let taxable;
  let tax;
  if (taxMode === 'inclusive') {
    // gross already contains the tax: taxable = gross / (1 + gst/100)
    taxable = gross.div(new Decimal(1).plus(new Decimal(gstRate).div(100)));
    tax = gross.minus(taxable);
  } else {
    taxable = gross;
    tax = gross.times(gstRate).div(100);
  }

  const taxableAmount = round2(taxable);
  const totalTaxAmount = round2(tax);
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;
  if (taxSplit === 'igst') {
    igstAmount = totalTaxAmount;
  } else {
    cgstAmount = round2(new Decimal(totalTaxAmount).div(2));
    sgstAmount = round2(new Decimal(totalTaxAmount).minus(cgstAmount));
  }

  return {
    productName: String(item.productName || '').trim(),
    composition: String(item.composition || '').trim(),
    hsnCode: String(item.hsnCode || '').trim(),
    batchNumber: String(item.batchNumber || '').trim(),
    expiryDate: String(item.expiryDate || '').trim(),
    unit: String(item.unit || 'Unit').trim(),
    mrp: round2(toNum(item.mrp)),
    quantity,
    rate: round2(rate),
    discountType,
    discountValue: round2(discountValue),
    gstRate,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    lineTotal: round2(new Decimal(taxableAmount).plus(cgstAmount).plus(sgstAmount).plus(igstAmount)),
  };
}

/**
 * Calculate a complete bill (items + charges + summary).
 * @param {object} input { items, charges, taxMode, taxSplit, roundOffEnabled }
 */
function calculateBill(input) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) throw new AppError('A bill must contain at least one item', 422);
  if (items.length > 100) throw new AppError('A bill cannot contain more than 100 items', 422);

  const taxMode = input.taxMode === 'inclusive' ? 'inclusive' : 'exclusive';
  const taxSplit = input.taxSplit === 'igst' ? 'igst' : 'cgst_sgst';

  const calculatedItems = items.map((item) => calculateItem(item, taxMode, taxSplit));

  let totalQuantity = new Decimal(0);
  let grossAmount = new Decimal(0);
  let totalDiscount = new Decimal(0);
  let totalTaxable = new Decimal(0);
  let totalCgst = new Decimal(0);
  let totalSgst = new Decimal(0);
  let totalIgst = new Decimal(0);
  let totalTax = new Decimal(0);
  let lineTotalSum = new Decimal(0);

  for (const it of calculatedItems) {
    const base = new Decimal(it.quantity).times(it.rate);
    const discountValue = it.discountType === 'percent' ? base.times(it.discountValue).div(100) : Decimal.min(it.discountValue, base);
    totalQuantity = totalQuantity.plus(it.quantity);
    grossAmount = grossAmount.plus(base);
    totalDiscount = totalDiscount.plus(discountValue);
    totalTaxable = totalTaxable.plus(it.taxableAmount);
    totalCgst = totalCgst.plus(it.cgstAmount);
    totalSgst = totalSgst.plus(it.sgstAmount);
    totalIgst = totalIgst.plus(it.igstAmount);
    totalTax = totalTax.plus(it.cgstAmount).plus(it.sgstAmount).plus(it.igstAmount);
    lineTotalSum = lineTotalSum.plus(it.lineTotal);
  }

  const charges = (Array.isArray(input.charges) ? input.charges : [])
    .filter((c) => c && String(c.label || '').trim() && toNum(c.amount) !== 0)
    .slice(0, 5)
    .map((c) => ({ label: String(c.label).trim().slice(0, 60), amount: round2(toNum(c.amount)) }));
  const additionalCharges = charges.reduce((sum, c) => sum.plus(c.amount), new Decimal(0));

  // lineTotalSum already equals taxable + tax for every line
  const subTotal = lineTotalSum.plus(additionalCharges);

  let netAmount;
  let roundOff = new Decimal(0);
  if (input.roundOffEnabled !== false) {
    netAmount = roundInt(subTotal);
    roundOff = new Decimal(netAmount).minus(subTotal);
  } else {
    netAmount = round2(subTotal);
  }

  const summary = {
    totalQuantity: round2(totalQuantity),
    grossAmount: round2(grossAmount),
    totalDiscount: round2(totalDiscount),
    totalTaxable: round2(totalTaxable),
    totalCgst: round2(totalCgst),
    totalSgst: round2(totalSgst),
    totalIgst: round2(totalIgst),
    totalTax: round2(totalTax),
    additionalCharges: round2(additionalCharges),
    subTotal: round2(subTotal),
    roundOff: round2(roundOff),
    netAmount: round2(netAmount),
    amountInWords: amountToWords(round2(netAmount)),
  };

  return { items: calculatedItems, charges, summary, taxMode, taxSplit };
}

module.exports = { calculateBill, calculateItem };
