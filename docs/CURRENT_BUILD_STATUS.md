# Current build status

**Baseline:** `ARC_FINAL_BUILD_20260807 (1).zip`, repaired and consolidated on 2026-08-07.

## Deployable now as code

- Static ARC Pages tree: `site/`
- Investigation / Case Dashboard / Discovery / Chain / Video / Intelligence pages
- Lead Development
- Final Report Package Builder
- Motion & Legal frontend
- OUI & Drug Defense Analyzer compiled app
- Public Web Research frontend
- AI, Legal, and Research Cloudflare Workers
- D1 legal/research schema and R2 legal-file integration
- Preflight page

## Provider division

- Gemini: extraction, discovery review, evidence/custody/video/OUI/lab/intelligence analysis
- Claude: final report drafting/revision and motion drafting/revision only
- CourtListener: legal authority retrieval and verification workflow
- Firecrawl: public-web search/scrape only

## Approval principle

AI output is never automatically promoted to an approved fact, finding, authority, final report, or filing. Human review remains in the workflow.

## Remaining operational proof

The code is locally validated but must still be deployed to staging and tested against the user's actual Cloudflare Access, D1, R2, and provider accounts. See `DEPLOYMENT.md`.
