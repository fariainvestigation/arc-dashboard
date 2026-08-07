# ARC Legal Worker — Production secrets and bindings

Provider secrets are Cloudflare Worker secrets only:

```powershell
npx wrangler secret put COURTLISTENER_API_KEY --config=cloudflare-worker/legal/wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY --config=cloudflare-worker/legal/wrangler.toml
```

Production non-secret configuration is already set:

- Access team domain: `old-lake-2c90.cloudflareaccess.com`
- Access AUD: `165b93a400b3aa4c67a33441298df65793a1b50886a070d5087e59ec0732b212`
- D1: `arc_legal` / `6c04c557-f8de-4590-a235-76fa117ff6d8`
- R2: `arc-legal-files`
- Allowed origins: `https://arcdefensereport.com`, `https://www.arcdefensereport.com`

CourtListener and Anthropic keys never belong in browser code, exports, logs, or D1 records.
