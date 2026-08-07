# ARC Investigation Development Module

## Starting-point review

- Main module: `21_Investigation_Development.html` is the MVP entry point because the old `09_Intelligence_Board.html` is useful for visual linkage work but contains hard-coded sample intelligence and a separate command-chat pattern.
- Reusable components: `arc_report_header.js`, `arc_unified_bridge.js`, `arc_report_assets.js`, the report workspace source records, and the Intelligence Board's source-controlled card/review concept.
- Conflicts corrected: no bundled case facts, no frontend API key requirement, no separate case identity, and no authoritative browser-only storage. Local storage is used only as an unsynced recovery draft.
- Existing data structures: shared case context from `ARCUnified.getCase()`, report inbox records, report assets, intake extractions, uploaded file metadata, and audit records.
- Integration adapters: `/api/investigation-workspace?caseId=...` stores the workspace under the same authenticated case; `scripts/serve.js` routes it in local development; `index.html` registers the dashboard module.
- Before future feature expansion: wire the hosted Cloudflare Worker/D1 deployment to expose the same endpoint contract, then replace heuristic extraction with server-side model calls that return cited JSON suggestions.

## Case data contract

Every saved workspace record includes the active `caseId`. AI-assisted or heuristic results remain suggestions until an investigator edits and approves them.

The original source text/metadata is preserved separately from extracted entities, events, issues, leads, and tasks.

Large files remain outside this module. It reads metadata and extracted text from the existing ARC intake/report-asset systems and should continue to store large binary evidence in R2 or the existing upload store.

## Dashboard integration

The ARC shell now lists **Lead Development** and routes the Analysis workflow stage to `21_Investigation_Development.html`.
