# FullHangar — dedicated Chrome for Controller.com (CDP port 9222, isolated profile).
# Not your daily Chrome: uses %USERPROFILE%\AppData\Local\FullHangar\ChromeProfile

$ErrorActionPreference = "Stop"

$profileDir = Join-Path $env:USERPROFILE "AppData\Local\FullHangar\ChromeProfile"
if (-not (Test-Path -LiteralPath $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

$portInUse = (netstat -ano | Select-String ":9222 ").Count -gt 0
if ($portInUse) {
    Write-Host "Chrome CDP already running on port 9222"
    exit 0
}

$chromeCandidates = @(
    "$env:PROGRAMFILES\Google\Chrome\Application\chrome.exe"
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chromeExe = $null
foreach ($c in $chromeCandidates) {
    if (Test-Path -LiteralPath $c) {
        $chromeExe = $c
        break
    }
}

if (-not $chromeExe) {
    Write-Error "Chrome executable not found. Checked: Program Files, Program Files (x86), and LocalAppData Google Chrome paths."
    exit 1
}

$userDataArg = "--user-data-dir=$profileDir"
$launchArgs = @(
    "--remote-debugging-port=9222"
    $userDataArg
    "--no-first-run"
    "--no-default-browser-check"
    "--window-size=1280,900"
    "https://www.controller.com"
)

Start-Process -FilePath $chromeExe -ArgumentList $launchArgs

Write-Host "FullHangar Chrome started. CDP endpoint: http://localhost:9222"
Write-Host "Run the scraper with: .venv312\Scripts\python.exe scraper\controller_scraper.py --cdp-url http://localhost:9222"
Write-Host "Leave this Chrome window open to maintain the Distil session."
