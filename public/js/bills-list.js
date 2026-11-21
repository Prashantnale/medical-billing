'use strict';

/* ==========================================================================
   Previous bills: debounced search, filters, pagination, responsive rendering
   (table on desktop, cards on mobile). One API call per state change.
   ========================================================================== */

(() => {
  const { $, api, esc, fmtINR, fmtDate, el, refreshIcons, toast } = window.App;

  const tbody = $('#bills-tbody');
  const cards = $('#bills-cards');
  const meta = $('#result-meta');
  const pagination = $('#pagination');
  if (!tbody || !cards) return;

  const state = { page: 1, q: '', from: '', to: '', status: 'all' };
  let requestSeq = 0;

  function readFilters() {
    state.q = $('#search-input').value.trim();
    state.from = $('#from-date').value;
    state.to = $('#to-date').value;
    state.status = $('#status-filter').value;
  }

  function emptyState(message) {
    return el('div', { class: 'flex flex-col items-center gap-2 px-4 py-12 text-center' },
      el('i', { 'data-lucide': 'inbox', class: 'h-8 w-8 text-slate-300' }),
      el('p', { class: 'text-sm text-slate-400' }, message));
  }

  function statusBadge(status) {
    return status === 'cancelled'
      ? '<span class="inline-block rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600 ring-1 ring-red-200">Cancelled</span>'
      : '<span class="inline-block rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase text-teal-700 ring-1 ring-teal-200">Active</span>';
  }

  function render(data) {
    const { items, total, page, pages } = data;

    meta.textContent = total === 0 ? 'No bills found' : `${total} bill(s) · page ${page} of ${pages}`;

    /* ----- desktop rows ----- */
    tbody.innerHTML = '';
    if (items.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 7;
      td.appendChild(emptyState('No bills match your filters. Try clearing them.'));
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      for (const b of items) {
        const viewUrl = `/bills/view/${b._id}`;
        const tr = el('tr', { class: 'transition hover:bg-slate-50' },
          el('td', { class: 'px-4 py-3' },
            el('a', { href: viewUrl, class: 'font-bold text-teal-700 hover:underline' }, b.invoiceNumber),
            el('span', { class: 'ml-2 text-[10px] font-semibold uppercase text-slate-400' }, b.invoiceType)),
          el('td', { class: 'max-w-[180px] truncate px-4 py-3 font-medium text-slate-700' }, b.customer.name),
          el('td', { class: 'px-4 py-3 text-slate-500' }, `${fmtDate(b.invoiceDate)}${b.invoiceTime ? ' · ' + b.invoiceTime : ''}`),
          el('td', { class: 'px-4 py-3 text-right text-slate-500' }, fmtINR(b.summary.totalTaxable)),
          el('td', { class: 'px-4 py-3 text-right font-bold text-slate-800' }, fmtINR(b.summary.netAmount)),
          el('td', { class: 'px-4 py-3 text-center', html: statusBadge(b.status) }),
          el('td', { class: 'px-4 py-3 text-right' },
            el('div', { class: 'flex justify-end gap-1' },
              el('a', { href: viewUrl, class: 'rounded-lg p-2 text-slate-400 hover:bg-teal-50 hover:text-teal-700', 'aria-label': `View ${b.invoiceNumber}`, title: 'View / Print' },
                el('i', { 'data-lucide': 'eye', class: 'h-4 w-4' })),
              el('a', { href: `/api/bills/${b._id}/pdf?download=1`, class: 'rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700', 'aria-label': `Download PDF ${b.invoiceNumber}`, title: 'Download PDF' },
                el('i', { 'data-lucide': 'file-down', class: 'h-4 w-4' })))),
        );
        tbody.appendChild(tr);
      }
    }

    /* ----- mobile cards ----- */
    cards.innerHTML = '';
    if (items.length === 0) {
      cards.appendChild(emptyState('No bills match your filters.'));
    } else {
      for (const b of items) {
        const card = el('a', {
          href: `/bills/view/${b._id}`,
          class: 'block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition active:scale-[0.99]',
        },
          el('div', { class: 'flex items-start justify-between gap-2' },
            el('div', { class: 'min-w-0' },
              el('p', { class: 'truncate text-sm font-bold text-slate-800' }, b.invoiceNumber),
              el('p', { class: 'mt-0.5 truncate text-xs text-slate-500' }, `${b.customer.name} · ${fmtDate(b.invoiceDate)}${b.invoiceTime ? ' ' + b.invoiceTime : ''}`)),
            el('div', { class: 'shrink-0 text-right' },
              el('p', { class: 'text-sm font-black text-slate-800' }, fmtINR(b.summary.netAmount)),
              el('div', { class: 'mt-0.5', html: statusBadge(b.status) }))),
        );
        cards.appendChild(card);
      }
    }

    /* ----- pagination (box only when navigable) ----- */
    pagination.innerHTML = '';
    pagination.className = '';
    if (pages > 1) {
      pagination.className = 'flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200';
      const prevBtn = el('button', {
        class: 'flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40',
        onclick: () => { state.page = Math.max(1, page - 1); load(); },
      }, el('i', { 'data-lucide': 'chevron-left', class: 'h-4 w-4' }), 'Prev');
      prevBtn.disabled = page <= 1;

      const nextBtn = el('button', {
        class: 'flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40',
        onclick: () => { state.page = Math.min(pages, page + 1); load(); },
      }, 'Next', el('i', { 'data-lucide': 'chevron-right', class: 'h-4 w-4' }));
      nextBtn.disabled = page >= pages;

      pagination.append(prevBtn, el('span', { class: 'text-xs font-medium text-slate-400' }, `Page ${page} / ${pages}`), nextBtn);
    }

    refreshIcons();
  }

  async function load() {
    const seq = ++requestSeq;
    const params = new URLSearchParams({ page: String(state.page), limit: '20' });
    if (state.q) params.set('q', state.q);
    if (state.from) params.set('from', state.from);
    if (state.to) params.set('to', state.to);
    if (state.status !== 'all') params.set('status', state.status);

    try {
      const data = await api(`/api/bills?${params}`, { silent: true });
      if (seq !== requestSeq) return; // stale response
      render(data);
    } catch {
      if (seq === requestSeq) {
        meta.textContent = 'Failed to load bills';
        toast('Could not load bills. Check your connection.', 'error');
      }
    }
  }

  /* ----- events ----- */
  const debouncedSearch = window.App.debounce(() => { state.page = 1; readFilters(); load(); }, 300);
  $('#search-input').addEventListener('input', debouncedSearch);

  ['#from-date', '#to-date', '#status-filter'].forEach((sel) => {
    $(sel).addEventListener('change', () => { state.page = 1; readFilters(); load(); });
  });

  $('#clear-filters').addEventListener('click', () => {
    $('#search-input').value = '';
    $('#from-date').value = '';
    $('#to-date').value = '';
    $('#status-filter').value = 'all';
    Object.assign(state, { page: 1, q: '', from: '', to: '', status: 'all' });
    load();
  });

  load();
})();
