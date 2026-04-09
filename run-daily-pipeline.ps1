# npm run pipeline:daily* — FAA enrich + bounded backfill + market comps recompute.
param(
  [switch] $DryRun,
  [switch] $Preview
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
Set-Location $RepoRoot

$py = Join-Path $RepoRoot ".venv312\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "Python venv not found at $py" }

Write-Host "=== Daily: enrich_faa ===" -ForegroundColor Cyan
$faaArgs = @("scraper\enrich_faa.py")
if ($DryRun -or $Preview) { $faaArgs += @("--dry-run", "--limit", "20") }
else { $faaArgs += @("--limit", "8000") }
& $py @faaArgs
if ($LASTEXITCODE -ne 0) { throw "enrich_faa exited $LASTEXITCODE" }

Write-Host "`n=== Daily: backfill_scores ===" -ForegroundColor Cyan
$bfArgs = @("scraper\backfill_scores.py")
if ($DryRun -or $Preview) { $bfArgs += @("--dry-run", "--limit", "15") }
else { $bfArgs += @("--limit", "3000") }
& $py @bfArgs
if ($LASTEXITCODE -ne 0) { throw "backfill_scores exited $LASTEXITCODE" }

Write-Host "`n=== Daily: compute_market_comps ===" -ForegroundColor Cyan
$cmpArgs = @("scraper\compute_market_comps.py")
if ($DryRun -or $Preview) { $cmpArgs += "--dry-run" }
& $py @cmpArgs
if ($LASTEXITCODE -ne 0) { throw "compute_market_comps exited $LASTEXITCODE" }

Write-Host "`nDaily pipeline complete." -ForegroundColor Green
