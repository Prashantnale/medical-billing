'use strict';

/* ==========================================================================
   Bill creation: dynamic item rows, live GST calculations (mirroring the
   server engine for preview only - stored totals are always recomputed
   server-side), additional charges, submit to POST /api/bills.
   ========================================================================== */

(() => {
  const { $, $$, el, esc, fmtINR, round2, api, toast, refreshIcons } = window.App;

  const container = $('#items-container');
  const chargesContainer = $('#charges-container');
  if (!container) return;

  const GST_RATES = ['0', '0.25', '3', '5', '12', '18', '28'];
  const UNITS = ['TAB', 'CAP', 'STRIP', 'BTL', 'VIAL', 'SYP', 'TUBE', 'SACHET', 'BOX', 'PCS', 'UNIT'];

  /* ---------------- defaults from settings (rendered into form) ---------------- */
  const defaults = {
    taxMode: document.body.dataset.taxMode || 'exclusive',
  };
  const taxModeSelect = $('#taxMode');
  if (taxModeSelect && defaults.taxMode === 'inclusive') taxModeSelect.value = 'inclusive';
  const roundOffCheckbox = $('#roundOffEnabled');

  /* ==========================================================================
     ITEM ROWS
     ========================================================================== */

  function field(labelText, inputEl, spanClass) {
    const wrap = el('div', spanClass ? { class: spanClass } : {});
    const label = el('label', { class: 'field-label' }, labelText);
    label.htmlFor = inputEl.id;
    wrap.append(label, inputEl);
    return wrap;
  }

  let itemSeq = 0;

  function makeInput(id, type, attrs = {}) {
    return el('input', { id, type, class: 'field-input', ...attrs });
  }

  function addItemRow(prefill = {}) {
    itemSeq += 1;
    const uid = `it${itemSeq}`;

    const name = makeInput(`${uid}-name`, 'text', {
      placeholder: 'Medicine name (type to pick saved)', required: true, maxlength: 140,
      value: prefill.productName || '', list: 'medicines-list',
    });
    const composition = makeInput(`${uid}-composition`, 'text', {
      placeholder: 'Salt / composition', maxlength: 200, value: prefill.composition || '',
    });
    const hsn = makeInput(`${uid}-hsn`, 'text', { placeholder: 'HSN', maxlength: 20, value: prefill.hsnCode || '' });
    const batch = makeInput(`${uid}-batch`, 'text', { placeholder: 'Batch no.', maxlength: 40, value: prefill.batchNumber || '' });
    const expiry = el('input', { id: `${uid}-expiry`, type: 'month', class: 'field-input' });
    const unit = el('input', {
      id: `${uid}-unit`, type: 'text', class: 'field-input uppercase', list: 'unit-suggestions',
      maxlength: 20, placeholder: 'TAB', value: prefill.unit || 'TAB',
    });
    const mrp = makeInput(`${uid}-mrp`, 'number', { placeholder: '0.00', min: '0', step: '0.01', inputmode: 'decimal', value: prefill.mrp ?? '' });
    const qty = makeInput(`${uid}-qty`, 'number', {
      placeholder: '1', min: '0.001', step: 'any', inputmode: 'decimal', required: true,
      value: prefill.quantity ?? '1',
    });
    const rate = makeInput(`${uid}-rate`, 'number', {
      placeholder: '0.00', min: '0', step: '0.01', inputmode: 'decimal', required: true,
      value: prefill.rate ?? '',
    });
    const discType = el('select', { id: `${uid}-dtype`, class: 'field-input' },
      el('option', { value: 'percent' }, '%'),
      el('option', { value: 'fixed' }, '₹ Fixed'));
    if (prefill.discountType === 'fixed') discType.value = 'fixed';
    const discVal = makeInput(`${uid}-dval`, 'number', { placeholder: '0', min: '0', step: '0.01', inputmode: 'decimal', value: prefill.discountValue || '' });
    const gst = el('select', { id: `${uid}-gst`, class: 'field-input' },
      ...GST_RATES.map((r) => el('option', { value: r }, `${r}%`)));
    gst.value = String(prefill.gstRate ?? '5');
    if (!GST_RATES.includes(gst.value)) gst.value = '5';

    const removeBtn = el('button', {
      type: 'button',
      class: 'flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50',
      onclick: () => {
        card.remove();
        recalc();
      },
    }, el('i', { 'data-lucide': 'trash-2', class: 'h-4 w-4' }), 'Remove');

    const rowComputed = el('div', {
      class: 'lg:col-span-12 flex flex-wrap items-center gap-x-4 gap-y-0.5 rounded-xl bg-teal-50/70 px-3 py-1.5 text-[11px] font-semibold text-teal-800',
      'data-role': 'row-computed',
    });

    const card = el('div', { class: 'item-card' },
      el('div', { class: 'lg:hidden mb-2 flex items-center justify-between' },
        el('span', { class: 'text-xs font-bold text-slate-400', 'data-role': 'row-no' }, `Item ${container.children.length + 1}`),
        removeBtn),
      el('div', { class: 'item-grid grid grid-cols-2 gap-2.5 lg:grid-cols-12' },
        field('Product Name *', name, 'lg:col-span-4'),
        field('Composition', composition, 'lg:col-span-3'),
        field('HSN', hsn, 'lg:col-span-1'),
        field('Batch', batch, 'lg:col-span-1'),
        field('Expiry', expiry, 'lg:col-span-1'),
        field('Unit', unit, 'lg:col-span-2'),
        field('MRP', mrp, 'lg:col-span-2'),
        field('Quantity *', qty, 'lg:col-span-1'),
        field('Rate *', rate, 'lg:col-span-2'),
        field('Discount', el('div', { class: 'flex gap-1.5' }, discVal, discType), 'lg:col-span-2'),
        field('GST %', gst, 'lg:col-span-2'),
      ),
      el('div', { class: 'hidden lg:flex justify-end mt-2' }, removeBtn),
      rowComputed,
    );

    // desktop col-span fixes (Tailwind arbitrary grid)
    card.querySelector('.item-grid')?.classList.add('lg:gap-x-3');

    container.appendChild(card);

    [qty, rate, discVal, gst, discType].forEach((inp) => {
      inp.addEventListener('input', recalc);
      inp.addEventListener('change', recalc);
    });
    name.addEventListener('input', () => {
      if (applyMedicine(name)) {
        qty.focus();
        qty.select();
      }
      recalc();
    });

    refreshIcons();
    recalc();
    return card;
  }

  function readItemRow(card) {
    const val = (sel) => {
      const n = card.querySelector(sel);
      if (!n) return null;
      if (n.type === 'number') return n.value === '' ? null : Number(n.value);
      return n.value.trim();
    };
    let expiry = val('[id$="-expiry"]') || '';
    if (/^\d{4}-\d{2}$/.test(expiry)) {
      const [y, m] = expiry.split('-');
      expiry = `${m}/${y.slice(2)}`; // "2026-11" -> "11/26"
    }
    return {
      productName: val('[id$="-name"]') || '',
      composition: val('[id$="-composition"]') || '',
      hsnCode: val('[id$="-hsn"]') || '',
      batchNumber: val('[id$="-batch"]') || '',
      expiryDate: expiry,
      unit: val('[id$="-unit"]') || 'Unit',
      mrp: val('[id$="-mrp"]') || 0,
      quantity: val('[id$="-qty"]'),
      rate: val('[id$="-rate"]'),
      discountType: val('[id$="-dtype"]') || 'percent',
      discountValue: val('[id$="-dval"]') || 0,
      gstRate: val('[id$="-gst"]') || 0,
    };
  }

  /* ==========================================================================
     MEDICINE MASTER - type-ahead pick fills the row (composition, HSN, MRP,
     unit, GST%). Medicines are saved automatically when a bill is created.
     ========================================================================== */

  const medicineMap = new Map(); // lowercase name -> medicine

  async function loadMedicines() {
    try {
      const data = await api('/api/medicines', { silent: true });
      (data.medicines || []).forEach((m) => medicineMap.set(String(m.name).toLowerCase(), m));
      const datalist = document.getElementById('medicines-list');
      if (datalist) {
        datalist.innerHTML = (data.medicines || []).map((m) => {
          const bits = [m.composition, m.hsnCode ? `HSN ${m.hsnCode}` : '', m.rate ? `Rate ${m.rate}` : '', m.mrp ? `MRP ${m.mrp}` : '']
            .filter(Boolean).join(' · ');
          return `<option value="${esc(m.name)}">${esc(bits)}</option>`;
        }).join('');
      }
    } catch {
      /* non-fatal: the form still works with manual entry */
    }
  }

  function applyMedicine(nameInput) {
    const med = medicineMap.get(nameInput.value.trim().toLowerCase());
    if (!med) return false;
    const card = nameInput.closest('.item-card');
    const set = (suffix, value) => {
      const field = card.querySelector(`[id$="-${suffix}"]`);
      if (field) field.value = value;
    };
    set('composition', med.composition || '');
    set('hsn', med.hsnCode || '');
    set('mrp', med.mrp || '');
    if (med.rate) set('rate', med.rate); // default selling rate, editable per bill
    set('unit', (med.unit || 'TAB').toUpperCase());
    set('gst', String(med.gstRate ?? 5));
    return true;
  }

  /* ==========================================================================
     CALCULATION ENGINE (preview mirror of backend/services/calculationEngine.js)
     ========================================================================== */

  function calcItem(item, taxMode, taxSplit) {
    const quantity = round2(Number(item.quantity) || 0);
    const rate = round2(Number(item.rate) || 0);
    const gstRate = Math.min(100, Math.max(0, Number(item.gstRate) || 0));
    const discountType = item.discountType === 'fixed' ? 'fixed' : 'percent';
    const discountValue = Math.max(0, Number(item.discountValue) || 0);

    const base = round2(quantity * rate);
    let discount;
    if (discountType === 'percent') {
      discount = round2((base * discountValue) / 100);
    } else {
      discount = Math.min(discountValue, base);
    }
    const gross = round2(base - discount);

    let taxableExact;
    let taxExact;
    if (taxMode === 'inclusive') {
      taxableExact = gross / (1 + gstRate / 100);
      taxExact = gross - taxableExact;
    } else {
      taxableExact = gross;
      taxExact = (gross * gstRate) / 100;
    }
    const taxableAmount = round2(taxableExact);
    const totalTaxAmount = round2(taxExact);
    // exactly one split carries the tax (mirrors the server engine)
    const cgstAmount = taxSplit === 'igst' ? 0 : round2(totalTaxAmount / 2);
    const sgstAmount = taxSplit === 'igst' ? 0 : round2(totalTaxAmount - cgstAmount);
    const igstAmount = taxSplit === 'igst' ? totalTaxAmount : 0;
    const lineTotal = round2(taxableAmount + cgstAmount + sgstAmount + igstAmount);

    return {
      ...item, quantity, rate, gstRate, discountType, discountValue,
      taxableAmount, cgstAmount, sgstAmount, igstAmount, lineTotal,
    };
  }

  function readCharges() {
    return $$('#charges-container [data-charge]').map((row) => ({
      label: row.querySelector('[data-charge-label]').value.trim(),
      amount: Number(row.querySelector('[data-charge-amount]').value) || 0,
    }));
  }

  function calcBill() {
    const taxMode = $('#taxMode').value;
    const taxSplit = $('#taxSplit').value;
    const items = $$('#items-container .item-card')
      .map(readItemRow)
      .filter((it) => it.productName || it.quantity || it.rate);

    const calculated = items.map((it) => calcItem(it, taxMode, taxSplit));
    const charges = readCharges().filter((c) => c.label && c.amount !== 0);

    let totalQty = 0; let totalTaxable = 0; let totalCgst = 0; let totalSgst = 0;
    let totalIgst = 0; let lineSum = 0;
    calculated.forEach((it) => {
      totalQty += it.quantity;
      totalTaxable += it.taxableAmount;
      totalCgst += it.cgstAmount;
      totalSgst += it.sgstAmount;
      totalIgst += it.igstAmount;
      lineSum += it.lineTotal;
    });
    totalQty = round2(totalQty); totalTaxable = round2(totalTaxable);
    totalCgst = round2(totalCgst); totalSgst = round2(totalSgst);
    totalIgst = round2(totalIgst);

    const additionalCharges = round2(charges.reduce((s, c) => s + c.amount, 0));
    const subTotal = round2(lineSum + additionalCharges);

    let netAmount; let roundOff = 0;
    if (roundOffCheckbox.checked) {
      netAmount = Math.round(subTotal);
      roundOff = round2(netAmount - subTotal);
    } else {
      netAmount = round2(subTotal);
    }

    return {
      items: calculated, charges,
      totals: { totalQty, totalTaxable, totalCgst, totalSgst, totalIgst, additionalCharges, subTotal, roundOff, netAmount },
    };
  }

  /* ==========================================================================
     RENDER SUMMARY
     ========================================================================== */

  function recalc() {
    const { items, totals } = calcBill();

    // per-row computed line
    $$('#items-container .item-card').forEach((card, idx) => {
      const it = items[idx];
      const line = card.querySelector('[data-role="row-computed"]');
      if (!line) return;
      if (!it || (!it.productName && !it.quantity && !it.rate)) { line.innerHTML = ''; return; }
      const taxLabel = $('#taxSplit').value === 'igst'
        ? `IGST ${fmtINR(it.igstAmount)}`
        : `CGST ${fmtINR(it.cgstAmount)} + SGST ${fmtINR(it.sgstAmount)}`;
      line.innerHTML =
        `<span>Taxable ${fmtINR(it.taxableAmount)}</span>` +
        `<span>${taxLabel}</span>` +
        `<span class="ml-auto text-[13px] font-black text-teal-900">= ${fmtINR(it.lineTotal)}</span>`;
      const no = card.querySelector('[data-role="row-no"]');
      if (no) no.textContent = `Item ${idx + 1}`;
    });

    $('#item-count').textContent = String(items.length);
    $('#net-preview').textContent = fmtINR(totals.netAmount);

    // desktop summary panel
    const summary = $('#summary-totals');
    if (summary) {
      const isIgst = $('#taxSplit').value === 'igst';
      const rows = [
        ['Items', String(items.length)],
        ['Total Qty', String(totals.totalQty)],
        ['Total Taxable', fmtINR(totals.totalTaxable)],
        isIgst ? ['IGST', fmtINR(totals.totalIgst)] : ['CGST', fmtINR(totals.totalCgst)],
        ...(isIgst ? [] : [['SGST', fmtINR(totals.totalSgst)]]),
        ...totals.additionalCharges ? [['Charges', fmtINR(totals.additionalCharges)]] : [],
        ['Sub Total', fmtINR(totals.subTotal)],
        ['Round Off', totals.roundOff === 0 ? '—' : fmtINR(totals.roundOff)],
      ];
      summary.innerHTML = rows.map(([k, v]) =>
        `<div class="flex items-center justify-between"><span class="text-slate-500">${esc(k)}</span><span class="font-semibold text-slate-800">${esc(v)}</span></div>`
      ).join('') +
      `<div class="mt-2 flex items-center justify-between rounded-xl bg-teal-700 px-3 py-2 text-white">
         <span class="text-xs font-bold uppercase">Net Amount</span>
         <span class="text-base font-black">${esc(fmtINR(totals.netAmount))}</span>
       </div>`;
    }
  }

  /* ==========================================================================
     CHARGES
     ========================================================================== */

  $('#add-charge-btn').addEventListener('click', () => {
    const row = el('div', { class: 'flex gap-2', style: 'display:flex; gap:.5rem', 'data-charge': '' },
      el('input', { type: 'text', 'data-charge-label': '', placeholder: 'Label (e.g. Delivery)', maxlength: 60, class: 'field-input', style: 'flex:1 1 0; min-width:0' }),
      el('input', { type: 'number', 'data-charge-amount': '', placeholder: '0.00', step: '0.01', inputmode: 'decimal', class: 'field-input', style: 'flex:0 0 7rem; width:7rem' }),
      el('button', {
        type: 'button', class: 'rounded-xl px-2 text-slate-400 hover:bg-red-50 hover:text-red-600', 'aria-label': 'Remove charge',
        onclick: () => { row.remove(); recalc(); },
      }, el('i', { 'data-lucide': 'x', class: 'h-4 w-4' })),
    );
    chargesContainer.appendChild(row);
    row.querySelector('[data-charge-amount]').addEventListener('input', recalc);
    refreshIcons();
  });

  $('#taxSplit').addEventListener('change', recalc);
  roundOffCheckbox.addEventListener('change', recalc);

  /* ==========================================================================
     SUBMIT
     ========================================================================== */

  function showItemsError(msg) {
    const box = $('#items-error');
    box.textContent = msg;
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  $('#bill-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#items-error').classList.add('hidden');

    const customer = {
      name: $('#customerName').value.trim(),
      address: $('#customerAddress').value.trim(),
      gstin: $('#customerGstin').value.trim().toUpperCase(),
      phone: $('#customerPhone').value.trim(),
      doctorName: $('#customerDoctor').value.trim(),
      stateCode: $('#customerStateCode').value.trim().toUpperCase(),
    };

    if (!customer.name) {
      toast('Customer name is required', 'error');
      $('#customerName').focus();
      return;
    }

    const rawItems = $$('#items-container .item-card')
      .map(readItemRow)
      .filter((it) => it.productName.trim() || it.quantity || it.rate);

    if (rawItems.length === 0) {
      showItemsError('Add at least one item with product name, quantity and rate.');
      return;
    }
    for (const it of rawItems) {
      if (!it.productName) { showItemsError('Every item needs a product name.'); return; }
      if (!(it.quantity > 0)) { showItemsError(`Item "${it.productName}": quantity must be greater than 0.`); return; }
      if (it.rate === null || it.rate < 0) { showItemsError(`Item "${it.productName}": rate is required.`); return; }
    }

    const payload = {
      invoiceDate: $('#invoiceDate').value || undefined,
      invoiceTime: $('#invoiceTime').value || undefined,
      invoiceType: $('#invoiceType').value,
      paymentMode: $('#paymentMode').value,
      taxMode: $('#taxMode').value,
      taxSplit: $('#taxSplit').value,
      roundOffEnabled: roundOffCheckbox.checked,
      customer,
      items: rawItems,
      charges: readCharges(),
      notes: $('#notes').value.trim(),
    };

    const btn = $('#save-bill-btn');
    btn.disabled = true;
    try {
      const res = await api('/api/bills', { method: 'POST', body: payload });
      toast(res.message || 'Bill saved', 'success');
      location.href = `/bills/view/${res.bill._id}`;
    } catch (err) {
      btn.disabled = false;
      if (err.status === 422 && Array.isArray(err.details)) {
        showItemsError(err.details.map((d) => d.message).join(' · '));
      } else if (err.message !== 'network') {
        showItemsError(err.message);
      } else {
        showItemsError('Network error. Please try again.');
      }
    }
  });

  /* ==========================================================================
     INIT
     ========================================================================== */

  const now = new Date();
  $('#invoiceDate').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  $('#invoiceTime').value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  $('#add-item-btn').addEventListener('click', () => {
    const card = addItemRow();
    card.querySelector('[id$="-name"]').focus();
  });

  addItemRow(); // start with one row
  loadMedicines();
  recalc();
})();
