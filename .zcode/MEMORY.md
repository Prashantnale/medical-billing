# Project Memory

## medical-billing (D:\Personal-Working\medical-billing)
- Single-user GST billing app: Express + Mongoose + EJS + Tailwind v4 (built via `npm run build:css`) + Vanilla JS + pdfkit. No frontend framework (hard user requirement).
- User runs local MongoDB on 127.0.0.1:27017 (managed via MongoDB Compass); dev DB `medical-billing`, test DB `medical-billing-test`. MONGODB_URI lives in `.env` (never hardcode).
- Smoke-test data exists in `medical-billing` DB: owner account prashant@medstore.local / Owner@1234, shop "Sai Medical & General Store", bills SM-0001..SM-0003, medicines master (PAN-O, Dolo 650). Wipe collections for a fresh start.
- Invoice format matches the user's reference (Allied Softech style): A4 template + pdfService mirror it — 3-column header, Com/HSN/Qty x Unit columns, %CGST/%SGST split, GROSS/ADD/LESS/NET, words bar. Reference PDF was at C:\Users\prash\Downloads\VAISHANVI MED3.pdf.
- Medicine master: separate /medicines page (add/update upsert-by-name, edit-fill, delete, search); auto-saved on every bill create; fields incl. rate (default selling rate that auto-fills bills). Bill form unit is free text (TAB/CAP...) printed as qty x unit.
- IAB quirks: role-locator clicks on dynamically-added aria-label buttons can time out — use cua.click with getBoundingClientRect coordinates as fallback; PDF viewer tab screenshots time out (verify PDFs via file Read instead).
- Tests: `npm test` (43 tests, node:test). Integration tests need `NODE_ENV=test` (rate limiters skip in test env) and use their own DB.
- Plain `node server.js` does NOT reload backend code — restart the background server task after editing backend files (EJS views reload automatically in dev).
- User communicates in Marathi/Hinglish mixed with English; technical replies in English are fine.
