# npm run pipeline:post-scrape* — optional source scrape, then FAA enrich + bounded score backfill.
# NTSB flags are accepted for forward compatibility; no NTSB loader exists in scraper/ yet (skipped with warning).
param(
  [ValidateSet("", "afs", "aso", "globalair", "controller", "avbuyer", "barnstormers", "aerotrader")]
  [string] $Scraper = "",
  [switch] $AllMakes,
  [switch] $LoadNtsb,
  [switch] $NtsbDownload,
  [switch] $DryRun,
  [switch] $Preview
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
Set-Location $RepoRoot

$py = Join-Path $RepoRoot ".venv312\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "Python venv not found at $py" }

if ($LoadNtsb -or $NtsbDownload) {
  Write-Warning "LoadNtsb/NtsbDownload: no NTSB ingest script in-repo; skipping NTSB step."
}

if ($Scraper) {
  Write-Host "`n=== Post-scrape: source scrape ($Scraper) ===" -ForegroundColor Cyan
  switch ($Scraper) {
    "controller" {
      $cArgs = @("scraper\controller_scraper.py")
      if ($DryRun -or $Preview) { $cArgs += @("--dry-run", "--limit", "3", "--no-detail") }
      elseif ($AllMakes) { $cArgs += @("--category", "all") }
      else { $cArgs += "--resume" }
      & $py @cArgs
      if ($LASTEXITCODE -ne 0) { throw "controller_scraper exited $LASTEXITCODE" }
    }
    "afs" {
      $s = Join-Path $RepoRoot "scripts\run-afs-pipeline.ps1"
      if ($Preview) { & $s -Preview }
      elseif ($DryRun) { & $s -DryRun }
      else { & $s }
      if ($LASTEXITCODE -ne 0) { throw "run-afs-pipeline exited $LASTEXITCODE" }
    }
    "aso" {
      $s = Join-Path $RepoRoot "scripts\run-aso-pipeline.ps1"
      if ($Preview) { & $s -Preview }
      elseif ($DryRun) { & $s -DryRun }
      else { & $s }
      if ($LASTEXITCODE -ne 0) { throw "run-aso-pipeline exited $LASTEXITCODE" }
    }
    "globalair" {
      $s = Join-Path $RepoRoot "scripts\run-globalair-pipeline.ps1"
      if ($Preview) { & $s -Preview }
      elseif ($DryRun) { & $s -DryRun }
      else { & $s }
      if ($LASTEXITCODE -ne 0) { throw "run-globalair-pipeline exited $LASTEXITCODE" }
    }
    "avbuyer" {
      $s = Join-Path $RepoRoot "scripts\run-avbuyer-pipeline.ps1"
      if ($Preview) { & $s -Preview }
      elseif ($DryRun) { & $s -DryRun }
      else { & $s }
      if ($LASTEXITCODE -ne 0) { throw "run-avbuyer-pipeline exited $LASTEXITCODE" }
    }
    "barnstormers" {
      $s = Join-Path $RepoRoot "scripts\run-barnstormers-pipeline.ps1"
      if ($Preview) { & $s -Preview }
      elseif ($DryRun) { & $s -DryRun }
      else { & $s }
      if ($LASTEXITCODE -ne 0) { throw "run-barnstormers-pipeline exited $LASTEXITCODE" }
    }
    "aerotrader" {
      $aArgs = @("scraper\aerotrader_scraper.py")
      if ($DryRun -or $Preview) { $aArgs += @("--dry-run", "--limit", "2") }
      & $py @aArgs
      if ($LASTEXITCODE -ne 0) { throw "aerotrader_scraper exited $LASTEXITCODE" }
    }
  }
}

Write-Host "`n=== Post-scrape: enrich_faa ===" -ForegroundColor Cyan
$faaArgs = @("scraper\enrich_faa.py")
if ($DryRun -or $Preview) { $faaArgs += @("--dry-run", "--limit", "30") }
else { $faaArgs += @("--limit", "5000") }
& $py @faaArgs
if ($LASTEXITCODE -ne 0) { throw "enrich_faa exited $LASTEXITCODE" }

Write-Host "`n=== Post-scrape: backfill_scores (bounded) ===" -ForegroundColor Cyan
$bfArgs = @("scraper\backfill_scores.py")
if ($DryRun -or $Preview) { $bfArgs += @("--dry-run", "--limit", "25") }
else { $bfArgs += @("--limit", "2000") }
& $py @bfArgs
if ($LASTEXITCODE -ne 0) { throw "backfill_scores exited $LASTEXITCODE" }

Write-Host "`nPost-scrape pipeline complete." -ForegroundColor Green
