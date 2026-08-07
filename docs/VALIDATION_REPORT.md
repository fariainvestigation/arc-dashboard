# ARC final repaired build — validation report

Validation date: 2026-08-07

## Automated tests

| Suite | Result |
|---|---:|
| Shared case link / field-conflict / approved-record bridge | 16 / 16 passed |
| AI routing + final report safeguards | 21 / 21 passed |
| Motion & Legal integration | 22 / 22 passed |
| Firecrawl public-web research Worker | 5 / 5 passed |
| **Total** | **64 / 64 passed** |

The test harness was converted from `better-sqlite3` to Node's built-in `node:sqlite`, removing the package-registry failure that previously prevented the tests from running in this environment.

## Syntax checks

- 89 `.js` / `.mjs` files checked with `node --check`: **0 failures**.
- 19 inline scripts extracted from deployable HTML and checked with Node: **0 failures**.

## Static-link audit

The deployable `site/` tree was scanned for local `src`/`href` references.

- Real missing local files: **0**.
- Runtime template expressions were excluded from the path check; real missing local references: **0**.

## Security checks completed

- No live provider key is included in the deployable site or Worker configuration.
- Chain Review and Forensic Video no longer store/accept a Gemini key in browser settings.
- Legacy `ARC_GEMINI_KEY_V1` is cleared by the secured Gemini client.
- Gemini requests are routed through `/ai/google/*`; the Worker injects `GOOGLE_API_KEY`.
- Gemini resumable upload-session headers are forwarded without exposing the provider key.
- Firecrawl uses a Worker secret, validates Cloudflare Access, enforces case assignment, and blocks private/local target URLs.
- Legal Worker validates Access identities and case assignment; unknown users are pending, not auto-investigators.
- CourtListener and Claude legal credentials remain server-side.
- Export tests verify provider keys/internal notes/other-case material are excluded.

## Prompt / model safeguards repaired

- Gemini 3.6 calls no longer set deprecated sampling parameters.
- OUI/Drug AI output is issue spotting for attorney review, not filing-ready motion drafting. Gemini legal-authority lookup is disabled there; legal research is routed to Motion & Legal / CourtListener.
- OUI rule-engine scores are labeled as motion-issue support indicators, not predictions of a court outcome; legacy motion templates are marked reference-only and not for filing.
- Motion drafting uses approved ARC facts + verified authorities and rejects detected reporter/statute/CMR/rule citations outside the selected authority set.
- Final report drafting uses `[FACT:id]` and verified `[CASE:key]` metadata tags, rejects unknown tags, flags untagged factual paragraphs, and adds a deterministic warning when cited source text appears not to support names/numbers/dates used in the sentence.
- Claude remains limited to motion/final-report drafting tasks; Gemini handles extraction/analysis tasks.

## Credential scan

- Deployable `site/` and `cloudflare-worker/` trees were scanned for Google, Anthropic, and Firecrawl live-key patterns: **0 matches**.

## Not validated here

This environment does not have your live:

- Cloudflare Access application
- D1 production database
- R2 production bucket
- Google/Anthropic/CourtListener/Firecrawl accounts or secrets

Therefore live end-to-end calls must still be proven on staging with `arc_preflight.html` before using live case material.
