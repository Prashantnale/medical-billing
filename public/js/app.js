'use strict';

/* ==========================================================================
   Core shared frontend module (Vanilla ES6+, no framework).
   Exposes window.App: api fetch wrapper, toast, debounce, money/date format,
   Lucide icon refresh, sidebar + logout wiring.
   ========================================================================== */

const App = (() => {
  /* ---------------- money formatting (Indian grouping) ---------------- */
  function fmtINR(value) {
    const n = Number(value) || 0;
    const neg = n < 0;
    const [i, d] = Math.abs(n).toFixed(2).split('.');
    const last3 = i.slice(-3);
    const rest = i.slice(0, -3);
    const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
    return (neg ? '-' : '') + '₹' + grouped + '.' + d;
  }

  function fmtINRPlain(value) {
    return fmtINR(value).replace('₹', '');
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(dateLike) {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  /* round to 2 decimals without float drift (paise-safe for preview) */
  function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  /* ---------------- debounce ---------------- */
  function debounce(fn, wait = 300) {
    let t;
    return function debounced(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /* ---------------- toast ---------------- */
  function toast(message, type = 'success', ms = 3200) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const colors = {
      success: 'bg-teal-700',
      error: 'bg-red-600',
      info: 'bg-slate-800',
    };
    const el = document.createElement('div');
    el.className = `flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-xl transition-all duration-200 ${colors[type] || colors.info}`;
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.textContent = message;
    root.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 220);
    }, ms);
  }

  /* ---------------- API wrapper ---------------- */
  async function api(url, { method = 'GET', body, silent = false } = {}) {
    const options = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, options);
    } catch {
      if (!silent) toast('Network error. Check your connection.', 'error');
      throw new Error('network');
    }

    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }

    if (!res.ok) {
      if (res.status === 401 && !location.pathname.startsWith('/login')) {
        location.href = '/login';
        throw new Error('unauthenticated');
      }
      if (!silent) toast(data.error || `Request failed (${res.status})`, 'error');
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      err.details = data.details;
      throw err;
    }
    return data;
  }

  /* ---------------- icons ---------------- */
  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  /* ---------------- DOM helpers ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') node.value = v;
      else node.setAttribute(k, v);
    }
    for (const child of children) {
      if (child === null || child === undefined) continue;
      node.append(child instanceof Node ? child : document.createTextNode(child));
    }
    return node;
  }

  /* ---------------- escape html ---------------- */
  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  /* ---------------- shell wiring (runs on every page) ---------------- */
  function initShell() {
    // Sidebar (mobile)
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const openBtn = document.getElementById('sidebar-open');
    const closeBtn = document.getElementById('sidebar-close');

    const setSidebar = (open) => {
      if (!sidebar || !overlay) return;
      sidebar.classList.toggle('-translate-x-full', !open);
      overlay.classList.toggle('hidden', !open);
      document.body.style.overflow = open && window.innerWidth < 768 ? 'hidden' : '';
    };

    openBtn?.addEventListener('click', () => setSidebar(true));
    closeBtn?.addEventListener('click', () => setSidebar(false));
    overlay?.addEventListener('click', () => setSidebar(false));
    window.addEventListener('resize', () => { if (window.innerWidth >= 768) setSidebar(false); });

    // Logout (topbar + mobile drawer)
    $$('.logout-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api('/api/auth/logout', { method: 'POST', silent: true });
        } finally {
          location.href = '/login';
        }
      });
    });

    // Password visibility toggles
    $$('button[data-toggle="password"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.innerHTML = show
          ? '<i data-lucide="eye-off" class="h-5 w-5"></i>'
          : '<i data-lucide="eye" class="h-5 w-5"></i>';
        refreshIcons();
      });
    });

    refreshIcons();
  }

  document.addEventListener('DOMContentLoaded', initShell);

  return { api, toast, debounce, fmtINR, fmtINRPlain, fmtDate, round2, $, $$, el, esc, refreshIcons };
})();

window.App = App;
