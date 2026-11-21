'use strict';

/**
 * Server-side A4 PDF in the classic counter-billing format (mirrors
 * views/partials/invoice-a4.ejs and the sample invoice):
 * centered title, 3-column bordered header, items table with split
 * %CGST/%SGST columns, page-filling items box, remark totals row,
 * GROSS/ADD/LESS/NET block, words bar, dashed footer rule.
 */

const PDFDocument = require('pdfkit');
const { formatDateDMY } = require('./pdfHelpers');

const PAGE = { width: 595.28, height: 841.89 }; // A4 points
const MX = 24; // side margin
const CW = PAGE.width - MX * 2; // content width

// column widths sum exactly to CW = 547.28 (A4 minus 24pt side margins)
const COLS = {
  com: 34, hsn: 40, qty: 44, product: 90.28, batch: 43, exp: 32,
  mrp: 34, rate: 34, disc: 28, taxable: 42, pct: 18, amt: 45,
};

function columnXs(isIgst) {
  const xs = [];
  let x = MX;
  const base = ['com', 'hsn', 'qty', 'product', 'batch', 'exp', 'mrp', 'rate', 'disc', 'taxable'];
  for (const key of base) { xs.push(x); x += COLS[key]; }
  // tax columns: percent + amount pairs
  if (isIgst) {
    xs.push(x); x += COLS.pct;
    xs.push(x); x += COLS.amt;
  } else {
    xs.push(x); x += COLS.pct; // cgst %
    xs.push(x); x += COLS.amt; // cgst amt
    xs.push(x); x += COLS.pct; // sgst %
    xs.push(x); x += COLS.amt; // sgst amt
  }
  xs.push(x); // right edge
  return xs;
}

/** Build the invoice PDF and return the PDFKit document (stream to response). */
function buildInvoicePdf(bill) {
  const doc = new PDFDocument({ size: 'A4', margin: MX, bufferPages: true });
  const s = bill.seller || {};
  const c = bill.customer || {};
  const sum = bill.summary || {};
  const isIgst = bill.taxSplit === 'igst';
  const xs = columnXs(isIgst);
  const lastX = xs[xs.length - 1];

  const money = (v) => {
    const n = Number(v) || 0;
    const [i, d2] = Math.abs(n).toFixed(2).split('.');
    const last3 = i.slice(-3);
    const rest = i.slice(0, -3);
    const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
    return (n < 0 ? '-' : '') + grouped + '.' + d2;
  };

  const wordsLine = (sum.amountInWords || '').toUpperCase().replace(/^RUPEES\s+/, 'Rs.').replace(/\s+ONLY$/, ' ONLY');
  const addrLine = (s.addressText || '').split('\n').filter(Boolean).join(', ');
  const gross = sum.totalTaxable || 0;
  const addAmt = Math.round(((sum.totalTax || 0) + (sum.additionalCharges || 0) + Math.max(sum.roundOff || 0, 0)) * 100) / 100;
  const lessAmt = Math.round(Math.max(-(sum.roundOff || 0), 0) * 100) / 100;

  const cellText = (text, col, y, { align = 'left', font = 'Helvetica', size = 7.5, indent = 2 } = {}) => {
    const width = xs[col + 1] - xs[col];
    doc.font(font).fontSize(size).fillColor('#000000').text(
      String(text ?? ''), xs[col] + indent, y, { width: width - indent * 2, align, lineBreak: false }
    );
  };

  /** Truncate text with an ellipsis so it never exceeds maxLines in maxWidth
   *  (prevents long salt names breaking into letter fragments). */
  const fitText = (value, size, maxWidth, maxLines = 2) => {
    const text = String(value || '');
    if (!text) return '';
    doc.font('Helvetica').fontSize(size);
    if (doc.widthOfString(text) <= maxWidth * maxLines) return text;
    let cut = text;
    while (cut.length > 1 && doc.widthOfString(cut + '…') > maxWidth * maxLines) {
      cut = cut.slice(0, -1);
    }
    return cut + '…';
  };

  // ---------- title ----------
  let y = MX + 2;
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000000')
    .text((bill.invoiceType || 'TAX INVOICE').toUpperCase(), MX, y, { width: CW, align: 'center' });
  y += 18;

  // ---------- 3-column header ----------
  const headerH = 64;
  const col1W = CW * 0.38;
  const col2W = CW * 0.27;
  const col1X = MX;
  const col2X = MX + col1W;
  const col3X = col2X + col2W;

  doc.rect(col1X, y, CW, headerH).lineWidth(0.8).strokeColor('#000000').stroke();
  doc.moveTo(col2X, y).lineTo(col2X, y + headerH).lineWidth(0.8).stroke();
  doc.moveTo(col3X, y).lineTo(col3X, y + headerH).lineWidth(0.8).stroke();

  // shop block
  let ty = y + 4;
  doc.font('Helvetica-Bold').fontSize(13).text(s.businessName || '', col1X + 6, ty, { width: col1W - 10 });
  ty = doc.y + 2;
  doc.font('Helvetica').fontSize(7.5);
  if (addrLine) {
    doc.text(addrLine + (s.phone ? ' , Ph : ' + s.phone : ''), col1X + 6, ty, { width: col1W - 10 });
    ty = doc.y + 6;
  }
  if (s.drugLicenseNo) {
    doc.font('Helvetica').fontSize(7.5).text(`D.L.No.: ${s.drugLicenseNo}`, col1X + 6, ty, { width: col1W - 10 });
    ty = doc.y + 1;
  }
  const taxIdLine = [s.gstin ? `GSTIN: ${s.gstin}` : '', s.pan ? `PAN : ${s.pan}` : ''].filter(Boolean).join('   ');
  if (taxIdLine) doc.text(taxIdLine, col1X + 6, ty, { width: col1W - 10 });

  // invoice meta block
  let my = y + 4;
  doc.font('Helvetica-Bold').fontSize(9).text(`Invoice No : ${bill.invoiceNumber}`, col2X + 6, my, { width: col2W - 10 });
  my = doc.y + 2;
  doc.font('Helvetica').fontSize(8);
  doc.text(`Date : ${formatDateDMY(new Date(bill.invoiceDate))}`, col2X + 6, my);
  my = doc.y + 1;
  doc.text(`Time : ${bill.invoiceTime || ''}`, col2X + 6, my);
  my = doc.y + 1;
  doc.text(`User : ${bill.userName || ''}`, col2X + 6, my);

  // party block (address / doctor / gstin printed only when present)
  let py = y + 4;
  doc.font('Helvetica').fontSize(8.5);
  doc.text(`PARTY NAME : ${c.name || ''}`, col3X + 6, py, { width: PAGE.width - MX - col3X - 12 });
  py = doc.y + 1;
  if (c.address) {
    doc.text(`Address : ${c.address}`, col3X + 6, py, { width: PAGE.width - MX - col3X - 12 });
    py = doc.y + 1;
  }
  if (c.doctorName) {
    doc.text(`Doctor  : ${c.doctorName}`, col3X + 6, py, { width: PAGE.width - MX - col3X - 12 });
    py = doc.y + 1;
  }
  if (c.gstin) {
    doc.text(`GSTIN    : ${c.gstin}`, col3X + 6, py, { width: PAGE.width - MX - col3X - 12 });
  }

  y += headerH;

  // ---------- items table ----------
  const HEADER_H = 26;
  const MIN_ITEMS_H = 380; // page-filling items box like the sample
  const MIN_ROW_H = 15;

  const drawTableHeader = () => {
    doc.rect(MX, y, CW, HEADER_H).lineWidth(0.8).strokeColor('#000000').stroke();
    // horizontal split of the two-level tax headers (tax columns only, so it
    // never crosses the single-level header labels)
    doc.moveTo(xs[10], y + 13).lineTo(lastX, y + 13).lineWidth(0.6).stroke();
    // vertical separators
    for (let i = 1; i < xs.length - 1; i += 1) {
      doc.moveTo(xs[i], y).lineTo(xs[i], y + HEADER_H).lineWidth(0.6).stroke();
    }
    const labels = ['Com', 'HSN No', 'Qty x Unit', 'Product Name', 'Batch', 'Exp', 'M.R.P.', 'Rate', 'Disc', 'Taxable'];
    doc.font('Helvetica').fontSize(7).fillColor('#000000');
    const labelY = y + (HEADER_H - 7 * 1.18) / 2; // vertically centered in the full header
    labels.forEach((label, i) => {
      const width = xs[i + 1] - xs[i];
      doc.text(label, xs[i] + 2, labelY, { width: width - 4, align: i === 3 ? 'left' : 'center', lineBreak: false });
    });
    let tx = xs[10];
    if (isIgst) {
      doc.text('% IGST Amt', tx, y + 3, { width: xs[12] - tx, align: 'center', lineBreak: false });
      doc.text('%', tx, y + 16, { width: xs[11] - tx, align: 'center', lineBreak: false });
      doc.text('Amt', xs[11], y + 16, { width: xs[12] - xs[11], align: 'center', lineBreak: false });
    } else {
      doc.text('% CGST Amt', tx, y + 3, { width: xs[12] - tx, align: 'center', lineBreak: false });
      doc.text('% SGST Amt', xs[12], y + 3, { width: xs[14] - xs[12], align: 'center', lineBreak: false });
      doc.text('%', tx, y + 16, { width: xs[11] - tx, align: 'center', lineBreak: false });
      doc.text('Amt', xs[11], y + 16, { width: xs[12] - xs[11], align: 'center', lineBreak: false });
      doc.text('%', xs[12], y + 16, { width: xs[13] - xs[12], align: 'center', lineBreak: false });
      doc.text('Amt', xs[13], y + 16, { width: xs[14] - xs[13], align: 'center', lineBreak: false });
    }
    y += HEADER_H;
  };

  drawTableHeader();

  const drawItemRow = (it) => {
    doc.font('Helvetica').fontSize(7).fillColor('#000000');
    const fittedComposition = fitText(it.composition, 6, COLS.com - 6, 2);
    const productLines = Math.max(1, doc.heightOfString(it.productName || '', { width: COLS.product - 6 }) / (7 * 1.18));
    doc.font('Helvetica').fontSize(6);
    const compLines = fittedComposition ? Math.max(1, doc.heightOfString(fittedComposition, { width: COLS.com - 6 }) / (6 * 1.18)) : 0;
    const rowH = Math.max(MIN_ROW_H, productLines * 7 * 1.18 + 6, compLines * 6 * 1.18 + 6);

    doc.rect(MX, y, CW, rowH).lineWidth(0.6).strokeColor('#000000').stroke();
    for (let i = 1; i < xs.length - 1; i += 1) {
      doc.moveTo(xs[i], y).lineTo(xs[i], y + rowH).lineWidth(0.6).stroke();
    }

    // vertically center each cell's text block within the row
    const cyFor = (size, lines = 1) => y + Math.max(1, (rowH - lines * size * 1.18) / 2);
    cellText(fittedComposition, 0, cyFor(6, compLines || 1), { align: 'center', size: 6 });
    cellText(it.hsnCode || '', 1, cyFor(7), { align: 'center' });
    cellText(`${it.quantity}x${String(it.unit || '').toUpperCase()}`, 2, cyFor(7), { align: 'center' });
    cellText(it.productName || '', 3, cyFor(7, Math.ceil(productLines)));
    cellText(it.batchNumber || '', 4, cyFor(7), { align: 'center' });
    cellText(it.expiryDate || '', 5, cyFor(7), { align: 'center' });
    cellText(it.mrp ? money(it.mrp) : '', 6, cyFor(7), { align: 'right' });
    cellText(money(it.rate), 7, cyFor(7), { align: 'right' });
    cellText(it.discountValue ? (it.discountType === 'percent' ? it.discountValue : money(it.discountValue)) : '', 8, cyFor(7), { align: 'center' });
    cellText(money(it.taxableAmount), 9, cyFor(7), { align: 'right' });
    if (isIgst) {
      cellText(it.gstRate, 10, cyFor(7), { align: 'right' });
      cellText(money(it.igstAmount), 11, cyFor(7), { align: 'right' });
    } else {
      cellText(it.gstRate / 2, 10, cyFor(7), { align: 'right' });
      cellText(money(it.cgstAmount), 11, cyFor(7), { align: 'right' });
      cellText(it.gstRate / 2, 12, cyFor(7), { align: 'right' });
      cellText(money(it.sgstAmount), 13, cyFor(7), { align: 'right' });
    }
    y += rowH;
  };

  (bill.items || []).forEach(drawItemRow);

  // page-filling spacer
  const usedH = y - MX - 18 - headerH - HEADER_H; // rough consumed height
  const fillerH = Math.max(12, MIN_ITEMS_H - usedH);
  doc.rect(MX, y, CW, fillerH).lineWidth(0.6).strokeColor('#000000').stroke();
  for (let i = 1; i < xs.length - 1; i += 1) {
    doc.moveTo(xs[i], y).lineTo(xs[i], y + fillerH).lineWidth(0.6).stroke();
  }
  y += fillerH;

  // ---------- remark + totals row ----------
  const remarkH = 18;
  doc.rect(MX, y, CW, remarkH).lineWidth(0.8).strokeColor('#000000').stroke();
  for (let i = 1; i < xs.length - 1; i += 1) {
    if (i === 9 || i === 10 || i === (isIgst ? 11 : 12)) {
      doc.moveTo(xs[i], y).lineTo(xs[i], y + remarkH).lineWidth(0.6).stroke();
    }
  }
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000')
    .text('Remark :', MX + 5, y + 5, { lineBreak: false });
  if (bill.notes) {
    doc.font('Helvetica').fontSize(7.5).text(bill.notes, MX + 62, y + 6, { lineBreak: false, ellipsis: true, width: xs[9] - MX - 70 });
  }
  doc.font('Helvetica-Bold').fontSize(7.5);
  const taxableW = xs[10] - xs[9];
  doc.text(money(gross), xs[9], y + 6, { width: taxableW, align: 'center', lineBreak: false });
  if (isIgst) {
    doc.text(money(sum.totalIgst), xs[11], y + 6, { width: xs[12] - xs[11], align: 'center', lineBreak: false });
  } else {
    doc.text(money(sum.totalCgst), xs[11], y + 6, { width: xs[12] - xs[11], align: 'center', lineBreak: false });
    doc.text(money(sum.totalSgst), xs[13], y + 6, { width: xs[14] - xs[13], align: 'center', lineBreak: false });
  }
  y += remarkH;

  // ---------- footer band ----------
  const footerTop = y;
  const wordsH = 20;
  const footerH = 58;

  // outer box
  doc.rect(MX, footerTop, CW, footerH).lineWidth(0.8).strokeColor('#000000').stroke();
  const f1 = MX + CW * 0.42;
  const f2 = f1 + CW * 0.28;
  doc.moveTo(f1, footerTop).lineTo(f1, footerTop + footerH).lineWidth(0.8).stroke();
  doc.moveTo(f2, footerTop).lineTo(f2, footerTop + footerH).lineWidth(0.8).stroke();
  // words row separator
  doc.moveTo(MX, footerTop + footerH - wordsH).lineTo(lastX, footerTop + footerH - wordsH).lineWidth(0.8).stroke();
  // NET AMT separator between words and amount
  doc.moveTo(f2, footerTop + footerH - wordsH).lineTo(f2, footerTop + footerH).lineWidth(0.8).stroke();

  // left: message + terms
  doc.font('Helvetica').fontSize(8).fillColor('#000000')
    .text(s.thankYouText || 'Get well soon...', MX + 6, footerTop + 5, { width: CW * 0.42 - 12 });
  doc.font('Helvetica').fontSize(7)
    .text(bill.termsText || 'Subject To Jurisdiction Only.  E. & O.E.', MX + 6, footerTop + 24, { width: CW * 0.42 - 12 });

  // middle: for shop / pharmacist
  doc.font('Helvetica-Bold').fontSize(9)
    .text(`For ${s.businessName || ''}`, f1 + 4, footerTop + 8, { width: f2 - f1 - 8, align: 'center' });
  doc.font('Helvetica').fontSize(7.5)
    .text('Pharmacist', f1 + 4, footerTop + 30, { width: f2 - f1 - 8, align: 'center' });

  // right: GROSS / ADD / LESS (values end 8pt inside the box border)
  const totalsRows = [['GROSS', gross], ['ADD', addAmt], ['LESS', lessAmt]];
  let gy = footerTop + 3;
  totalsRows.forEach(([label, value]) => {
    doc.font('Helvetica').fontSize(8).text(label, f2 + 8, gy);
    doc.font('Helvetica').fontSize(8).text(money(value), lastX - 68, gy, { width: 60, align: 'right', lineBreak: false });
    gy += 12;
  });

  // bottom row: words + NET AMT
  const wordsY = footerTop + footerH - wordsH;
  doc.font('Helvetica-Bold').fontSize(8.5)
    .text(wordsLine, MX + 6, wordsY + 6, { width: f2 - MX - 12, lineBreak: false, ellipsis: true });
  doc.font('Helvetica-Bold').fontSize(10)
    .text('NET AMT', f2 + 8, wordsY + 5, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(11)
    .text(money(sum.netAmount), lastX - 94, wordsY + 4, { width: 84, align: 'right', lineBreak: false });

  y = footerTop + footerH;

  // ---------- dashed bottom rule ----------
  doc.moveTo(MX, y + 6).lineTo(lastX, y + 6).lineWidth(1).dash(3, { space: 3 }).strokeColor('#000000').stroke().undash();

  // cancelled watermark (single line, wide enough for the word)
  if (bill.status === 'cancelled') {
    doc.save().rotate(-Math.PI / 8, { origin: [PAGE.width / 2, PAGE.height / 2] })
      .fontSize(52).fillOpacity(0.12).fillColor('#dc2626')
      .text('CANCELLED', PAGE.width / 2 - 220, PAGE.height / 2 - 26, { width: 440, align: 'center', lineBreak: false })
      .restore();
  }

  doc.end();
  return doc;
}

module.exports = { buildInvoicePdf };
