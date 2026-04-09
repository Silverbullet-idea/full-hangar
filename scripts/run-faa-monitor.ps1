# npm run pipeline:faa-monitor — enriches listings from FAA registry (pending queue).
# Note: There is no faa_registry_monitor.py in-repo; this wraps enrich_faa.py (operational FAA pass).
param(
  [switch] $DryRun,
  [switch] $Preview,
  [int] $Limit = 0
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$py = Join-Path $RepoRoot ".venv312\Scripts\python.exe"
$script = Join-Path $RepoRoot "scraper\enrich_faa.py"
if (-not (Test-Path $py)) { throw "Python venv not found at $py" }

$args = @($script)
if ($DryRun -or $Preview) { $args += "--dry-run" }
$effLimit = if ($Limit -gt 0) { $Limit } elseif ($Preview) { 50 } else { 0 }
if ($effLimit -gt 0) {
  $args += "--limit"
  $args += "$effLimit"
}

Write-Host "Running: $py $($args -join ' ')" -ForegroundColor Cyan
& $py @args
exit $LASTEXITCODE
