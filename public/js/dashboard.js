'use strict';

/* Dashboard: the "Refresh" card simply reloads the page (no polling). */

(() => {
  const refresh = document.getElementById('refresh-stats');
  if (refresh) {
    refresh.setAttribute('href', '#');
    refresh.addEventListener('click', (e) => {
      e.preventDefault();
      location.reload();
    });
  }
})();
