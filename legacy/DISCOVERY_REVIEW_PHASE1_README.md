# ARC Discovery Review (Phase 1 module)

Single-file module implementing the "ARC Discovery Review and Discovery Gap Reporting"
specification (July 30, 2026), scoped to what a browser module can truthfully do
(spec Section 12, Phase 1). Replaces the manual Discovery Gap Map workflow.

## Files
- `arc-discovery-review.html` .......... the module (open directly, or embed as an iframe in the ARC shell)
- `shell-bridge-reference.js` .......... reference handlers the ARC parent shell must implement
- `LIMITATIONS-AND-TEST-RESULTS.md` .... honest capability boundaries and acceptance-test results
- `CHANGELOG.md`
- `legacy/arc-discovery-gap-map.html` .. prior manual Gap Map, unchanged, kept for reference

## What is implemented (Phase 1)
- Discovery Library: upload, per-type tabs, search, processing states (waiting, processing,
  ready, needs review, failed with reason and retry), pagination-free table suitable for
  Phase 1 volumes.
- Stable source records per spec Section 4: sourceId, caseId, filename, MIME, size, SHA-256
  of the original bytes, uploadedAt, status, pageCount/durationMs, original-file reference.
  Originals stored intact in IndexedDB, separate from extracted text.
- PDF page-aware text extraction (pdf.js). Text files ingest as single-page sources.
  Images, audio, and video are stored with metadata and marked "needs review" because
  OCR/transcription require backend work (spec Phase 2). Nothing is silently omitted;
  empty or unreadable pages are reported on the source record.
- ARC Case Assistant: answers restricted to the active case's processed pages, retrieved
  locally and sent to Gemini (key via localStorage `ARC_GEMINI_KEY_V1`, never exported).
  Strict JSON contract; citations validated against real sourceIds and page ranges before
  display; invalid citations are dropped. Unsupported questions return exactly:
  "The uploaded discovery does not establish this."
- Citation chips open the source viewer at the cited page with approximate passage
  highlighting drawn on an overlay; the original is never altered.
- Potential-gap review: assistant proposals enter a pending queue. Approval requires an
  investigator identity and records approvedBy/approvedAt. Dismissals are retained with
  disposition. Duplicate findings merge citations without losing source history.
- General Discovery Gap Report with all 11 spec sections, editable in place, Letter-size
  print/PDF export, standalone sanitized HTML export.
- Send to Edit Report: exact `ARC_SEND_DISCOVERY_GAP_REPORT` payload with transferId,
  sanitized HTML plus plain-text fallback, ack handling (`ARC_DISCOVERY_GAP_REPORT_ACK`),
  duplicate-transfer blocking, and the spec's required error messages.
- Snip to Exhibit on PDF pages: drag selection, derived PNG stored separately, exhibit
  record with source filename, page, normalized crop coordinates, original SHA-256,
  creator, timestamp, and a working "View original source" link.

## Embedding in the ARC shell
The module requests the active case on load:
  { type: "ARC_REQUEST_ACTIVE_CASE", version: 1, sourceModule: "discovery-review" }
The shell should reply:
  { type: "ARC_ACTIVE_CASE", caseId, caseName, docket, court }
See `shell-bridge-reference.js` for the receive/insert/ack side of the report transfer.
Set the allowed parent origin under Advanced before HTTPS deployment; wildcard is used
only as a standalone/file:// fallback.

## Security posture
- No API keys in source, exports, or postMessage payloads. Gemini key lives only in the
  operator's localStorage and is entered by the operator.
- Case JSON exports contain metadata, extracted text, and findings; never original file
  blobs and never credentials.
- All searches, answers, findings, reports, and exhibits carry the active caseId.
- Console logging of case content is avoided.

## What still requires the repository ZIP
Per the spec's repository-first rule, final integration (Notebook active-case state,
Main Report Edit Report insertion, Exhibits store reuse, shared bridge conventions,
navigation) must be wired against the actual `Investigations11/ARCREPORT` code. Upload
the complete repo ZIP and this module will be integrated into it rather than shipped
alongside it.
