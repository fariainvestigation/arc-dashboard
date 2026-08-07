param(
  [string]$PagesProject = ""
)
$ErrorActionPreference = "Stop"
Write-Host "ARC 11.7.1 Intake + Notebook production upgrade" -ForegroundColor Cyan
Write-Host "This upgrade does not recreate D1/R2 or re-enter provider secrets."

Write-Host "`n[1/2] Running production release tests..." -ForegroundColor Yellow
npm test
npm run test:pages-links

Write-Host "`n[2/2] Deploying DEPLOY_PAGES..." -ForegroundColor Yellow
if ($PagesProject) {
  npx wrangler pages deploy DEPLOY_PAGES --project-name $PagesProject
} else {
  Write-Host "No Pages project name supplied." -ForegroundColor Yellow
  Write-Host "Upload DEPLOY_PAGES/ to the EXISTING ARC Cloudflare Pages project, or rerun:"
  Write-Host ".\DEPLOY_UPGRADE_ONLY.ps1 -PagesProject <existing-project-name>"
}

Write-Host "`nAfter deployment: hard refresh, run /arc_preflight.html, then test New Case -> Initiate Case -> Notebook -> Extract All Pictures on a closed/test matter." -ForegroundColor Green
