ARC PRODUCTION RELEASE — 2026-08-07
===================================

This package is configured for the production ARC domain:
  https://arcdefensereport.com
  https://www.arcdefensereport.com

Cloudflare Access:
  Team domain: old-lake-2c90.cloudflareaccess.com
  AUD: 165b93a400b3aa4c67a33441298df65793a1b50886a070d5087e59ec0732b212

Shared D1 database:
  Name: arc_legal
  ID: 6c04c557-f8de-4590-a235-76fa117ff6d8

R2 bucket expected by the code:
  arc-legal-files

IMPORTANT — ONE EXTERNAL STEP IS STILL REQUIRED
------------------------------------------------
R2 is not enabled on the Cloudflare account yet, so the bucket does not exist.
Before deploying the Workers:
  1. Enable R2 in Cloudflare.
  2. Create the bucket named exactly: arc-legal-files

The production code is intentionally configured to FAIL CLOSED when R2 is missing.
Do not rename the bucket unless you also update both Worker wrangler.toml files.

PROVIDER SECRETS — DO NOT PUT THEM IN THIS ZIP
----------------------------------------------
AI Worker:
  GOOGLE_API_KEY
  ANTHROPIC_API_KEY

Legal Worker:
  COURTLISTENER_API_KEY
  ANTHROPIC_API_KEY

Research Worker:
  FIRECRAWL_API_KEY

Start with PRODUCTION_DEPLOYMENT.md.

DEPLOY_PAGES/ is the only folder intended to be uploaded to Cloudflare Pages.
The Worker source stays outside DEPLOY_PAGES and is deployed with Wrangler.

Production backend is Cloudflare only:
  Pages + Access + Workers + D1 + R2

Legacy Vercel code has been removed from the production root and is not part of
DEPLOY_PAGES.

Before live case work, open /arc_preflight.html while signed in and require no red
failures. Then run one closed case through the complete workflow and export it.

SHARED CASE STATE
-----------------
The active case, People/Parties state, and OUI/Drug specialty state use the shared
Cloudflare case backend in production. People and OUI module-state writes use
optimistic revisions and stop on conflicts rather than overwriting newer work.
Local file:// preview remains local-only by design.
