# Run AFTER `backfill_scores.py --all --compute-comps` finishes successfully.
# Implements SCORE_DISTRIBUTION_FIX_RUNBOOK.md post-deployment verification (steps 2 in your checklist).
# Does NOT start or wait on backfill — run this in a new shell when the job has exited 0.
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\run-post-full-backfill-verification.ps1
# Optional:
#   -SkipDryRunValidator    # skip validate_score_distribution_fix.py (50-row dry sample)
#   -SkipValidateScores     # skip scraper/validate_scores.py

param(
    [switch] $SkipDryRunValidator,
    [switch] $SkipValidateScores
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$py = Join-Path $RepoRoot ".venv312\Scripts\python.exe"
if (-not (Test-Path $py)) {
    throw "Python venv not found at $py"
}

$auditOut = Join-Path $RepoRoot "scraper\score_distribution_audit_post_fix.txt"

Write-Host "== Post full backfill: score distribution verification ==" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"

if (-not $SkipDryRunValidator) {
    Write-Host "`n[1/3] validate_score_distribution_fix.py (dry-run sample, no DB writes)" -ForegroundColor Yellow
    & $py (Join-Path $RepoRoot "scraper\validate_score_distribution_fix.py")
    if ($LASTEXITCODE -ne 0) { throw "validate_score_distribution_fix.py exited $LASTEXITCODE" }
} else {
    Write-Host "`n[1/3] skipped (-SkipDryRunValidator)" -ForegroundColor DarkGray
}

Write-Host "`n[2/3] audit_score_distribution.py -> $auditOut" -ForegroundColor Yellow
# Windows PowerShell 5.x: Tee-Object has no -Encoding; UTF-8 is fine for this audit text.
& $py (Join-Path $RepoRoot "scraper\audit_score_distribution.py") | Tee-Object -FilePath $auditOut
if ($LASTEXITCODE -ne 0) { throw "audit_score_distribution.py exited $LASTEXITCODE" }

if (-not $SkipValidateScores) {
    Write-Host "`n[3/3] validate_scores.py" -ForegroundColor Yellow
    & $py (Join-Path $RepoRoot "scraper\validate_scores.py")
    if ($LASTEXITCODE -ne 0) { throw "validate_scores.py exited $LASTEXITCODE" }
} else {
    Write-Host "`n[3/3] skipped (-SkipValidateScores)" -ForegroundColor DarkGray
}

Write-Host "`nDone. Review $auditOut and SCORE_DISTRIBUTION_FIX_RUNBOOK.md gates." -ForegroundColor Green
