'use strict';

/* ==========================================================================
   Bill details page: A4/80mm preview toggle, print, cancel-with-audit.
   PDF download is a plain link to /api/bills/:id/pdf?download=1.
   ========================================================================== */

(() => {
  const { $, api, toast } = window.App;

  const wraps = { a4: $('#invoice-wrap-a4'), thermal: $('#invoice-wrap-thermal') };

  // bill id for API calls
  window.billId = $('#print-area')?.dataset.billId || '';

  /* ----- @page rule swap: A4 vs 80mm receipt paper ----- */
  const PAGE_RULES = {
    a4: '@page { size: A4; margin: 8mm; }',
    thermal: '@page { size: 80mm auto; margin: 3mm; }',
  };
  const pageStyle = document.getElementById('print-page-style');

  /* ----- format toggle ----- */
  function setFormat(format) {
    for (const [key, wrap] of Object.entries(wraps)) {
      if (wrap) wrap.classList.toggle('hidden', key !== format);
    }
    if (pageStyle) pageStyle.textContent = PAGE_RULES[format] || PAGE_RULES.a4;
    document.querySelectorAll('.format-btn').forEach((btn) => {
      const active = btn.dataset.format === format;
      btn.classList.toggle('bg-teal-700', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('text-slate-600', !active);
      btn.setAttribute('aria-pressed', String(active));
    });
    document.body.dataset.printFormat = format;
  }

  document.querySelectorAll('.format-btn').forEach((btn) => {
    btn.addEventListener('click', () => setFormat(btn.dataset.format));
  });
  setFormat('a4');

  /* ----- print (uses window.print with the dedicated print stylesheet) ----- */
  $('#print-btn')?.addEventListener('click', () => {
    // The visible invoice wrap is the one printed; print.css handles chrome hiding.
    setTimeout(() => window.print(), 50);
  });

  /* ----- cancel with audit ----- */
  const modal = $('#cancel-modal');
  const openModal = () => {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  };
  const closeModal = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    $('#cancel-error').classList.add('hidden');
  };

  $('#cancel-bill-btn')?.addEventListener('click', openModal);
  $('#cancel-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  $('#cancel-modal-confirm').addEventListener('click', async () => {
    const reason = $('#cancel-reason').value.trim();
    const errBox = $('#cancel-error');
    if (!reason) {
      errBox.textContent = 'Please enter a reason (required for audit).';
      errBox.classList.remove('hidden');
      return;
    }
    const btn = $('#cancel-modal-confirm');
    btn.disabled = true;
    try {
      await api(`/api/bills/${window.billId}/cancel`, { method: 'POST', body: { reason } });
      toast('Bill cancelled', 'success');
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      btn.disabled = false;
      if (err.message !== 'network') {
        errBox.textContent = err.message;
        errBox.classList.remove('hidden');
      }
    }
  });
})();
