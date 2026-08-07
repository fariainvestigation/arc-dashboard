# Known limitations

**This module is not production-ready until the items in section 1 are done.**
All 22 tests pass and no provider key is exposed, but the module cannot function
until the ARC platform supplies its half of the contract.

## 1. Required from the ARC platform (blocking)
- `window.ARCBridge.getApprovedFacts(caseId)` and `getApprovedFindings(caseId)`
  do not exist yet. Until they do, the module reads zero approved facts, so
  recommendations are baseline-only and drafting is refused. Contract in
  INTEGRATION.md section 3.
- `wrangler.toml` ships with placeholder values for `ACCESS_TEAM_DOMAIN`,
  `ACCESS_AUD`, and the D1 `database_id`.
- No end-to-end run against live Cloudflare Access, D1, R2, CourtListener, or
  Anthropic has been performed. Tests use emulated D1/R2 and stubbed providers.

## 2. Functional gaps
- **PDF export is not implemented.** Workers cannot run PDFKit. DOCX and
  print-ready attorney HTML ship instead; browser Print-to-PDF produces the
  filed page. A real PDF needs either a browser-rendering service or a
  WASM PDF library.
- **Uploads buffer in memory.** `hashStream` uses `DigestStream` and never holds
  the whole file for hashing, but the R2 write still passes a single buffer.
  Files near the 250 MB cap need R2 multipart upload.
- **Rate limiting is per-isolate**, so it resets as Workers recycle. Move to a
  Durable Object or KV counter for a real limit.
- **Exhibit numbering is manual.** The standalone app auto-renumbered and
  rewrote references; here filing review flags mismatches but does not fix them.
- **Superseded-authority detection is manual.** There is no automatic negative
  treatment check. CourtListener's citation-lookup endpoints could supply
  "cited by" data; not wired.
- **Docket and court caching never expires** except for courts (30 days).
- **Filing manifest is JSON only.** No human-readable cover sheet.

## 3. Judgment limits worth stating plainly
- The fabrication check catches citations in standard reporter formats. A
  fabricated *quotation* attributed to a real, verified case would pass it.
  Attorney review remains the real safeguard, which is why approval is gated on
  a human identity with a role.
- "Controlling" is enforced structurally (Massachusetts appellate or SCOTUS,
  never a dissent or concurrence, pinpoint required, attorney-only). Structure is
  not the same as a legal conclusion about whether the case actually controls the
  issue. Counsel still owns that judgment.
- Filing review checks form, sourcing, and consistency. It does not evaluate
  whether an argument is sound.
- The motion bank is 154 motion entries and checklists, not verified filing
  templates. Recommendations are labeled "Potential motion for attorney review"
  in the interface and are never described as required or likely to succeed.

## 4. Not migrated
Approvals from the standalone application are intentionally not carried over.
Every migrated motion starts unapproved. See DATA_MIGRATION.md.
