# Chunked full-table re-score: `backfill_scores.py --all` in batches, then one market_comps recompute.
# Uses scraper/state/backfill_scores_checkpoint.json between chunks (preserved when --limit is set).
#
# Stops the "frozen PowerShell" effect: httpx per-request lines are hidden (--quiet-http) so you see
# backfill progress (e.g. "Updated 50 listings..."). Logs still go to scraper/logs/backfill_chunk_*.log
#
# Examples:
#   powershell -ExecutionPolicy Bypass -File .\scripts\run-backfill-all-chunked.ps1 -ChunkSize 500 -FreshStart
#   powershell -ExecutionPolicy Bypass -File .\scripts\run-backfill-all-chunked.ps1 -ChunkSize 1000   # resume from checkpoint
#
param(
    [int] $ChunkSize = 1000,
    [switch] $FreshStart,
    [switch] $SkipComputeComps,
    [int] $MaxChunks = 500
)

# Python/httpx log to stderr; must not use Stop while teeing or PowerShell treats stderr as terminating errors.
$ErrorActionPreference = "Continue"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$env:PYTHONUNBUFFERED = "1"
$env:FULL_HANGAR_BACKFILL_QUIET_HTTP = "1"
$py = Join-Path $RepoRoot ".venv312\Scripts\python.exe"
$bf = Join-Path $RepoRoot "scraper\backfill_scores.py"
$checkpoint = Join-Path $RepoRoot "scraper\state\backfill_scores_checkpoint.json"
$logDir = Join-Path $RepoRoot "scraper\logs"
$null = New-Item -ItemType Directory -Force -Path $logDir

if (-not (Test-Path $py)) { throw "Python venv not found at $py" }
if ($ChunkSize -lt 1) { throw "ChunkSize must be >= 1" }

function Get-AttemptedFromLog([string] $path) {
    $raw = Get-Content -LiteralPath $path -Raw -ErrorAction Stop
    $all = [regex]::Matches($raw, 'Backfill summary \| mode=db \| attempted=(\d+)')
    if ($all.Count -lt 1) { throw "Could not parse attempted= from log: $path" }
    return [int]$all[$all.Count - 1].Groups[1].Value
}

function Assert-BackfillSummary([string] $path) {
    $raw = Get-Content -LiteralPath $path -Raw -ErrorAction Stop
    if ($raw -notmatch 'Backfill summary \| mode=db \| attempted=(\d+) \| scored=(\d+) \| failed=(\d+)') {
        throw "Missing Backfill summary line in: $path"
    }
    $failed = [int]$Matches[3]
    if ($failed -gt 0) {
        throw "backfill_scores reported failed=$failed (inspect $path)"
    }
}

$completedNatural = $false
$chunkIndex = 0
while ($chunkIndex -lt $MaxChunks) {
    $chunkIndex++
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $logFile = Join-Path $logDir ("backfill_chunk_{0:D3}_{1}.log" -f $chunkIndex, $stamp)

    # python -u: unbuffered stdout/stderr so Tee-Object updates the console promptly.
    $argList = @("-u", $bf, "--all", "--limit", "$ChunkSize", "--quiet-http")
    if ($FreshStart -and $chunkIndex -eq 1) {
        $argList += "--clear-checkpoint"
    }
    elseif (Test-Path $checkpoint) {
        $argList += "--resume-from-checkpoint"
    }

    Write-Host "`n=== Chunk $chunkIndex | limit=$ChunkSize ===" -ForegroundColor Cyan
    Write-Host "Log file: $logFile" -ForegroundColor DarkGray
    Write-Host "Tip: second window -> Get-Content -Path '$logFile' -Wait -Tail 20" -ForegroundColor DarkGray

    & $py @argList 2>&1 | Tee-Object -FilePath $logFile

    if ($LASTEXITCODE -ne 0) {
        throw "python.exe exited $LASTEXITCODE (full log: $logFile)"
    }
    Assert-BackfillSummary $logFile

    $attempted = Get-AttemptedFromLog $logFile

    Write-Host "`n--- Last 25 lines of chunk log ---" -ForegroundColor DarkCyan
    Get-Content -LiteralPath $logFile -Tail 25

    Write-Host "`nChunk $chunkIndex done: attempted=$attempted" -ForegroundColor Green

    if ($attempted -lt $ChunkSize) {
        Write-Host "Last chunk (attempted < ChunkSize): full fleet processed." -ForegroundColor Green
        $completedNatural = $true
        break
    }
}

if ($chunkIndex -ge $MaxChunks) {
    Write-Host "MaxChunks ($MaxChunks) reached with full-size chunks; checkpoint kept for resume: $checkpoint" -ForegroundColor Yellow
}

if (-not $SkipComputeComps -and $completedNatural) {
    Write-Host "`n=== Recomputing market_comps (once) ===" -ForegroundColor Cyan
    $compsLog = Join-Path $logDir ("compute_market_comps_{0}.log" -f (Get-Date -Format "yyyyMMdd_HHmmss"))
    & $py "-u" $bf "--compute-comps-only" "--quiet-http" 2>&1 | Tee-Object -FilePath $compsLog
    if ($LASTEXITCODE -ne 0) { throw "compute-comps-only exited $LASTEXITCODE (log: $compsLog)" }
}

if ($completedNatural -and (Test-Path $checkpoint)) {
    Remove-Item $checkpoint -Force
    Write-Host "Removed checkpoint file (run complete): $checkpoint" -ForegroundColor DarkGray
}

Write-Host "`nDone. Optional: npm run pipeline:score-dist:post-backfill" -ForegroundColor Green
