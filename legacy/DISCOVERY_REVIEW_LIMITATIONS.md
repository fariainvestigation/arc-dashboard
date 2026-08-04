# Capability Boundaries and Acceptance-Test Results

## Honest capability boundaries (spec Section 12)
Implemented client-side in this module: page-aware PDF text extraction, case-restricted
retrieval over extracted pages, cited assistant answers, citation navigation with
approximate highlighting, gap approval, 11-section report, transfer protocol, PDF snips.

NOT implemented because a browser file cannot truthfully provide them (backend required):
- OCR of scanned documents and images (sources are marked "needs review", not faked).
- Audio/video transcription and timestamp citation (Phase 2).
- Gigabyte-scale indexing and durable multi-user storage (IndexedDB is per-browser).
- Server-side key custody. Interim posture: operator-entered Gemini key in localStorage,
  consistent with the existing ARC tool conventions; move to server env vars
  (GEMINI_API_KEY etc.) when the backend route exists.
- Facial recognition, object recognition, speaker ID: excluded by spec.

## Acceptance-test matrix results (run standalone in Chromium, synthetic discovery)
Legend: PASS = verified; PARTIAL = works with noted limits; BLOCKED = requires the real
ARC repository or backend and was not claimed.

- T01 active-case load from Notebook: BLOCKED standalone (repo not provided). The
  handshake is implemented and unit-exercised with shell-bridge-reference.js.
- T02 open without active case: PASS ("Open or select a case in ARC Notebook..." banner,
  no fabricated case).
- T03 upload supported document: PASS (stable sourceId, status transitions visible).
- T04 corrupt/unsupported file: PASS (failed status with reason and Retry; no silence).
- T05 supported factual question: PASS with a real Gemini key and synthetic PDF; citations
  resolve to real sourceId and page.
- T06 unsupported question: PASS (exact required sentence).
- T07 click PDF citation: PASS (correct file and page; highlighting is approximate,
  overlay-only, original untouched).
- T08 media citation seek: BLOCKED (Phase 2 transcription backend required).
- T09 conflicting statements: PASS by prompt contract (both sources shown; no credibility
  ruling). Model adherence should be spot-checked on real matters.
- T10 propose gap: PASS (pending until approval).
- T11 approve gap: PASS (approvedBy, approvedAt, citations stored).
- T12 dismiss gap: PASS (kept with disposition; excluded from report).
- T13 generic checklist item without record support: PASS (no auto "not produced";
  assistant may only propose from cited references; statuses are investigator-set).
- T14 generate report: PASS (all 11 sections, correct grouping).
- T15 export PDF: PASS via print (Letter, 1in margins, black on white, no UI controls,
  no secrets).
- T16 send to Edit Report: BLOCKED standalone; PASS against the reference bridge in a
  test iframe harness (insert + ack).
- T17 no overwrite of existing Main Report: BLOCKED (needs real editor; insertion rules
  documented in shell-bridge-reference.js).
- T18 duplicate transfer: PASS (transferId dedupe on both sides).
- T19 cross-case transfer: PASS in harness (exact required block message).
- T20 revised report versions: PARTIAL (each generation stored as a new report record;
  explicit replace-vs-revision choice should be surfaced during shell integration).
- T21 snip overlay: PASS.
- T22 snip provenance: PASS (source, page, normalized crop, sha256, creator, date).
- T23 open original from exhibit: PASS.
- T24 no keys in output/logs: PASS (exports exclude key; report HTML sanitized; content
  not console-logged).
- T25 global module regression: BLOCKED (repository not provided; nothing in the repo
  was modified).

## To reach full spec compliance
Upload the complete Investigations11/ARCREPORT ZIP. Integration work remaining:
wire the active-case handshake to the real Notebook state, implement
arcInsertIntoEditReport against the real Edit Report editor state, reuse the existing
Exhibits store for proposed exhibits, and route AI calls through the server with
env-var credentials.
