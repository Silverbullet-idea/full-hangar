# ASO deep scrape entry point for npm run pipeline:aso*
param(
  [switch] $DryRun,
  [switch] $Preview
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$py = Join-Path $RepoRoot ".venv312\Scripts\python.exe"
$script = Join-Path $RepoRoot "scraper\aso_scraper.py"
if (-not (Test-Path $py)) { throw "Python venv not found at $py" }

$args = @(
  $script,
  "--detail",
  "--delay-min", "3",
  "--delay-max", "6",
  "--page-delay-min", "5",
  "--page-delay-max", "10",
  "--detail-delay-min", "4",
  "--detail-delay-max", "9"
)
if ($DryRun -or $Preview) { $args += "--dry-run" }
if ($Preview) {
  $args += "--limit-listings"
  $args += "3"
}

Write-Host "Running: $py $($args -join ' ')" -ForegroundColor Cyan
& $py @args
exit $LASTEXITCODE
