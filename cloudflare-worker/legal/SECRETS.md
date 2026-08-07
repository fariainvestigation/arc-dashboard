# Environment secrets

All provider credentials are Cloudflare Worker secrets. None appears in browser
code, HTML exports, filing ZIPs, logs, or any downloadable file. A test asserts
this on every frontend file and on the generated filing ZIP.

    wrangler secret put COURTLISTENER_API_KEY
    wrangler secret put ANTHROPIC_API_KEY

## Non-secret vars (wrangler.toml [vars])

    ACCESS_TEAM_DOMAIN   your-team.cloudflareaccess.com
    ACCESS_AUD           Access application AUD tag
    ALLOWED_ORIGINS      https://arcdefensereport.com   (comma-separated allowlist)
    CLAUDE_MODEL         claude-sonnet-4-6

## Bindings

    DB      D1 database  arc_legal
    FILES   R2 bucket    arc-legal-files

## Rules
- CourtListener is called only as `Authorization: Token <COURTLISTENER_API_KEY>`
  from inside the Worker.
- Anthropic is called only with `x-api-key: <ANTHROPIC_API_KEY>` from inside the
  Worker.
- `provider_log` records route, actor, case, and character counts only. It never
  stores keys, query text, or raw prompts.
- Rotate a key with `wrangler secret put` again; no redeploy is required.
- Never place a secret in wrangler.toml, the repository, or a client file.
