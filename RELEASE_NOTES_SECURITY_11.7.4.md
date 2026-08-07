ARC 11.7.4 — GO LIVE

- 409 case conflicts rebase: preserve pending local edits, fetch newest D1 revision, three-way merge, retry save.
- Same-field conflicts require explicit Server Version / Your Version choice; neither value is silently discarded.
- Per-case save queue retained (one caseId = one server write at a time).
- Save status is Saving… → Saved / Save failed — Retry / Sync conflict (never “Saved” before D1 confirms).
- Unresolved sync conflicts show a sticky case-header warning and block filing / final-report approval / Edit PDF routing.
- Added concurrency and same-field conflict regression tests.
