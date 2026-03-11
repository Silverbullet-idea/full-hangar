# DS-1 Cursor Tasks — Barnstormers Integration

> The scraper framework is fully built at `scraper/barnstormers_scraper.py`.
> These tasks are small, targeted verification and wiring steps.
> Each task is independent and safe to assign to a single Cursor agent.
> Python runtime: `.venv312\Scripts\python.exe`

---

## BS-1: Verify Category IDs

**File to edit:** `scraper/barnstormers_scraper.py`
**Estimated time:** 10 minutes

Open https://www.barnstormers.com in a browser. Click each category link in the
left navigation (Single Engine Piston, Multi-Engine, Turboprop, etc.). For each,
look at the URL in the address bar and note the `?cat=` number.

Update the `CATEGORIES` dict near the top of `barnstormers_scraper.py` so every
entry has the correct current cat ID. The dict looks like this:

```python
CATEGORIES = {
    "Single Engine Piston":   1,   # ← verify this number
    "Multi-Engine Piston":    2,   # ← verify this number
    ...
}
```

Save the file. No code execution needed for this task.

---

## BS-2: Confirm Pagination URL Pattern

**File to edit:** `scraper/barnstormers_scraper.py`
**Estimated time:** 5 minutes

On the Barnstormers site, navigate to Single Engine Piston listings and click to
page 2. Check the URL in the address bar.

Find the `build_category_url` function in `barnstormers_scraper.py` and confirm
the URL it builds matches what you saw. The function currently generates:

```
https://www.barnstormers.com/cat.php?mode=list&cat=1&start=30
```

If the real page 2 URL looks different (different parameter name, different offset),
update the `build_category_url` function to match.

---

## BS-3: Identify Listing Card HTML Selector

**File to edit:** `scraper/barnstormers_scraper.py`
**Estimated time:** 15 minutes

This is the most important verification step.

1. Go to https://www.barnstormers.com/cat.php?mode=list&cat=1
2. Right-click on any listing card → **Inspect Element**
3. Find the repeating HTML element that wraps each listing (div, tr, li, etc.)
4. Note its tag name and class (e.g. `<div class="listing-item">` or `<tr class="listRow">`)

Find the `_get_listing_cards` function in `barnstormers_scraper.py`.
Update the **primary selector** at the top of the function to match what you found:

```python
# Replace this line with the correct selector you found:
cards = soup.select("div.listing-item, div.classified-ad, tr.listing-row")
```

Then run a quick test to confirm it finds cards:

```bash
.venv312\Scripts\python.exe scraper\barnstormers_scraper.py --category "Single Engine Piston" --limit 3 --dry-run
```

You should see 3 listings printed. If you see "0 cards" in the output, the selector
is still wrong — keep adjusting until listings appear.

---

## BS-4: Verify Listing Card Sub-Selectors

**File to edit:** `scraper/barnstormers_scraper.py`
**Estimated time:** 20 minutes

With the card selector working from BS-3, now verify the inner field selectors.
Inspect a listing card in the browser and find the HTML elements for each field.

In the `parse_listing_card` function, locate the comments marked:
- `# CURSOR TASK BS-6a` — listing URL / title link
- `# CURSOR TASK BS-6b` — price element
- `# CURSOR TASK BS-6c` — location text
- `# CURSOR TASK BS-6d` — date posted

For each one, update the CSS selector or regex to match the actual HTML you see.

After each change, re-run the dry-run test and verify the field appears in output:

```bash
.venv312\Scripts\python.exe scraper\barnstormers_scraper.py --category "Single Engine Piston" --limit 5 --dry-run
```

A good result looks like:
```
  1977 Cessna 172N Skyhawk
  Price:    $32,500
  Location: Spokane, WA
  N#:       N5432B
  URL:      https://www.barnstormers.com/classified-1234567...
```

---

## BS-5: Verify Detail Page Selectors

**File to edit:** `scraper/barnstormers_scraper.py`
**Estimated time:** 20 minutes

Click into any real Barnstormers listing to open its detail page.
Inspect the HTML and find the elements for each of these fields:

1. **Full description text** — the main body of the listing description
2. **Photo gallery** — the container holding all listing photos
3. **Seller info** — seller name / contact section

In the `parse_detail_page` function, locate comments marked:
- `# CURSOR TASK BS-7a` — description container selector
- `# CURSOR TASK BS-7b` — seller info selector  
- `# CURSOR TASK BS-7c` — photo gallery selector

Update each selector to match the real HTML.

Test against a real listing URL:

```bash
.venv312\Scripts\python.exe -c "
import requests
from bs4 import BeautifulSoup
from barnstormers_scraper import parse_detail_page
import sys, json
sys.path.insert(0, 'scraper')
from barnstormers_scraper import parse_detail_page, REQUEST_HEADERS
resp = requests.get('https://www.barnstormers.com/classified-REPLACE_WITH_REAL_ID.html', headers=REQUEST_HEADERS)
soup = BeautifulSoup(resp.text, 'html.parser')
result = parse_detail_page(soup, {})
print(json.dumps({k: str(v)[:80] for k, v in result.items()}, indent=2))
"
```

Replace `REPLACE_WITH_REAL_ID` with any real listing ID from the site.
Confirm `description_full`, `image_urls`, and `seller_name` appear in the output.

---

## BS-6: Run First Live Test (5 Listings, No DB Write)

**Estimated time:** 5 minutes

With all selectors verified, run a real 5-listing dry-run across two categories:

```bash
.venv312\Scripts\python.exe scraper\barnstormers_scraper.py ^
  --category "Single Engine Piston" "Multi-Engine Piston" ^
  --limit 5 ^
  --dry-run ^
  --verbose
```

Confirm:
- [ ] 5 listings are printed
- [ ] Each has a title, price (or "N/A"), location, and source URL
- [ ] No Python errors in the output
- [ ] `barnstormers_scraper.log` is created in the `scraper/` folder

If anything is missing or erroring, fix the relevant selector before proceeding.

---

## BS-7: Run First Live DB Write (10 Listings)

**Estimated time:** 10 minutes

Confirm `scraper/.env` has valid `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, then run:

```bash
.venv312\Scripts\python.exe scraper\barnstormers_scraper.py ^
  --category "Single Engine Piston" ^
  --limit 10 ^
  --verbose
```

After it completes, open Supabase → Table Editor → `aircraft_listings`.
Filter by `source = 'barnstormers'`.

Confirm:
- [ ] 10 new rows appear with `source = 'barnstormers'`
- [ ] `source_url` links to real Barnstormers listings
- [ ] `asking_price` is populated on at least some rows
- [ ] `description_full` has meaningful text (not empty)

If rows are missing fields, note which ones and revisit the relevant selector task above.

---

## BS-8: Run Backfill Scores on New Barnstormers Listings

**Estimated time:** 5 minutes

Score the Barnstormers listings using the existing intelligence pipeline:

```bash
.venv312\Scripts\python.exe scraper\backfill_scores.py ^
  --all ^
  --verbose
```

Or to score only Barnstormers rows (if `--from-source` flag exists):

```bash
.venv312\Scripts\python.exe scraper\backfill_scores.py ^
  --from-source barnstormers ^
  --verbose
```

Confirm in Supabase that `value_score` and `risk_level` are now populated on the
Barnstormers rows. These should score the same way as Controller and Trade-A-Plane
listings — no special casing needed.

---

## BS-9: Add to Pipeline Scripts

**Files to edit:** `package.json`, create `scripts/run-barnstormers-pipeline.ps1`

**Step 1** — Create `scripts/run-barnstormers-pipeline.ps1`:

```powershell
# Full Hangar — Barnstormers collection pipeline
# Run after Controller and Trade-A-Plane pipelines, or independently.

param(
    [switch]$DryRun,
    [int]$Limit = 0
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
$Python = Join-Path $Root ".venv312\Scripts\python.exe"
$Scraper = Join-Path $Root "scraper\barnstormers_scraper.py"
$Backfill = Join-Path $Root "scraper\backfill_scores.py"
$Enrich  = Join-Path $Root "scraper\enrich_faa.py"

Write-Host "=== Barnstormers Pipeline ===" -ForegroundColor Cyan

$scraperArgs = @("--verbose")
if ($DryRun) { $scraperArgs += "--dry-run" }
if ($Limit -gt 0) { $scraperArgs += "--limit", $Limit }

Write-Host "Step 1: Collecting from Barnstormers..." -ForegroundColor Yellow
& $Python $Scraper @scraperArgs

if (-not $DryRun) {
    Write-Host "Step 2: FAA enrichment..." -ForegroundColor Yellow
    & $Python $Enrich --verbose

    Write-Host "Step 3: Scoring new listings..." -ForegroundColor Yellow
    & $Python $Backfill --all --compute-comps --verbose
}

Write-Host "=== Pipeline complete ===" -ForegroundColor Green
```

**Step 2** — Add to `package.json` scripts section:

```json
"pipeline:barnstormers": "powershell -File scripts/run-barnstormers-pipeline.ps1",
"pipeline:barnstormers:dry": "powershell -File scripts/run-barnstormers-pipeline.ps1 -DryRun",
```

**Step 3** — Test the pipeline script:

```bash
npm run pipeline:barnstormers:dry
```

---

## BS-10: Update AGENTS.md

Once all tasks above pass, update `AGENTS.md`:

Move the DS-1 entry from **🟡 Next Tasks** to **✅ Completed**, and add this line
to the Completed → Data Pipeline section:

```
- [x] Barnstormers.com collector live (requests + BS4, Playwright fallback),
      fingerprint-based skip for unchanged listings, session logging,
      integrated into post-scrape pipeline
```

Then commit:

```bash
git add -A
git commit -m "feat: barnstormers scraper — DS-1 complete"
git push origin main
```
