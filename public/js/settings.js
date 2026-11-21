'use strict';

/* ==========================================================================
   Business settings: collect form -> PUT /api/settings, logo upload as
   data URL, change password -> POST /api/auth/change-password.
   ========================================================================== */

(() => {
  const { $, api, toast } = window.App;

  /* ---------------- logo ---------------- */
  const logoInput = $('#logo-input');
  const logoPreview = $('#logo-preview');
  const logoField = $('#logoDataUrl');
  const PLACEHOLDER = logoPreview.src;

  logoInput.addEventListener('change', () => {
    const file = logoInput.files[0];
    if (!file) return;
    if (file.size > 150 * 1024) {
      toast('Logo too large. Please use an image under 150 KB.', 'error');
      logoInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      logoField.value = String(reader.result || '');
      logoPreview.src = logoField.value;
      toast('Logo loaded. Press "Save Settings" to apply.', 'info');
    };
    reader.onerror = () => toast('Could not read the image file.', 'error');
    reader.readAsDataURL(file);
  });

  $('#logo-remove').addEventListener('click', () => {
    logoField.value = '';
    logoPreview.src = PLACEHOLDER;
    logoInput.value = '';
  });

  /* ---------------- save settings ---------------- */
  $('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = $('#settings-error');
    errBox.classList.add('hidden');

    const payload = {
      businessName: $('#businessName').value.trim(),
      gstin: $('#gstin').value.trim().toUpperCase(),
      pan: $('#pan').value.trim().toUpperCase(),
      drugLicenseNo: $('#drugLicenseNo').value.trim(),
      phone: $('#phone').value.trim(),
      email: $('#email').value.trim(),
      address: {
        addressLine1: $('#addressLine1').value.trim(),
        addressLine2: $('#addressLine2').value.trim(),
        city: $('#city').value.trim(),
        state: $('#state').value.trim(),
        stateCode: $('#stateCode').value.trim().toUpperCase(),
        pincode: $('#pincode').value.trim(),
      },
      invoicePrefix: $('#invoicePrefix').value.trim(),
      invoicePadding: Number($('#invoicePadding').value),
      nextInvoiceNumber: Number($('#nextInvoiceNumber').value),
      defaultTaxMode: $('#defaultTaxMode').value,
      defaultRoundOff: $('#defaultRoundOff').checked,
      termsText: $('#termsText').value.trim(),
      thankYouText: $('#thankYouText').value.trim(),
      logoDataUrl: logoField.value,
    };

    if (!payload.businessName) {
      errBox.textContent = 'Business name is required.';
      errBox.classList.remove('hidden');
      return;
    }

    const btn = $('#settings-save-btn');
    btn.disabled = true;
    try {
      await api('/api/settings', { method: 'PUT', body: payload });
      toast('Settings saved', 'success');
      setTimeout(() => location.reload(), 700); // refresh topbar business name
    } catch (err) {
      btn.disabled = false;
      errBox.textContent = err.message === 'network' ? 'Network error. Please try again.' : err.message;
      errBox.classList.remove('hidden');
    }
  });

  /* ---------------- change password ---------------- */
  $('#password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = $('#password-error');
    errBox.classList.add('hidden');

    const currentPassword = $('#currentPassword').value;
    const newPassword = $('#newPassword').value;
    const confirmPassword = $('#confirmPassword').value;

    if (!currentPassword || !newPassword) {
      errBox.textContent = 'Both password fields are required.';
      errBox.classList.remove('hidden');
      return;
    }
    if (newPassword !== confirmPassword) {
      errBox.textContent = 'New passwords do not match.';
      errBox.classList.remove('hidden');
      return;
    }

    const btn = $('#password-save-btn');
    btn.disabled = true;
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword, confirmPassword } });
      toast('Password updated', 'success');
      $('#password-form').reset();
    } catch (err) {
      if (err.message !== 'network') {
        errBox.textContent = err.message;
        errBox.classList.remove('hidden');
      }
    } finally {
      btn.disabled = false;
    }
  });
})();
