'use strict';

/** Formatting helpers shared by the PDF service. */

/** "Rs.1,23,456.50" (Helvetica lacks the rupee glyph). */
function formatINRPlain(value) {
  const n = Number(value) || 0;
  const negative = n < 0;
  const abs = Math.abs(n);
  const [intPart, decPart] = abs.toFixed(2).split('.');
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return `${negative ? '-' : ''}Rs.${grouped}.${decPart}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "21 Nov 2026" */
function formatDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "21/08/2026" (DD/MM/YYYY, as on the reference invoice) */
function formatDateDMY(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

module.exports = { formatINRPlain, formatDate, formatDateDMY };
