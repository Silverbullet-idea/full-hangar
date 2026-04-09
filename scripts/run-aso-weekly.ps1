# npm run pipeline:aso:weekly — same pass as scheduled "recent-aware" ASO maintenance.
param([switch] $Preview)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ($Preview) {
  Set-Location $RepoRoot
  $py = Join-Path $RepoRoot ".venv312\Scripts\python.exe"
  $script = Join-Path $RepoRoot "scraper\aso_scraper.py"
  $args = @(
    $script, "--detail", "--dry-run",
    "--skip-recent-detail-days", "14",
    "--limit-listings", "2",
    "--delay-min", "3", "--delay-max", "6",
    "--page-delay-min", "5", "--page-delay-max", "10",
    "--detail-delay-min", "4", "--detail-delay-max", "9"
  )
  Write-Host "Preview: $py $($args -join ' ')" -ForegroundColor Cyan
  & $py @args
  exit $LASTEXITCODE
}

$child = Join-Path $PSScriptRoot "run-aso-recent-aware-refresh.ps1"
& $child
exit $LASTEXITCODE
