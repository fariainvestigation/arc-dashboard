# ARC Release Notes

## v11.4 GitHub-readiness and privacy audit

- Blocked direct static access to runtime case databases, uploaded evidence, repository dotfiles, and temporary upload files.
- Expanded `.gitignore` so nested `database` and `uploads` content cannot be committed while their placeholder files remain available.
- Added API smoke coverage to GitHub Actions, including automatic test-server startup and cleanup.
- Enforced report-file case isolation, ignored client-supplied file paths, corrected suffix byte ranges, and returned `413` for oversized uploads.
- Added fail-fast validation for server port and upload-limit configuration, upstream request timeouts, and resilient handling of invalid local case files.
- Corrected Timeline AM/PM parsing and added known-answer tests for 12-hour and 24-hour chronology sorting.
- Prevented floating Edit, Print, Download HTML, and Export Report controls from overlapping each other or the map timeline.
- Restored direct-page tools for nested `index.html` workspaces and added subresource integrity to all external map scripts and stylesheets.
- Clarified that GitHub Pages cannot run the protected ARC APIs and that public hosting requires authentication, authorization, private storage, TLS, backups, and case-level access controls.

## v11.4 Final attorney report integration

- Added `19_Final_Client_Report.html` as the final attorney-facing output from Stage 6 of the Full Report Builder.
- Preserved the six primary report groups and 30 optional sections from the approved client-report layout.
- Added data-driven navigation so unused case sections do not appear; Dashboard, Sources & Citations, and Review & Certification remain available.
- Added exact `caseId` filtering for approved Review Center reports and approved or included report assets selected for final use.
- Added a direct cross-window payload handoff for reliable local `file://` review in addition to normal same-origin storage.
- Added self-contained HTML and JSON exports with case/revision metadata.
- Scoped authorized edits by case and revision; edits create a new exported revision without changing ARC source records.
- Added click-only certification without typed signer or signature fields.
- Added automated final-report smoke coverage for cross-case isolation, approval filtering, complete text mapping, and payload persistence.

## v11.4 Legal Research update (Knowledge Bank + Dashboard)

- Replaced `02_Legal_Research.html` with the unified Legal Research rewrite (CourtListener, grounded Q&A, motion drafting, citation verification).
- Added Knowledge Bank v1 (`arc-knowledge-bank-v1.json`) with IndexedDB cache and search.
- Added `00_Legal_Research_Dashboard.html` investigator overview wired to shared legal-research motion storage.
- Prior Legal Research HTML retained under `legacy/02_Legal_Research.pre_kb.html`.

## v11.4 Case Intake bridge (before Notebook)

- Added **Case Intake** (`00_Case_Intake_Dashboard.html`) as the first shell module and Case Setup workflow destination.
- Four-step intake: police-report seed upload, pre-fill/routing, core multi-file uploads, parties verification, then **Generate Information** into the shared ARC case bridge.
- Continue-to-Notebook handoff via `ARC_OPEN_MODULE`.

## v11.4 Discovery Review substitution

- Replaced Discovery Gap Map with **Discovery Review Phase 1** (`04_Discovery_Review.html`).
- Shell now answers `ARC_REQUEST_ACTIVE_CASE` and accepts `ARC_SEND_DISCOVERY_GAP_REPORT` into Main Report.
- Prior Gap Map retained under `legacy/` for reference only.

## v11.4 Investigation Map + Intelligence Board

- Added Suite Pro **Investigation Map** (`map/`) as a first-class shell module with Leaflet, Geoman, Turf, heatmaps, routing, and timeline playback.
- Extended `scripts/serve.js` with local map APIs: geocoding, routing, case save/load, and Gemini location extraction.
- Added `09_Intelligence_Board.html` (Criminal Intelligence Board v2) as a shell module.
- Shared ARC case context fills map and board matter/docket fields.
- Release check verifies map assets, shell registration, and map API routes.

## v11.2.0 — Corrected feature-preserving release

### Restored integrations

- Restored ARC Notebook case-brief publishing after reports, decks, and mind maps are generated.
- Restored the Legal Research case orientation panel, grounded AI briefing, and Main Report transfer.
- Restored Discovery Gap Map import from the shared Notebook report.
- Restored Timeline generation from source-attributed times in the shared Notebook report.
- Restored Intelligence Analysis synchronization of the Notebook report as a controlled source document.
- Restored isolated report-only printing and strengthened escaped legacy report recovery.

### Preserved v11.1 controls

- Six-stage workflow and active-case context header.
- Central Investigator Review Center.
- Pending, approved, rejected, and revised report states.
- Approval reset after substantive edits.
- Final release checklist and audit events.
- ARC Generator and Edit PDF export destinations.
- Investigator-controlled image selection, exhibit crops, large-file hashing, and report revision deduplication.

### Release protection

The automated release check now fails if any restored cross-module integration is removed.


# ARC Integrated System v11.1.0

## Product experience and final-review controls

- Added a persistent six-stage case workflow across the integrated shell.
- Expanded the active-case header with matter, docket, client, investigator, report revision, status, and last-saved information.
- Added a centralized Investigator Review Center.
- Added report-level Pending, Approved, Rejected, and Revised states.
- Substantive changes to approved reports now reset approval to Revised.
- Added named reviewer capture and review notes.
- Added an append-only local audit record for report saves, review decisions, routing, finalization, and exports.
- Added automated checks for possible citation gaps, empty or failed hashes, and unresolved placeholder language.
- Added a ten-item final report release checklist.
- Edit PDF now requires investigator approval.
- Finalization is blocked until blocking release checks pass.
- Added status labels and standardized report cards across Main Report and Review Center.
- Added final-export routing from the persistent workflow.
- Updated the release test to verify the new workflow, review, approval-reset, checklist, and audit controls.

## Existing v11 protections retained

- Cited analytical connections require investigator review.
- Snip-to-Exhibit creates a real image crop with provenance.
- Files over 512 MB receive incremental SHA-256 hashing.
- Defense Map remains integrated in the combined workspace.
- Extracted images begin unselected.
- Legacy report series deduplicate as revisions.
- Functional attorney HTML includes search and navigation.
- Export Report routes to #4 ARC Generator or #5 Edit PDF.

# ARC Release Notes — GitHub-Ready Review

## Report workflow

- Added a shared **Export Report** action across local report modules.
- Export now asks whether to continue to **#4 ARC Generator** or **#5 Edit PDF**.
- Added standalone-page routing as well as shell/iframe routing.
- Added a split live-edit and PDF-style preview workspace.
- Added a self-contained functional HTML report with full-text search, highlighted results, table of contents, previous/next result navigation, collapsible sections, print/Save as PDF, section-link copying, responsive layout, and case/version metadata.
- Added stable report-series revision handling so prior chain reports are updated instead of duplicated.
- Strengthened report grounding instructions: record-only facts, source locators, explicit uncertainty, plain language, and no invented details.

## Evidence and media

- Extracted pictures begin unselected.
- Added **Select visible** and **Clear selection** controls.
- Final report rendering now includes only investigator-selected pictures.
- Snip-to-Exhibit now renders the source, supports drag selection, creates an actual JPEG crop, and stores crop dimensions and provenance.
- Large source files use incremental 4 MB SHA-256 hashing instead of a 512 MB no-hash fallback.
- Added user-facing hashing error handling.

## Investigator review

- Every analytical connection, cited or uncited, creates a review finding.
- Cited connections cannot enter the final report until investigator approval.
- Editing a connection or its citations changes its fingerprint and resets approval.
- Final transfer requires citations for every approved factual finding and analytical connection.
- Draft reports show connection review status; final reports include approved connections only.

## Navigation and Defense Map

- Removed the obsolete standalone Defense Map shell tab.
- Restored the missing Case Dashboard registration in the combined workspace.
- Registered Defense Map as workspace tab **5. Defense Map**.
- Made legacy `08_Defense_Map.html` a lightweight compatibility redirect.
- Removed the old standalone rail, duplicate topbar, and obsolete print CSS by retiring that duplicate page.
- Fixed hash-route timing so legacy Defense Map bookmarks open the integrated map.

## Verification

`npm test` now also checks:

- Inline and shared JavaScript syntax
- Local assets and JSON
- Shared case/report wiring
- Two-destination report routing
- Legacy report deduplication
- Analytical-connection review enforcement
- Visual exhibit crop implementation
- SHA-256 known-answer vectors
- Manual extracted-image selection
- Functional HTML generation and embedded-script syntax
- Integrated Case Dashboard and Defense Map registration
- Secret scanning
