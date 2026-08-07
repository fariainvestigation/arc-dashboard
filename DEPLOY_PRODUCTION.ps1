param(
  [string]$AdminEmail = "",
  [string]$PagesProject = ""
)
$ErrorActionPreference = "Stop"
Write-Host "ARC production deployment" -ForegroundColor Cyan
Write-Host "Domain: arcdefensereport.com"
Write-Host "D1: arc_legal / 6c04c557-f8de-4590-a235-76fa117ff6d8"
Write-Host "R2: arc-legal-files"

Write-Host "`n[1/7] Running local release tests..." -ForegroundColor Yellow
npm test

Write-Host "`n[2/7] Verifying R2 bucket..." -ForegroundColor Yellow
$bucketList = (npx wrangler r2 bucket list 2>&1 | Out-String)
if ($bucketList -notmatch "arc-legal-files") {
  Write-Host "arc-legal-files was not found; creating it now..." -ForegroundColor Yellow
  npx wrangler r2 bucket create arc-legal-files
} else {
  Write-Host "arc-legal-files already exists; reusing the production bucket." -ForegroundColor Green
}

Write-Host "`n[3/7] Applying shared D1 schema..." -ForegroundColor Yellow
npx wrangler d1 execute arc_legal --remote --file=cloudflare-worker/production_schema.sql --config=cloudflare-worker/legal/wrangler.toml

if (-not $AdminEmail) { $AdminEmail = Read-Host "Exact Cloudflare Access email for the first ARC administrator" }
if (-not $AdminEmail.Contains("@")) { throw "A valid administrator email is required." }
$escaped = $AdminEmail.Replace("'", "''").ToLowerInvariant()
$sql = "INSERT INTO legal_users (email,name,role,status,created_at,updated_at) VALUES ('$escaped','ARC Administrator','administrator','active',datetime('now'),datetime('now')) ON CONFLICT(email) DO UPDATE SET role='administrator',status='active',updated_at=datetime('now');"
npx wrangler d1 execute arc_legal --remote --config=cloudflare-worker/legal/wrangler.toml --command=$sql

Write-Host "`n[4/7] Enter AI Worker secrets when prompted..." -ForegroundColor Yellow
npx wrangler secret put GOOGLE_API_KEY --config=cloudflare-worker/ai/wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY --config=cloudflare-worker/ai/wrangler.toml

Write-Host "`n[5/7] Enter Legal/Research Worker secrets when prompted..." -ForegroundColor Yellow
npx wrangler secret put COURTLISTENER_API_KEY --config=cloudflare-worker/legal/wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY --config=cloudflare-worker/legal/wrangler.toml
npx wrangler secret put FIRECRAWL_API_KEY --config=cloudflare-worker/research/wrangler.toml

Write-Host "`n[6/7] Deploying Workers..." -ForegroundColor Yellow
npx wrangler deploy --config=arc-sync-backend/wrangler.toml
npx wrangler deploy --config=cloudflare-worker/ai/wrangler.toml
npx wrangler deploy --config=cloudflare-worker/legal/wrangler.toml
npx wrangler deploy --config=cloudflare-worker/research/wrangler.toml

Write-Host "`n[7/7] Static frontend" -ForegroundColor Yellow
if ($PagesProject) {
  npx wrangler pages deploy DEPLOY_PAGES --project-name $PagesProject
} else {
  Write-Host "Pages was not deployed automatically because no Pages project name was supplied."
  Write-Host "Upload DEPLOY_PAGES/ to the existing Cloudflare Pages project, or rerun with -PagesProject <name>."
}

Write-Host "`nDeployment commands completed. Open https://arcdefensereport.com/arc_preflight.html while signed in before live case work." -ForegroundColor Green
