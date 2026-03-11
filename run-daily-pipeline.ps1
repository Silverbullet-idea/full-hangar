param(
  [switch]$DryRun,
  [switch]$Preview
)

$ErrorActionPreference = "Stop"

if ($Preview) {
  Write-Host "[preview] Daily order: controller -> tradaplane -> barnstormers -> afs -> aso -> globalair -> avbuyer -> faa-monitor"
  exit 0
}

if ($DryRun) {
  Write-Host "[dry-run] Running controller smoke pass"
  .venv312\Scripts\python.exe scraper\controller_scraper.py --limit 5 --dry-run
  Write-Host "[dry-run] Running tradaplane smoke pass"
  .venv312\Scripts\python.exe scraper\tradaplane_scraper.py --limit 5 --dry-run
  Write-Host "[dry-run] Running barnstormers smoke pass"
  .venv312\Scripts\python.exe scraper\barnstormers_scraper.py --limit 5 --dry-run
  exit 0
}

Write-Host "[daily] Starting Controller pipeline"
npm run pipeline:post-scrape:controller

Write-Host "[daily] Starting Trade-A-Plane pipeline"
npm run pipeline:tradaplane

Write-Host "[daily] Starting Barnstormers pipeline"
npm run pipeline:barnstormers

Write-Host "[daily] Starting AFS pipeline"
npm run pipeline:afs

Write-Host "[daily] Starting ASO pipeline"
npm run pipeline:aso

Write-Host "[daily] Starting GlobalAir pipeline"
npm run pipeline:globalair

Write-Host "[daily] Starting AvBuyer pipeline"
npm run pipeline:avbuyer

Write-Host "[daily] Starting FAA monitor pipeline"
npm run pipeline:faa-monitor
