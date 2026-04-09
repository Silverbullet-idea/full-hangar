# AvBuyer scrape entry point for npm run pipeline:avbuyer*
param(
  [switch] $DryRun,
  [switch] $Preview
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$py = Join-Path $RepoRoot ".venv312\Scripts\python.exe"
$script = Join-Path $RepoRoot "scraper\avbuyer_scraper.py"
if (-not (Test-Path $py)) { throw "Python venv not found at $py" }

$args = @($script)
if ($DryRun -or $Preview) { $args += "--dry-run" }
if ($Preview) {
  $args += "--limit-makes"
  $args += "1"
  $args += "--max-pages"
  $args += "1"
}

Write-Host "Running: $py $($args -join ' ')" -ForegroundColor Cyan
& $py @args
exit $LASTEXITCODE
