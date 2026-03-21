# Full fleet re-score to intelligence v1.9.3, refresh post-fix audit artifact, optional git commit.
# Run from repo root:
#   powershell -ExecutionPolicy Bypass -File .\scripts\run-v193-full-backfill-then-audit-commit.ps1
# Optional:
#   -SkipBackfill          # only run npm post-backfill + commit (backfill already finished)
#   -SkipCommit            # run backfill + audit, no git commit
#   -CommitMessage "msg"   # override default commit message

param(
    [switch] $SkipBackfill,
    [switch] $SkipCommit,
    [string] $CommitMessage = "chore(scores): full v1.9.3 backfill + post-fix distribution audit"
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$py = Join-Path $RepoRoot ".venv312\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "Python venv not found at $py" }

if (-not $SkipBackfill) {
    Write-Host "== Full backfill: --all --compute-comps (long run) ==" -ForegroundColor Cyan
    & $py (Join-Path $RepoRoot "scraper\backfill_scores.py") --all --compute-comps
    if ($LASTEXITCODE -ne 0) { throw "backfill_scores.py exited $LASTEXITCODE" }
}

Write-Host "`n== Post-backfill verification + audit file ==" -ForegroundColor Cyan
npm run pipeline:score-dist:post-backfill
if ($LASTEXITCODE -ne 0) { throw "npm pipeline:score-dist:post-backfill exited $LASTEXITCODE" }

if ($SkipCommit) {
    Write-Host "`nSkipCommit: done (no git commit)." -ForegroundColor Yellow
    exit 0
}

$paths = @(
    "scraper/score_distribution_audit_post_fix.txt",
    "SCORE_DISTRIBUTION_FIX_RUNBOOK.md",
    "AGENTS.md",
    "package.json",
    "scripts/run-post-full-backfill-verification.ps1",
    "scripts/run-v193-full-backfill-then-audit-commit.ps1"
)
$existing = $paths | Where-Object { Test-Path (Join-Path $RepoRoot $_) }
git -C $RepoRoot add -- $existing
$st = git -C $RepoRoot status --porcelain
if (-not $st) {
    Write-Host "Nothing to commit (working tree clean after add)." -ForegroundColor Yellow
    exit 0
}
git -C $RepoRoot commit -m $CommitMessage
Write-Host "`nCommitted: $CommitMessage" -ForegroundColor Green
