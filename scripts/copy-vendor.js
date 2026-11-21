'use strict';

/**
 * Copies the lucide UMD icon bundle from node_modules into public/js/vendor
 * so the app loads it as a first-party asset (works with a strict CSP,
 * no CDN required). Runs on `npm install` via the postinstall hook.
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js');
const vendorDir = path.join(__dirname, '..', 'public', 'js', 'vendor');
const dest = path.join(vendorDir, 'lucide.min.js');

try {
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('[vendor] lucide.min.js copied to public/js/vendor');
} catch (err) {
  console.warn('[vendor] Could not copy lucide bundle:', err.message);
}
