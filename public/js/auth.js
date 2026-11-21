'use strict';

/* Register + Login form handling. */

(() => {
  const { api } = window.App;

  /* ---------- register ---------- */
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('form-error');
      const btn = document.getElementById('register-submit');
      errBox.classList.add('hidden');

      const payload = {
        name: registerForm.name.value.trim(),
        email: registerForm.email.value.trim(),
        password: registerForm.password.value,
        confirmPassword: registerForm.confirmPassword.value,
      };

      if (!payload.name || !payload.email || !payload.password) {
        errBox.textContent = 'All fields are required.';
        errBox.classList.remove('hidden');
        return;
      }
      if (payload.password !== payload.confirmPassword) {
        errBox.textContent = 'Passwords do not match.';
        errBox.classList.remove('hidden');
        return;
      }

      btn.disabled = true;
      try {
        await api('/api/auth/register', { method: 'POST', body: payload });
        location.href = '/settings'; // first launch -> set up the shop profile
      } catch (err) {
        errBox.textContent = err.message === 'network' ? 'Network error. Please try again.' : err.message;
        errBox.classList.remove('hidden');
        btn.disabled = false;
      }
    });
  }

  /* ---------- login ---------- */
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('form-error');
      const btn = document.getElementById('login-submit');
      errBox.classList.add('hidden');

      btn.disabled = true;
      try {
        await api('/api/auth/login', {
          method: 'POST',
          body: { email: loginForm.email.value.trim(), password: loginForm.password.value },
        });
        const params = new URLSearchParams(location.search);
        const returnTo = params.get('returnTo');
        location.href = returnTo && returnTo.startsWith('/') ? returnTo : '/dashboard';
      } catch (err) {
        errBox.textContent = err.message === 'network' ? 'Network error. Please try again.' : err.message;
        errBox.classList.remove('hidden');
        btn.disabled = false;
      }
    });
  }
})();
