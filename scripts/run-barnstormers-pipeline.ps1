# Barnstormers scrape entry point for npm run pipeline:barnstormers*
param(
  [switch] $DryRun,
  [switch] $Preview,
  [string[]] $Category = @(),
  [int] $Limit = 0
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$py = Join-Path $RepoRoot ".venv312\Scripts\python.exe"
$script = Join-Path $RepoRoot "scraper\barnstormers_scraper.py"
if (-not (Test-Path $py)) { throw "Python venv not found at $py" }

$args = @($script)
if ($DryRun -or $Preview) { $args += "--dry-run" }
if ($Category.Count -gt 0) {
  $args += "--category"
  $args += $Category
}
if ($Limit -gt 0) {
  $args += "--limit"
  $args += "$Limit"
}
elseif ($Preview) {
  $args += "--limit"
  $args += "5"
}

Write-Host "Running: $py $($args -join ' ')" -ForegroundColor Cyan
& $py @args
exit $LASTEXITCODE
