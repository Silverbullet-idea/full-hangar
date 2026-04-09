# npm run dev:restart — free port 3001 and start Next dev server in this console.
$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
Set-Location $RepoRoot

$port = 3001
try {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $listeners) {
    try {
      Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    } catch {}
  }
} catch {
  Write-Warning "Could not query/kill listeners on port $port (non-admin?). Try closing Node manually."
}

Write-Host "Starting npm run dev on port $port..." -ForegroundColor Cyan
npm run dev
