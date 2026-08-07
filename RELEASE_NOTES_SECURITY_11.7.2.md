# ARC 11.7.2 Production Hardening

- Removed contradictory Cloudflare Pages Cache-Control rules.
- Added HSTS, CSP, and restrictive browser permissions headers.
- Activated bundled DOMPurify through `arc_security.js` for untrusted/generated rich HTML boundaries.
- Sanitized Notebook SVG mind maps and AI review rich output; fail-closed fallback renders unsafe rich content as text/empty SVG.
- AI and Research Workers now reject disallowed origins with HTTP 403 before authentication/provider execution.
- Motion & Legal tests now import the canonical deployed Legal Worker. A mirror-equality release gate prevents worker/test drift.
- Added DEPLOY_PAGES byte-sync release gate.
- Preserved the 11.7.1 New Case → R2/D1 → Notebook handoff, automatic document sync, image extraction, and ARC branding fixes.
