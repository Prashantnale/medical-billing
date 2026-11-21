'use strict';

/* ==========================================================================
   Medicines page: searchable master list, add/update (upsert by name via
   POST /api/medicines), edit-fill, delete. Rate included alongside MRP.
   ========================================================================== */

(() => {
  const { $, api, toast, esc, refreshIcons } = window.App;

  let medicines = [];
  let editingId = null; // medicine currently loaded into the form

  const form = $('#medicine-form');
  const listEl = $('#medicine-list');
  const metaEl = $('#med-result-meta');
  const errorEl = $('#med-error');
  const saveLabel = $('#med-save-label');
  const heading = $('#form-heading');
  const resetBtn = $('#med-reset-btn');

  const fields = () => ({
    name: $('#med-name').value.trim(),
    composition: $('#med-composition').value.trim(),
    hsnCode: $('#med-hsn').value.trim(),
    mrp: $('#med-mrp').value,
    rate: $('#med-rate').value,
    unit: $('#med-unit').value.trim().toUpperCase(),
    gstRate: $('#med-gst').value,
  });

  function setForm(med) {
    editingId = med ? med._id : null;
    $('#med-name').value = med ? med.name : '';
    $('#med-composition').value = med ? (med.composition || '') : '';
    $('#med-hsn').value = med ? (med.hsnCode || '') : '';
    $('#med-mrp').value = med && med.mrp ? med.mrp : '';
    $('#med-rate').value = med && med.rate ? med.rate : '';
    $('#med-unit').value = med ? (med.unit || '') : '';
    $('#med-gst').value = med && (med.gstRate !== undefined) ? med.gstRate : '';
    heading.childNodes[heading.childNodes.length - 1].textContent = med ? ' Edit Medicine' : ' Add Medicine';
    saveLabel.textContent = med ? 'Update Medicine' : 'Save Medicine';
    resetBtn.classList.toggle('hidden', !med);
    resetBtn.classList.toggle('flex', !!med);
    refreshIcons();
  }

  function matches(m, q) {
    if (!q) return true;
    return [m.name, m.composition, m.hsnCode].some((v) => String(v || '').toLowerCase().includes(q));
  }

  function render() {
    const q = $('#med-search').value.trim().toLowerCase();
    const visible = medicines.filter((m) => matches(m, q));
    metaEl.textContent = `${visible.length} of ${medicines.length} medicine(s)`;

    listEl.innerHTML = '';
    if (visible.length === 0) {
      listEl.innerHTML = `<p class="px-4 py-10 text-center text-sm text-slate-400">${medicines.length === 0 ? 'No medicines saved yet. Add one above or bill it once — it saves itself.' : 'No medicines match your search.'}</p>`;
      return;
    }

    for (const m of visible) {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50';

      const info = document.createElement('div');
      info.className = 'min-w-0 flex-1';
      const bits = [
        m.composition,
        m.hsnCode ? `HSN ${m.hsnCode}` : '',
        m.mrp ? `MRP ${m.mrp}` : '',
        m.rate ? `Rate ${m.rate}` : '',
        m.unit,
        `${m.gstRate}%`,
      ].filter(Boolean).join(' · ');
      info.innerHTML =
        `<p class="truncate text-sm font-semibold text-slate-800">${esc(m.name)}</p>` +
        `<p class="truncate text-xs text-slate-400">${esc(bits)}</p>`;

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'shrink-0 rounded-lg p-2 text-slate-400 hover:bg-teal-50 hover:text-teal-700';
      editBtn.setAttribute('aria-label', `Edit ${m.name}`);
      editBtn.innerHTML = '<i data-lucide="pencil" class="h-4 w-4"></i>';
      editBtn.addEventListener('click', () => {
        setForm(m);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        $('#med-name').focus();
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600';
      delBtn.setAttribute('aria-label', `Delete ${m.name}`);
      delBtn.innerHTML = '<i data-lucide="trash-2" class="h-4 w-4"></i>';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Remove "${m.name}" from saved medicines?`)) return;
        try {
          await api(`/api/medicines/${m._id}`, { method: 'DELETE' });
          toast('Medicine removed', 'success');
          if (editingId === m._id) setForm(null);
          load();
        } catch { /* toast already shown by api() */ }
      });

      row.append(info, editBtn, delBtn);
      listEl.appendChild(row);
    }
    refreshIcons();
  }

  async function load() {
    try {
      const data = await api('/api/medicines', { silent: true });
      medicines = data.medicines || [];
      render();
    } catch {
      listEl.innerHTML = '<p class="px-4 py-10 text-center text-sm text-slate-400">Could not load medicines.</p>';
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.add('hidden');
    const payload = fields();
    if (!payload.name) {
      errorEl.textContent = 'Medicine name is required.';
      errorEl.classList.remove('hidden');
      return;
    }
    const btn = $('#med-save-btn');
    btn.disabled = true;
    try {
      await api('/api/medicines', { method: 'POST', body: payload });
      toast(editingId ? 'Medicine updated' : 'Medicine saved', 'success');
      setForm(null);
      load();
    } catch (err) {
      if (err.message !== 'network') {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
      }
    } finally {
      btn.disabled = false;
    }
  });

  resetBtn.addEventListener('click', () => setForm(null));
  $('#med-search').addEventListener('input', () => render());

  load();
})();
