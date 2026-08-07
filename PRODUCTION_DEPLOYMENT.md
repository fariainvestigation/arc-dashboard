# ARC Production Deployment — Cloudflare

This release is configured for `arcdefensereport.com` and uses **Cloudflare only** in production.

## Production values already embedded in Worker configuration

| Setting | Value |
|---|---|
| Access team domain | `old-lake-2c90.cloudflareaccess.com` |
| Access AUD | `165b93a400b3aa4c67a33441298df65793a1b50886a070d5087e59ec0732b212` |
| Shared D1 database | `arc_legal` |
| D1 database ID | `6c04c557-f8de-4590-a235-76fa117ff6d8` |
| R2 bucket | `arc-legal-files` |
| Production origins | `https://arcdefensereport.com`, `https://www.arcdefensereport.com` |

## 1. Enable R2 first — required

R2 is not enabled on the account yet. Enable R2 in the Cloudflare dashboard, then create the bucket:

```powershell
npx wrangler r2 bucket create arc-legal-files
```

If Cloudflare says R2 is not enabled, stop and enable it in the dashboard before continuing.

## 2. Apply the shared D1 production schema

From the root of this package:

```powershell
npx wrangler d1 execute arc_legal --remote --file=cloudflare-worker/production_schema.sql --config=cloudflare-worker/legal/wrangler.toml
```

All production Workers point to the same physical D1 database. `cases` and `case_members` are the authoritative case/membership tables.

## 3. Seed the first ARC administrator

Use the exact email address returned by Cloudflare Access. Replace `<YOUR_ACCESS_EMAIL>` below; do not use a nickname.

```powershell
npx wrangler d1 execute arc_legal --remote --config=cloudflare-worker/legal/wrangler.toml --command="INSERT INTO legal_users (email,name,role,status,created_at,updated_at) VALUES ('<YOUR_ACCESS_EMAIL>','ARC Administrator','administrator','active',datetime('now'),datetime('now')) ON CONFLICT(email) DO UPDATE SET role='administrator',status='active',updated_at=datetime('now');"
```

Unknown users are not silently granted investigator access.

## 4. Enter provider secrets directly into Cloudflare

Never paste provider keys into HTML, JavaScript, GitHub, or this ZIP.

### AI Worker

```powershell
npx wrangler secret put GOOGLE_API_KEY --config=cloudflare-worker/ai/wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY --config=cloudflare-worker/ai/wrangler.toml
```

### Legal Worker

```powershell
npx wrangler secret put COURTLISTENER_API_KEY --config=cloudflare-worker/legal/wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY --config=cloudflare-worker/legal/wrangler.toml
```

### Public Web Research Worker

```powershell
npx wrangler secret put FIRECRAWL_API_KEY --config=cloudflare-worker/research/wrangler.toml
```

## 5. Deploy the Workers

Deploy in this order:

```powershell
npx wrangler deploy --config=arc-sync-backend/wrangler.toml
npx wrangler deploy --config=cloudflare-worker/ai/wrangler.toml
npx wrangler deploy --config=cloudflare-worker/legal/wrangler.toml
npx wrangler deploy --config=cloudflare-worker/research/wrangler.toml
```

Production routes are already configured for both apex and `www`:

- `/sync/*`, `/api/cases*`, `/api/health*`, `/api/audit-log*`, `/api/report-approvals*`, `/api/report-assets*` → case sync Worker
- `/ai/*` plus specific legacy AI compatibility routes → AI Worker
- `/legal-api/*` → Legal/CourtListener Worker
- `/research-api/*` → Firecrawl Worker

## 6. Confirm Cloudflare Access protects the private ARC surfaces

The same Access application/AUD must protect the investigator area and API routes. At minimum protect:

- `/investigator/*`
- `/cases/*`
- `/sync/*`
- `/api/*`
- `/ai/*`
- `/legal-api/*`
- `/research-api/*`
- internal report/legal pages used after login

The public marketing homepage may remain public if desired. Do not expose the API paths outside Access.

## 7. Deploy the static frontend

**Upload only `DEPLOY_PAGES/` to Cloudflare Pages.** Do not upload the Worker source folders as website assets.

If using Wrangler Pages deployment, use the existing Pages project name:

```powershell
npx wrangler pages deploy DEPLOY_PAGES --project-name <YOUR_EXISTING_PAGES_PROJECT_NAME>
```

If using the Cloudflare dashboard, upload the contents of `DEPLOY_PAGES/` as the Pages deployment.

## 8. Run the production preflight

While signed in through Cloudflare Access, open:

`https://arcdefensereport.com/arc_preflight.html`

The preflight now checks:

- Sync Worker
- verified Cloudflare Access identity
- D1 binding
- R2 binding
- Gemini gateway
- Claude gateway
- Legal Worker
- CourtListener secret status
- Research Worker
- Firecrawl secret status
- active-case legal authorization
- browser key leakage
- approved final-report inputs

Do not use live case data while any preflight row is red.

## 9. Run an authenticated API smoke test

Obtain a valid Access JWT for a test identity and run:

```powershell
$env:ARC_BASE_URL="https://arcdefensereport.com"
$env:ARC_TEST_ACCESS_JWT="<VALID_ACCESS_JWT>"
npm run test:staging
```

The test checks `/sync/whoami`, `/ai/status`, `/legal-api/provider-status`, and `/research-api/status` and verifies that responses do not expose provider secrets.

## 10. Closed-case go-live proof

Before the first live matter, run a closed test case through:

Case Dashboard → Intake → Notebook → Evidence/Discovery → People → Timeline → Investigation → specialty analysis if applicable → Motion & Legal → approved findings → Final Report Builder → Investigator Review → final edit → PDF/DOCX/HTML export.

Verify:

- the same case ID appears everywhere;
- no information from another case is visible;
- R2 uploads download with the same SHA-256;
- CourtListener authorities remain linked/verified;
- an approved final report loses approval immediately after substantive edit;
- final exports contain no provider keys or internal-only notes.

## Production provider responsibilities

- Gemini: evidence/discovery/investigative analysis
- Claude: final reports and motion drafting/revision
- CourtListener: legal authority research/verification
- Firecrawl: public-web research

## OUI / Drug specialty module

The OUI/Drug tool is hard-bound to the active ARC case. In production its working state is authoritative in D1 via `/sync/module-state` and uses optimistic revision checks so a stale browser cannot silently overwrite newer work. Local `file://` preview still uses local storage because Workers are unavailable offline.

## People / Parties module

The People module uses the same active ARC case and persists its production people/extraction state through `/sync/module-state?module=people`. Updates use optimistic revision checks (`If-Match`) and stop on a cross-session conflict rather than overwriting newer data. Local `file://` preview continues to use the module's local prototype store because Workers are unavailable offline. Existing browser-local People data is not silently imported into production D1; migrate it deliberately if needed.

## Rollback

- Workers: use Cloudflare Worker deployment/version rollback.
- Pages: use Cloudflare Pages deployment history.
- D1 migrations in this release use `CREATE TABLE IF NOT EXISTS` and do not drop existing case tables.
