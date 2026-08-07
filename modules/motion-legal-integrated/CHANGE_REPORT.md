# Change report - plain language

## Files added

**Frontend (drop into the ARC site root)**
- `23_Motion_and_Legal.html` - the module page: ARC shared header, active-case
  header, ten tabs. No navigation of its own.
- `arc_motion_legal.css` - ARC charcoal/gold styling, Playfair Display headings,
  DM Sans body, responsive desktop and tablet.
- `arc_motion_legal.js` - all ten tabs, active-case binding, drafting sequence,
  clickable citations.
- `arc_courtlistener_client.js` - browser client that calls the ARC service. No key.
- `arc_motion_templates.js` - the 154-entry motion bank plus the motion scaffold.
- `arc_legal_authority_store.js` - authority status vocabulary, weight rules, warnings.

**Backend**
- `worker/legal_worker.mjs` - all `/legal-api/*` routes, Access auth, roles, case
  enforcement, filing review, exports.
- `worker/arc_courtlistener_client.mjs` - CourtListener v4 client preserving
  Court -> Docket -> Cluster -> Opinion, with field selection.
- `worker/providers.mjs` - Claude drafting gateway and citation-fabrication rejection.
- `worker/lib.mjs` - dependency-free ZIP and DOCX writers, Access JWT validation,
  streaming SHA-256, filename sanitizer.
- `worker/schema.sql` - D1 migration, 14 tables.
- `wrangler.toml`, `package.json`.

**Tests and docs**
- `tests/legal.test.mjs` (22 tests), `tests/harness.mjs` (D1 and R2 emulation).
- `INTEGRATION.md`, `SECRETS.md`, `DATA_MIGRATION.md`, `LIMITATIONS.md`, this report.

## Files removed (the entire standalone application)
- `server/server.mjs`, `server/db.mjs`, `server/services/*` - Express and local SQLite.
- `app/index.html`, `app/assets/*` - the standalone SPA with its own sidebar and
  case picker.
- `START_ARC.bat`, `.env.example`, `INSTALL.md` - localhost launcher and setup.
- `data/`, `exports/` - local filesystem storage.
- Its `cases`, `charges`, `documents`, `people`, `facts`, `fact_conflicts`, and
  `timeline_events` tables. ARC already owns all of that.

## Features preserved (checked one by one before removal)
Motion bank, motion recommendations, IRAC workflow, authority verification
warnings, motion drafting, exhibits, proposed orders, certificates of service,
attorney approval requirement, filing checks, version history, audit history,
DOCX/HTML/ZIP exports, cross-case contamination protections, and the test suite.
Each moved to D1/R2 with its safeguard intact or strengthened.

## Features deliberately changed
- **Attorney profiles** became `legal_users` with real roles, because approval now
  needs an authenticated identity rather than a typed name.
- **PDF export** was dropped. Workers have no PDFKit; the module ships DOCX plus
  print-ready attorney HTML (browser "Print to PDF" produces the filed page).
  See LIMITATIONS.
- **Approval** now requires an Access identity with an approving role, and it is
  version-bound: any later edit removes it automatically.
- **Facts** are no longer stored here. Motion text carries `[FACT:id]` tags that
  resolve to the ARC case record.

## Security changes
- Cloudflare Access JWT validated on every route (signature, `aud`, `exp`). No
  fallback user, no dev bypass.
- Unknown identities are inserted as `pending` and refused. They are never
  auto-created as investigators.
- Case assignment enforced on every read and write.
- CORS restricted to an explicit origin allowlist.
- Provider keys are Worker secrets only. Tests assert no key appears in any
  frontend file or in a filing ZIP.
- Provider logging records route, actor, case, and sizes. Never keys, query text,
  or raw prompts.
- Uploads: type allow-list, 250 MB cap, filename sanitized against traversal,
  SHA-256 recorded at intake, R2 keys namespaced per case.
- Per-identity rate limiting; 2 MB JSON body cap.
- Filing ZIPs strip internal `[FACT:]` and `[AUTH:]` tags, attorney notes, and
  anything belonging to another case.

## Database changes
D1 replaces SQLite. Fourteen tables: `legal_users`, `case_assignments`,
`legal_issues`, `cl_courts`, `cl_dockets`, `cl_clusters`, `cl_opinions`,
`authorities`, `motions`, `motion_versions`, `irac_blocks`, `legal_files`,
`legal_audit`, `provider_log`.

The big shift is the authority model: an authority now stores all four
CourtListener identifiers plus the opinion type, so a dissent and the lead
opinion in one case are separate records that can never be merged. Statuses moved
from six to eight: Imported, Located, Pinpoint Needed, Verified, Persuasive,
Controlling, Superseded, Do Not Use.

## Remaining incomplete items
See LIMITATIONS.md. In short: PDF generation, R2 multipart for very large
uploads, a durable rate limiter, CourtListener citation-validation endpoints,
and the two ARC bridge methods that your platform side must supply.
