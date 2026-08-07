# ARC Case Sync Worker — Production

Production configuration is already in `wrangler.toml` for `arcdefensereport.com`.

- Access: `old-lake-2c90.cloudflareaccess.com`
- D1: `arc_legal` (`6c04c557-f8de-4590-a235-76fa117ff6d8`)
- R2: `arc-legal-files`
- Routes: `/sync/*` and legacy-compatible `/api/*`

Do not create a separate `arc-cases` database. All ARC Workers share `arc_legal` and the canonical `cases` / `case_members` tables.

Before deployment, enable R2 and create `arc-legal-files`, then apply `../cloudflare-worker/production_schema.sql` as described in the root `PRODUCTION_DEPLOYMENT.md`.

Deploy:

```powershell
npx wrangler deploy --config=arc-sync-backend/wrangler.toml
```

The Worker validates the Cloudflare Access JWT signature, issuer and audience. It does not trust a browser-supplied email header by itself.
