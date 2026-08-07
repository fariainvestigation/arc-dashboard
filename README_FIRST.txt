ARC FINAL REPAIRED BUILD — 2026-08-07
=====================================

START HERE
1. `site/` is the static ARC site to deploy to Cloudflare Pages.
2. `cloudflare-worker/ai/` is the secure Gemini + Claude AI gateway.
3. `cloudflare-worker/legal/` is Motion & Legal + CourtListener + legal files/D1.
4. `cloudflare-worker/research/` is the Firecrawl public-web research gateway.
5. `docs/DEPLOYMENT.md` gives the deployment sequence.
6. After staging deployment, open `site/arc_preflight.html` and run every check.

NO LIVE API KEY IS INCLUDED IN THIS ZIP.
Do not put Google, Anthropic, CourtListener, or Firecrawl keys into HTML,
JavaScript, localStorage, GitHub, or case exports. Set them with Wrangler secrets.

WHAT WAS REPAIRED
- Restored the shared ARC browser dependencies required by the static modules.
- Built one deployable `site/` tree rather than requiring nested ZIP/page paths.
- Removed browser Gemini-key storage and key-entry UI from Chain Review and Video Audit.
- Routed legacy Gemini module calls through `/ai/google/*` where the Worker injects the key.
- Fixed Gemini resumable upload-session forwarding through the secure gateway.
- Added a standalone authenticated Firecrawl Worker with case assignment checks and private-URL blocking.
- Fixed Motion & Legal Worker deploy path and strengthened citation detection for Massachusetts statutes, CMR, rules, and evidence citations.
- Changed OUI/Drug prompts from filing-ready motion drafting to issue spotting for attorney review.
- Added verified case-metadata tags and stronger factual support warnings to final-report drafting.
- Made test harnesses portable with Node's built-in SQLite support.
- Restored missing navigation/report-builder paths and fixed local page references.

LOCAL VALIDATION COMPLETED
- ARC case-link tests: 16/16 passed.
- AI routing + final-report tests: 21/21 passed.
- Motion & Legal tests: 22/22 passed.
- Public Web Research tests: 5/5 passed.
- Inline HTML scripts checked: 19, no syntax failures.
- JS/MJS files checked: 50, no syntax failures.
- Static deploy-site references: no real missing local files (runtime template strings excluded).

IMPORTANT
This code has not been exercised with YOUR live Cloudflare Access application,
D1 database, R2 bucket, or provider accounts. The final deployment proof must be
performed on a staging hostname using `arc_preflight.html` and closed cases.

The browser case registry/ARCUnified compatibility bridge in this package is
still browser-local. If your existing ARC `/sync/*` D1 service is already live,
preserve it during deployment. A legacy sync Worker source remains in the source
modules, but this repair pass did not replace your known-good live sync backend.
