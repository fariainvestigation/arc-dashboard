# Security

- Localhost-only binding by default (127.0.0.1). Do not expose to a network.
- API keys live in .env and are read only by the local server. Automated tests
  assert that no key string appears in any browser-served file or any export.
- Upload controls: extension allow-list, 250 MB limit, sanitized stored
  filenames, per-case directories, SHA-256 recorded at intake.
- Path-traversal protection on every file-serving route (documents, images,
  knowledge library); requests outside the sanctioned roots return 404.
- Content-Security-Policy, nosniff, and no-referrer headers on all responses.
- No analytics, no telemetry, no cloud synchronization. The only optional
  outbound call is the AI provider you configure, and only when you invoke it.
- Filing ZIPs contain only the compiled filing documents and exhibit files:
  no API keys, no attorney-only notes, no audit history, no other cases.
- Backups: data/backups ZIPs contain the case folder plus a JSON dump of the
  case's rows and audit history. Keys are never included.
- Database encryption: SQLite file can be placed on an encrypted volume
  (BitLocker/FileVault). Full-disk encryption is the recommended baseline for
  privileged defense material.
- Sessions: single-user local tool; if you need an application password, front
  it with OS user-account separation - the app trusts the local user.
