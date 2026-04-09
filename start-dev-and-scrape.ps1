# npm run dev:scrape* — start Next dev (background job) then run a source scraper.
param(
  [switch] $DryRun,
  [ValidateSet("", "controller", "afs", "aso", "globalair", "avbuyer", "barnstormers", "aerotrader")]
  [string] $Scraper = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
Set-Location $RepoRoot

$py = Join-Path $RepoRoot ".venv312\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "Python venv not found at $py" }

Write-Host "Starting dev server (background job)..." -ForegroundColor Cyan
$job = Start-Job -ScriptBlock {
  param($root)
  Set-Location $root
  npm run dev 2>&1 | Out-Null
} -ArgumentList $RepoRoot

$deadline = (Get-Date).AddMinutes(3)
$ready = $false
while ((Get-Date) -lt $deadline) {
  try {
    $t = Test-NetConnection -ComputerName localhost -Port 3001 -WarningAction SilentlyContinue
    if ($t.TcpTestSucceeded) { $ready = $true; break }
  } catch {}
  Start-Sleep -Seconds 2
}

if (-not $ready) {
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -Force -ErrorAction SilentlyContinue
  throw "Dev server did not become ready on port 3001 within timeout."
}

Write-Host "Dev server listening on 3001. Job Id=$($job.Id) (stop with Stop-Job -Id $($job.Id))" -ForegroundColor Green

if (-not $Scraper) {
  Write-Host "No -Scraper specified; dev-only mode. Waiting on background job..." -ForegroundColor Yellow
  Wait-Job $job
  exit 0
}

function Stop-DevJob {
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -Force -ErrorAction SilentlyContinue
}

switch ($Scraper) {
  "controller" {
    $pyArgs = @("scraper\controller_scraper.py")
    if ($DryRun) { $pyArgs += @("--dry-run", "--limit", "2", "--no-detail") }
    else { $pyArgs += "--resume" }
    Write-Host "Running: $py $($pyArgs -join ' ')" -ForegroundColor Cyan
    & $py @pyArgs
    $code = $LASTEXITCODE
    Stop-DevJob
    exit $code
  }
  "afs" {
    $script = Join-Path $RepoRoot "scripts\run-afs-pipeline.ps1"
    if ($DryRun) { & $script -DryRun } else { & $script }
    $code = $LASTEXITCODE
    Stop-DevJob
    exit $code
  }
  "aso" {
    $script = Join-Path $RepoRoot "scripts\run-aso-pipeline.ps1"
    if ($DryRun) { & $script -DryRun } else { & $script }
    $code = $LASTEXITCODE
    Stop-DevJob
    exit $code
  }
  "globalair" {
    $script = Join-Path $RepoRoot "scripts\run-globalair-pipeline.ps1"
    if ($DryRun) { & $script -DryRun } else { & $script }
    $code = $LASTEXITCODE
    Stop-DevJob
    exit $code
  }
  "avbuyer" {
    $script = Join-Path $RepoRoot "scripts\run-avbuyer-pipeline.ps1"
    if ($DryRun) { & $script -DryRun } else { & $script }
    $code = $LASTEXITCODE
    Stop-DevJob
    exit $code
  }
  "barnstormers" {
    $script = Join-Path $RepoRoot "scripts\run-barnstormers-pipeline.ps1"
    if ($DryRun) { & $script -DryRun } else { & $script }
    $code = $LASTEXITCODE
    Stop-DevJob
    exit $code
  }
  "aerotrader" {
    $pyArgs = @("scraper\aerotrader_scraper.py")
    if ($DryRun) { $pyArgs += @("--dry-run", "--limit", "2") }
    Write-Host "Running: $py $($pyArgs -join ' ')" -ForegroundColor Cyan
    & $py @pyArgs
    $code = $LASTEXITCODE
    Stop-DevJob
    exit $code
  }
}

Stop-DevJob
exit 1
