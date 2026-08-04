# Changelog

## Legal Research Dashboard v1 (2026-08-01)

- New tool 00_Legal_Research_Dashboard.html: investigator-facing overview in light blue and white, no icons or gradients, Georgia serif headings, responsive two-column layout with a 340px rail.
- Live wiring: reads arc_legal_research_motions_v1 for the active matter, motions (Draft/Review/Final mapped to the three lanes), precedent-derived recommended motions, and research stats; storage events re-render when Legal Research saves in another tab.
- Send to attorney in the motion drawer writes status Review back to the shared store.
- 02_Legal_Research.html: callGemini now increments arc_ai_usage_v1 (queries, chars, kind breakdown) which the dashboard rail displays; single scoped edit, all routes pass regression.
- index.html: dashboard added to the tool list.
- Sample matter fallback with six complete Massachusetts OUI/suppression motion drafts when no store is present.
- 25 DOM-driven tests pass across sample and live modes; node --check passes on all script blocks.

## Legal Research: Knowledge Bank v1 (2026-08-01)

- Added Knowledge Bank as nav item 6 in 02_Legal_Research.html.
- 256-document office reference library: MA criminal form templates (5 collections) and LN OUI practice guide chapters 11-17 with MOL form appendix.
- Storage in IndexedDB (arc_legal_kb_v1) with auto-fetch of arc-knowledge-bank-v1.json when served over http, manual import fallback for file://.
- Full text search, collection and type filters, viewer modal with copy and txt download.
- Research question answers now receive top matching bank excerpts as non-citable practice guidance; excerpt-named authority is diverted to the verification list, preserving the CourtListener-only citation constraint.
- Additive change set: five scoped edits, no existing functions modified except researchSynthesisPrompt (one appended template expression). All script blocks pass node --check; all six routes pass render regression.

## [2026-08-01] Complete Rewrite – Legal Research & Motions Unified

### New Features
- **Live case law search** from CourtListener with docket number support
- **Ask a research question** powered by Gemini, grounded in saved cases + logged facts
- **Motion suggestions tagged by constitutional hook** (4A, Miranda, due process, etc.)
- **Full motion drafting** with caption, facts (numbered with sources), argument, conclusion
- **Citation verification** on drafts against CourtListener's real database
- **Research memo save** from Q&A results

### Breaking Changes
- Merged "Legal Research Hub" (Tab 2) and "Case Law Workbench" (Tab 3) into one tab
- Removed static prompt-copying workflow (all prompts now live and grounded)
- Removed `viewResearch()` function; merged into `viewCaseLaw()`
- Removed old RESEARCH_PROMPT, replaced with `researchAnswerPrompt()` builder
- Navigation now 5 tabs instead of 6; "caselaw" route redirects to "research"

### Improvements
- No Apify middleman; direct CourtListener official REST API
- No per-call billing; free 125 req/day or paid CourtListener membership
- No hardcoded API tokens; all keys read from vault
- Better motion suggestions (issue tagging, rationale tied to precedent)
- Full motion output, not just ARGUMENT section
- Citation verification UI mirrored across both citation checker and draft verifier
- Shared research/case management flow eliminates duplication

### Under the Hood
- Upgraded `caselawMotionSuggestPrompt()` to add issue field
- Upgraded `caselawDraftPrompt()` to produce full motion (caption, facts, argument, conclusion)
- Added `researchAnswerPrompt()` for grounded Q&A
- Added `askResearchQuestion()` handler
- Added `verifyDraftCitations()` handler
- Added `renderCiteResultRows()` shared citation display
- Added `citeCard()` and `sourcesCard()` for unified layout
- Added state tracking for `_askQ`, `_askAnswer`, `_clSearchDocket`

### Bug Fixes
- Fixed em dashes in code comments (now use periods/semicolons)
- Removed dead handlers for `copy-research-prompt`, `save-memo-from-q`
- Cleaned up dead `researchQ` input binding
- Verified no duplicate function definitions
- Verified no telemetry beacons

### Testing
- `node --check` passes
- Live CourtListener field names verified against current API response shape
- Citation checker tested with multi-format citations
- Motion suggestions tested with suppression precedent + warrantless search facts
- Full motion generation tested with SJC and federal trial court cases

### Known Limitations
- Docket numbers are not court-unique; always pair with court filter
- MA state trial courts not on PACER/RECAP (federal/appellate only)
- Citation lookup is slow on large text blocks (best with 1-5 cites at a time)
- Suggested motions require attorney review before filing
- No real-time sync between multiple investigators (browser-level storage isolation)

---

**Previous versions** (legacy, not in this build):
- v112-v119: Case Law Workbench tab (extract, strategize, draft)
- v1-v111: Legal Research Hub (prompt copying, static sources)

