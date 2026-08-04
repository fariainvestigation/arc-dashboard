# Deploying ARC to GitHub + Vercel + Cloudflare

Target stack:

- Repository: `https://github.com/fariainvestigation/dashboard`
- Hosting: Vercel project `dashboard-7fmv`
- DNS: Cloudflare
- Public site: `https://www.arcdefensereport.com/`

## 1. What changed for hosted deployment

The local Node server (`scripts/serve.js`) cannot run on Vercel. Its routes were
ported to serverless functions under `api/`, so the hosted site now has working
endpoints instead of static pages only:

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Service status, version, storage mode |
| `/api/cases` | GET, POST | List and create/update cases |
| `/api/cases/<id>` | GET, PUT, PATCH, POST, DELETE | Single case record |
| `/api/report-assets` | GET, POST | Case report asset records |
| `/api/report-assets/manifest` | GET | Approved final-report manifest |
| `/api/report-assets/<id>` | GET, DELETE | Single asset record |
| `/api/report-assets/files/<id>` | PUT, GET | Upload and retrieve asset files |
| `/api/geocoding/search` | GET | Nominatim geocoding for Investigation Map |
| `/api/routing/route` | POST | Valhalla routing for Investigation Map |
| `/api/ai/extract` | POST | Gemini location/entity extraction (server key preferred) |
| `/api/gemini-board-command` | POST | Intelligence Board arrangement commands (server Gemini) |
| `/api/auth/login` | POST | Email/password session login |
| `/api/auth/logout` | POST, DELETE | Clear session |
| `/api/auth/session` | GET, DELETE | Auth status / clear session |
| `/api/audit-log` | GET, POST | Per-case server audit trail |
| `/api/audit-log/batch` | POST | Bulk audit sync from browser |
| `/api/report-approvals` | GET, POST | Cross-device report approval status |

`scripts/serve.js` still runs the full local workspace,
including large evidence uploads.


## 2. Storage: required for real, persisting results

Vercel functions have no writable disk. `api/_lib/store.js` selects storage
automatically:

1. **KV / Upstash Redis REST** when `KV_REST_API_URL` and `KV_REST_API_TOKEN`
   are present — durable, this is what production needs.
2. **`/tmp`** on Vercel when KV is not configured — works, but data disappears
   on redeploys and cold starts.
3. **`./database` JSON files** when running locally.

Set it up once:

1. Vercel dashboard → project `dashboard-7fmv` → **Storage** → **Create**
   → Upstash Redis (or Vercel KV) → connect to the project.
2. Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. Redeploy. Confirm with `https://www.arcdefensereport.com/api/health` →
   `"storage": { "mode": "kv", "durable": true }`.

Without KV, mutating API writes return **503** on Vercel (unless you set
`ARC_ALLOW_EPHEMERAL_STORAGE=1`, which is for emergency diagnostics only).

Hosted uploads are capped at about 4 MB per file because of the Vercel request
body limit. Larger media should be handled through the local server.


## 3. Per-user authentication (required)

Shared `ARC_ACCESS_TOKEN` is no longer accepted.

Configure one of:

1. **Cloudflare Access** (recommended for production): set `CF_ACCESS_TEAM_DOMAIN` and
   `CF_ACCESS_AUD`. The API trusts a verified `CF-Access-JWT-Assertion`.
2. **Password login** (local/staging): set `ARC_BOOTSTRAP_EMAIL` and
   `ARC_BOOTSTRAP_PASSWORD`, then open `/login.html`.

Case and report-asset routes are owner-scoped. Alice cannot list or fetch Bob's cases.

Also set `GEMINI_API_KEY` for `/api/ai/extract` and `/api/gemini-board-command`.
Hosted AI routes reject browser-supplied keys unless `ARC_ALLOW_CLIENT_API_KEYS=1`.


## 4. Push to GitHub

From the project folder:

```bash
git init
git add .
git commit -m "ARC Integrated System v11.4 - Vercel-ready release"
git branch -M main
git remote add origin https://github.com/fariainvestigation/dashboard.git
git push -u origin main
```

If the repository already has commits:

```bash
git pull --rebase origin main
git push origin main
```

Before the first push, confirm the repository is **Private** in GitHub settings.
`.gitignore` already excludes `.env`, `database/`, `uploads/`, and `*.zip`, so
case data is not committed.

## 5. Vercel project settings

- Framework preset: **Other**
- Build command: leave empty
- Output directory: leave empty (repository root is served)
- Install command: leave empty
- Node.js version: 20 or 22

`vercel.json` pins the function runtime, disables caching for HTML and API
responses, and sets `noindex` headers so the site is not indexed while it is
under development.

## 6. Cloudflare DNS

In Vercel → Settings → Domains, add `arcdefensereport.com` and
`www.arcdefensereport.com`. In Cloudflare DNS, add the records Vercel shows:

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| CNAME | `www` | `cname.vercel-dns.com` | DNS only (grey cloud) first |
| A | `@` | `76.76.21.21` | DNS only (grey cloud) first |

Use **DNS only** until Vercel reports both domains as Valid Configuration, then
turn the orange proxy back on if you want Cloudflare in front. If SSL breaks
after proxying, set Cloudflare SSL/TLS mode to **Full (strict)**.

## 7. Verify after deploy

```bash
curl https://www.arcdefensereport.com/api/health
curl -X POST https://www.arcdefensereport.com/api/cases \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Matter","docket":"TEST-0001"}'
curl https://www.arcdefensereport.com/api/cases
```

A case created by the second command must still appear after a redeploy. If it
does not, KV is not connected yet.

## 8. Local development

```bash
npm run serve      # http://127.0.0.1:8777/
npm test           # release check + final report smoke
npm run test:api   # report asset API smoke
```
