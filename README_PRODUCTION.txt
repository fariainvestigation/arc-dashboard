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

PRODUCTION R2 STATUS
--------------------
The private R2 bucket `arc-legal-files` has been created in the production Cloudflare account.
Keep Public Access disabled. The production code is intentionally configured to FAIL CLOSED if the binding is ever missing.
Do not rename the bucket unless you also update the Worker bindings.

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

For the 11.7.3 go-live package, deploy DEPLOY_PAGES/ to Pages and redeploy the Sync + Research Workers (Origin/SSRF fixes). Existing secrets stay in Cloudflare. For a fresh full environment, see PRODUCTION_DEPLOYMENT.md.

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
