# ARC final repaired build — deployment runbook

Deploy to a staging hostname first. Do not put live case work through the build until the staging preflight and closed-case checks pass.

## 0. What gets deployed

- Cloudflare Pages/static output: `site/`
- AI Worker: `cloudflare-worker/ai/` → `/ai/*`
- Legal Worker: `cloudflare-worker/legal/` → `/legal-api/*`
- Research Worker: `cloudflare-worker/research/` → `/research-api/*`
- D1 schema: `cloudflare-worker/legal/schema.sql`
- R2 bucket: `arc-legal-files` (or change the binding consistently)

The static site now contains the shared ARC files that were missing from the earlier build.

## 1. Create or select D1 and R2

If you do not already have the resources:

```bash
wrangler d1 create arc_legal
wrangler r2 bucket create arc-legal-files
```

Put the real D1 database ID into **all three** Worker `wrangler.toml` files.

Apply the schema:

```bash
wrangler d1 execute arc_legal --file=cloudflare-worker/legal/schema.sql --remote
```

The schema currently creates 15 tables, including `legal_users`, `case_assignments`, CourtListener cache/authority tables, motion/version/audit tables, `provider_log`, and `web_research_records`.

## 2. Configure Cloudflare Access values

In each Worker `wrangler.toml`, replace:

- `ACCESS_TEAM_DOMAIN`
- `ACCESS_AUD`
- D1 `database_id`
- `ALLOWED_ORIGINS` for your staging hostname first

The legal Worker also needs the R2 `FILES` binding to the bucket you created.

Check for placeholders before deployment:

```bash
grep -RniE 'REPLACE|your-team|your-access|your-d1' cloudflare-worker/*/wrangler.toml
```

It should return nothing after you finish configuration.

## 3. Set secrets — never paste them into ARC webpages

AI Worker:

```bash
cd cloudflare-worker/ai
wrangler secret put GOOGLE_API_KEY
wrangler secret put ANTHROPIC_API_KEY
```

Legal Worker:

```bash
cd ../legal
wrangler secret put COURTLISTENER_API_KEY
wrangler secret put ANTHROPIC_API_KEY
```

Research Worker:

```bash
cd ../research
wrangler secret put FIRECRAWL_API_KEY
```

`wrangler secret list` should show the names, not their values.

## 4. Deploy the Workers

```bash
cd cloudflare-worker/ai && wrangler deploy
cd ../legal && wrangler deploy
cd ../research && wrangler deploy
```

The included route patterns are:

- `arcdefensereport.com/ai/*`
- `arcdefensereport.com/legal-api/*`
- `arcdefensereport.com/research-api/*`

For staging, change the route/hostname to your staging domain before deploying.

Put all protected Worker routes behind the same Cloudflare Access application as ARC. `/ai/policy` exposes only the routing policy and does not expose credentials.

## 5. Seed the first ARC legal administrator

Unknown Access identities are created as `pending` and refused. Seed the first administrator directly in D1:

```bash
wrangler d1 execute arc_legal --remote --command="INSERT INTO legal_users (email,name,role,status,created_at,updated_at) VALUES ('YOUR_EMAIL','Administrator','administrator','active',datetime('now'),datetime('now')) ON CONFLICT(email) DO UPDATE SET role='administrator',status='active',updated_at=datetime('now');"
```

Use the same email Cloudflare Access supplies.

Case-scoped legal/research operations require `case_assignments` unless the user is an administrator or supervisor.

## 6. Deploy the static site

Publish the contents of `site/` as the Cloudflare Pages output directory.

Important load order on pages using shared case/AI data:

```html
<script src="arc_unified_bridge.js"></script>
<script src="arc_case_link.js"></script>
<script src="arc_ai_client.js"></script>
<!-- module script after these -->
```

Chain Review and Forensic Video also load `arc_gemini_client.js`, but this repaired client contains **no provider key**. It routes through `/ai/google/*`.

## 7. Run ARC Preflight on staging

Open:

`https://YOUR-STAGING-HOST/arc_preflight.html`

while signed in through Cloudflare Access and with a test case selected.

The preflight checks:

- shared unified bridge and ARCBridge contract
- active-case fields/conflicts
- AI gateway routing policy
- real Gemini round-trip
- real Claude round-trip (subject to role)
- no legacy Gemini key in browser storage
- Legal Worker D1/R2/provider configuration
- active-case legal authorization
- Firecrawl Worker configuration
- approved final-report material

Do not proceed with live case work while preflight shows red failures.

## 8. Closed-case proof

Before using a live case:

1. Open a closed case you know well.
2. Approve a small set of findings/facts with source citations.
3. Run Discovery Review and verify that AI output remains `needs_review` until accepted.
4. Run Chain Review and confirm the browser contains no provider credential.
5. Run Forensic Video on a non-sensitive test clip and verify upload/processing through the gateway.
6. Draft a final report and verify every `[FACT:id]` / `[CASE:key]` tag against the source record.
7. In Motion & Legal, import CourtListener authority, verify it, draft, and confirm filing review blocks unresolved placeholders/unverified citations.
8. Run Public Web Research, save one public page, and confirm it is stored as `Unverified` with SHA-256.
9. Export legal/report packages and verify no API keys, internal-only notes, or other-case material appear.

Repeat on at least three closed matters before cutover.

## 9. Production cutover

After staging passes:

- Set `ALLOWED_ORIGINS` to production in all Workers.
- Set production route patterns if you used a staging hostname.
- Redeploy all three Workers.
- Deploy the verified `site/` directory.
- Clear any legacy browser key that may exist from an older ARC release:

```js
localStorage.removeItem('ARC_GEMINI_KEY_V1')
```

The repaired Gemini client also clears that legacy key automatically when it loads.

## Known limitations that remain

- Live Cloudflare/provider integration cannot be proven until deployed with your Access/D1/R2/secrets.
- The static `ARCUnified` compatibility record included here is browser-local. Preserve your existing known-good `/sync/*` shared-case deployment if it is already in production; this repair pass did not replace that backend.
- Browser print is still the PDF path for the final report UI.
- Worker rate limiting is isolate-local; use a Durable Object/KV counter before substantially expanding staff or traffic.
- Automatic negative-treatment/superseding-authority analysis is not a substitute for attorney review; authority status remains a reviewed legal workflow.
- Very large media still goes browser → Google after the secure Worker creates the resumable upload session. Confirm external transmission is permitted for protected material.
