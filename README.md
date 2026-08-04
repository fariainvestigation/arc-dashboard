# ARC Integrated System

ARC Integrated System is a browser-based investigations, case analysis, and defense-support workspace. It connects the ARC Notebook, report generation, legal research, motion drafting, discovery review, chain-of-custody analysis, timeline review, intelligence analysis, investigator workspace, and the integrated Defense Map through one case-aware shell.


## v11.4 corrected feature-preserving release

This release is based on the complete pre-v11.1 workflow and keeps the v11.1 product controls without removing earlier module integrations.

Restored and verified:

- ARC Notebook publishes the shared case brief after report, mind-map, and deck generation.
- Legal Research displays the case-specific orientation briefing and can send reviewed material to Report Inbox.
- Case Dashboard is the first shell module and creates the shared active case before Notebook.
- Legal Research includes Knowledge Bank v1 and an investigator Legal Research Dashboard.
- Discovery Review (Phase 1) replaces the manual Discovery Gap Map with library intake, SHA-256 source records, cited case assistant, gap approval, and Discovery Gap Report transfer to Report Inbox.
- Timeline Discrepancy builds a source-attributed timeline from the shared Notebook report and displays an empty state instead of sample facts when no chronology exists.
- Intelligence Analysis receives the Notebook report as a synchronized source document.
- Final Report printing uses an isolated report canvas instead of printing the application interface.
- The Criminal Intelligence Board is available as workspace tab **Intelligence Board** (`09_Intelligence_Board.html`) and receives shared case context.
- The Suite Pro Investigation Map is available as workspace tab **Investigation Map** (`map/index.html`) with geocoding, routing, evidence plotting, and timeline playback through the local server APIs.
- Reports now includes dashboards for Pictures, Videos, Transcripts, Translations, Full Motions, Report Inbox, Report Review & Approval, and the Full Report Builder as the final tab.
- Stage 6 of the Full Report Builder now opens a separate case-scoped attorney report with six primary groups and 30 optional sections; unused sections are hidden automatically.
- The Investigation Map includes persistent light/dark modes, reset view, fullscreen, legend, and visible service status.
- Every module receives shared Edit, Print, and Download HTML controls unless it provides its own page controls.


## Hosted deployment (GitHub + Vercel + Cloudflare)

The local server routes are also available as Vercel serverless functions under `api/`, so the hosted site at `https://www.arcdefensereport.com/` can create cases, store report assets, upload files, geocode, route, and run Gemini extraction rather than serving static pages only.

Connect an Upstash Redis / Vercel KV store to the project so `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set. Without KV, hosted writes return 503 instead of silently using ephemeral `/tmp` storage (override only with `ARC_ALLOW_EPHEMERAL_STORAGE=1`). Check `/api/health` for `storage.durable`. Hosted uploads are limited to roughly 4 MB per file; use the local server for larger evidence. Set `GEMINI_API_KEY` for `/api/ai/extract` and `/api/gemini-board-command`.

See `DEPLOY.md` for the full push, environment, domain, and verification steps.

## Run locally

1. Install Node.js 20 or newer.
2. From this directory, run `npm run serve`.
3. Open `http://127.0.0.1:8777/`.
4. Open **Investigation Map** for Leaflet evidence reconstruction (requires the local server for geocoding/routing APIs).

The browser interface is static, but the complete application requires the included Node server. GitHub Pages can host only a limited interface preview and must not be used for case operations because it cannot run the `/api` routes for protected uploads, case files, mapping, or Gemini extraction. Use HTTP rather than `file://`; browser security rules can restrict storage, workers, downloads, PDF rendering, and cross-page communication for local files.

The included server binds to `127.0.0.1` for local development. Before any public deployment, add authenticated users, administrator authorization, a production database and private object storage, TLS, server-side secrets, backups, audit retention, and case-level access controls. Until those controls exist, keep the GitHub repository private and do not expose this server to the public internet.

## Shared case and report workflow

1. Enter or open the matter in ARC Notebook.
2. Use **Share Case** so each local module receives the same case identifier, matter details, investigator, court, docket, and other available context.
3. Review evidence and findings in the source module. Analytical connections, including cited connections, remain pending until an investigator approves or excludes them.
4. Use **Export Report** on a report page.
5. Choose **#4 ARC Generator** to continue building the report or **#5 Edit PDF** to edit the report beside a live print/PDF preview.
6. Report Inbox stores one current report series per module, report type, and case. New transfers replace the prior series entry as a revision rather than creating duplicates.
7. Open **Stage 6 - Final Report** in the Full Report Builder and select **Open Attorney Report**. Only the active `caseId`, approved module reports, approved report assets, and explicitly included builder media are transferred.
8. Download the attorney report as self-contained HTML or structured JSON. Search, section navigation, light/dark modes, print, local authorized edits, and per-section HTML downloads remain available.

Report generation is record-bound. Prompts must use supplied case facts and source excerpts only, preserve uncertainty and conflicts, distinguish facts from allegations and analysis, and identify missing information instead of inventing it.



## Product workflow in v11.4

The integrated shell now keeps the active matter visible while the investigator moves through six controlled stages:

1. **Case Setup** — matter, docket, client, investigator, status, and shared case context.
2. **Evidence** — source intake, hashing, image selection, exhibit crops, and provenance.
3. **Analysis** — legal research, motions, discovery gaps, chain review, timeline review, intelligence, and Defense Map.
4. **Investigator Review** — centralized pending, approved, rejected, revised, citation, hash, and placeholder review.
5. **Report Builder** — one revision series per case and report type.
6. **Final Export** — release checklist, ARC Generator routing, Edit PDF routing, PDF, Word, print, and functional HTML.

New report series begin as **Pending**. A reviewer must identify themselves before approval or rejection. A substantive change to an approved report automatically changes its status to **Revised** and removes the prior approval. Edit PDF accepts only approved report series.

The Final Review checklist checks case identity, approval status, source references, selected exhibits, evidence hashes, placeholders, rejected material, report version, and final reviewer identity. These checks supplement—not replace—manual verification against the source record.

## Report Review & Approval

Open **Report Review & Approval** from the module tabs or select stage 4 in the workflow bar. The dashboard provides:

- Report-level approval and rejection controls
- Pending, revised, approved, and rejected totals
- Detected citation, hash, and placeholder issues
- Final release blockers and advisory warnings
- Direct report export after approval
- Audit records for saves, reviews, routing, finalization, PDF, Word, HTML, and print actions

Automated detection is intentionally conservative. Investigators and counsel remain responsible for validating every factual statement, quotation, citation, exhibit, legal authority, and conclusion.

## Final attorney report

`19_Final_Client_Report.html` is an output template, not another main-system tab. The Full Report Builder remains the last shell tab and creates the attorney report from its final proofing stage.

- The full 30-section structure is retained under Overview, Investigation, Evidence, Analysis, Legal & Strategy, and Deliverables.
- Executive Dashboard, Sources & Citations, and Review & Certification remain visible; every other section appears only when the active case contains related content.
- Imported Review Center records must be approved and match the active `caseId` exactly. Report workspace records must also be approved or included and selected for the final report.
- Authorized edits are stored by case and revision and never update ARC source records. Exporting after an edit creates the next report revision and records the parent revision.
- Download Complete HTML embeds the filtered report snapshot and edits in one file. Download Report JSON provides the same case-scoped snapshot for the planned view-only attorney site.
- Certification is click-only and stores no typed signer or signature field. Release blockers still prevent certification while required verification remains unresolved.

## Evidence images and exhibits

- Extracted images begin unselected.
- Select only the images needed for the report. **Select visible** and **Clear selection** are available.
- Snip-to-Exhibit creates an actual visual crop and stores its source identifier, page or time locator, source hash, crop ratios, and output dimensions.
- Legacy metadata-only exhibits remain readable and are clearly identified.

## File integrity

Source files are hashed locally with incremental SHA-256. Large files are read in chunks so files over 512 MB are not saved with a blank hash merely because of browser memory limits. Browser and device limits still apply; keep the tab open until hashing completes.

Report asset uploads are case-scoped under the local ARC server and use SHA-256 metadata. The clean distribution archive excludes runtime `database` and `uploads` content. The report manifest schema is designed for a later separate view-only attorney site, but that viewer and authentication are intentionally outside this development phase.

## Defense Map

The Defense Map is integrated into `07_Intelligence_Slides_Analysis_Investigator.html` as workspace tab **5. Defense Map**. `08_Defense_Map.html` is retained only as a compatibility redirect for older bookmarks. The retired standalone rail, duplicate topbar, and print styles are no longer shipped.

Map tiles, web fonts, and CDN assets require network access. DNS errors in an offline sandbox do not indicate a case-data defect.

## API keys

Open **API Key Vault** in the top toolbar to configure OpenAI, Gemini, CourtListener, Firecrawl, and supported search access. Keys are stored only in the current browser profile using `localStorage`. No API key is included in this repository or release archive.

For confidential matters, use a dedicated browser profile and clear the API vault and site data when the matter is complete. Browser storage is origin-specific: local development, GitHub Pages, Vercel, and `file://` do not share stored cases or keys.

## Distribution

The external AI Studio destinations in the module bar are public endpoints. Remove those entries from `index.html` before publishing a deployment that should not expose them.

This project is proprietary to ARC Investigations & Consulting. See `LICENSE`; no permission to copy, modify, or redistribute the source is granted without prior written authorization.

## Verify a release

Run:

```powershell
npm test
npm run test:api
```

The release check validates JSON, parses inline and shared JavaScript, checks local asset references, verifies bridge/header/key-vault wiring, rejects obsolete nested copies, scans for common plaintext credential formats, and runs a final-report smoke test for approval filtering and cross-case isolation. The API smoke test verifies protected runtime files, upload hashing and ranges, cross-case file isolation, upload limits, and cleanup. Both checks run in GitHub Actions.

For a manual browser-level export check, open `scripts/dependency-smoke.html` through the local server. It creates in-memory Word and PowerPoint files and reports their byte sizes without retaining test data.

## Privacy and review boundary

This application assists investigative review and drafting. Generated findings, quotations, citations, dates, identities, legal authorities, and source references must be checked against the underlying record by the investigator and counsel before use. Do not upload material to an AI provider unless disclosure is authorized and consistent with governing confidentiality obligations.
