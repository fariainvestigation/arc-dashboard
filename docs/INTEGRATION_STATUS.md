# Integration status

This document supersedes earlier integration-status notes in the source packages.

The deployable static application is now `site/`. It contains the repaired shared ARC dependencies and the selected current modules in one directory so local page references resolve without relying on nested source-package paths.

Cloudflare services are separated by responsibility:

- `cloudflare-worker/ai/` — Gemini + Claude routing and secure Gemini SDK passthrough.
- `cloudflare-worker/legal/` — D1/R2 Motion & Legal, CourtListener, Claude motion drafting.
- `cloudflare-worker/research/` — Firecrawl public-web research.

The original/nested module directories remain in the ZIP as source/history. They are not the Pages output directory.

The browser-side `ARCUnified` bridge included in `site/` is the compatibility layer used by the static modules in this build. It shares one active case across those modules in the same browser profile. If an existing production `/sync/*` shared-case Worker is already deployed, preserve that known-good service during cutover; the current repair pass did not replace it.

See `VALIDATION_REPORT.md` for actual test results and `DEPLOYMENT.md` for the staging sequence.
