# One-command Controller.com scrape against an always-warm Chrome CDP session.
#
# Usage examples:
#   .\scripts\run-controller-pipeline.ps1
#   .\scripts\run-controller-pipeline.ps1 --dry-run --limit 10
#   .\scripts\run-controller-pipeline.ps1 --make Cessna Piper

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$portInUse = (netstat -ano | Select-String ":9222 ").Count -gt 0
if (-not $portInUse) {
    $launchScript = Join-Path $PSScriptRoot "launch-chrome-controller.ps1"
    Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-File", $launchScript
    Start-Sleep -Seconds 5
}

$activate = Join-Path $repoRoot ".venv312\Scripts\Activate.ps1"
if (Test-Path -LiteralPath $activate) {
    . $activate
}

$forwardArgs = @($args | Where-Object { $_ -ne "--" })
$python = Join-Path $repoRoot ".venv312\Scripts\python.exe"
$scraper = Join-Path $repoRoot "scraper\controller_scraper.py"

& $python $scraper `
    --cdp-url "http://localhost:9222" `
    --captcha-resume file `
    @forwardArgs
