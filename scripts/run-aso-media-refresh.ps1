# npm run pipeline:aso:media:refresh — sparse-media detail fetch for ASO gallery fields.
param([switch] $Preview)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$py = Join-Path $RepoRoot ".venv312\Scripts\python.exe"
$script = Join-Path $RepoRoot "scraper\aso_media_backfill.py"
if (-not (Test-Path $py)) { throw "Python venv not found at $py" }

$args = @($script)
if ($Preview) {
  $args += "--dry-run"
  $args += "--limit"
  $args += "5"
}

Write-Host "Running: $py $($args -join ' ')" -ForegroundColor Cyan
& $py @args
exit $LASTEXITCODE
