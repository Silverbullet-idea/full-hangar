# GlobalAir Scraper — Verification & Cursor Tasks

## Setup

Drop `globalair_scraper.py` into your project folder:
```
D:\Documents\$$Full Hangar\2.0\full-hangar\
```

---

## Step 1 — Test Model API

Before any scraping, verify the model discovery API works with plain requests:

```bash
cd "D:\Documents\$$Full Hangar\2.0\full-hangar"
py -c "
import requests
r = requests.post('https://www.globalair.com/aircraft-for-sale/GetAllDistictAircraft',
    headers={'Content-Length':'0','X-Requested-With':'XMLHttpRequest'},
    timeout=15)
import json; data = r.json()
print(f'Status: {r.status_code}, Count: {len(data)}')
print(data[:5])
"
```

**Expected output:**
```
Status: 200, Count: 512
['505 Jet Ranger X', '912 ULS', ..., 'Cessna 172 (Singles)', ...]
```

**If 403 or empty:** The API requires a session cookie from a prior page visit.
In that case, open `run()` in `globalair_scraper.py` and add a warm-up visit
before calling `fetch_all_models()`:
```python
# Add before fetch_all_models() call:
pw_page.goto("https://www.globalair.com/aircraft-for-sale", wait_until="domcontentloaded")
time.sleep(3)
# Then POST via requests using cookies from the Playwright session
```

---

## Step 2 — Single Model Dry Run

```bash
py globalair_scraper.py --model "Cessna 172" --dry-run --no-detail --verbose
```

**Verify:**
- Log shows: `Fetching model list... API returned 512 model names`
- Log shows: `[1/N] Cessna 172 — https://www.globalair.com/aircraft-for-sale/single-engine-piston/cessna-172`
- Cards parsed with `source_id` = `"ga_NNNNNN"` format
- `asking_price` as integer from `data-price`
- `year` as integer from `data-year`
- `total_time_airframe` from `data-totaltime`

**If 0 cards parsed:** The URL slug may not match GlobalAir's actual URL.
Check by visiting: `https://www.globalair.com/aircraft-for-sale/single-engine-piston/cessna-172`
If that 404s, find the real URL by navigating GlobalAir manually and compare slug.
Update `_slugify()` if needed.

---

## Step 3 — Test Load More Pagination

Cirrus Aircraft has 251 listings, loads 25 at a time = ~10 Load More clicks.

```bash
py globalair_scraper.py --model "Cirrus Aircraft" --dry-run --no-detail --verbose
```

**Verify:**
- Log shows multiple "Clicking Load More" entries
- Final card count > 25 (confirms pagination worked)
- `afs_dry_run.json` (actually `globalair_dry_run.json`) contains 200+ listings

**If Load More fails silently:**
The button selector may need adjustment. Try:
```python
# In scrape_model_page(), replace selector with:
load_more = pw_page.query_selector("button.btn-secondary[onclick*='cmdSearch']")
# Or by text content:
load_more = pw_page.get_by_text("LOAD MORE")
```

---

## Step 4 — Test Detail Pages

```bash
py globalair_scraper.py --model "Bonanza A36 TC" --dry-run --verbose
```

**Verify in JSON:**
- `serial_number` populated (e.g. "EA-124")
- `n_number` populated (e.g. "N455JR")
- `total_time_airframe` integer (e.g. 4970)
- `avionics_notes` contains avionics text
- `airframe_notes` contains airframe section text
- `maintenance_notes` contains maintenance section text

**If sections are null:**
The `div.mobileLHDtl.mb20` class may vary. On a detail page, right-click a section
header (e.g. "Avionics") → Inspect. Verify exact class on the wrapper div.
Update `scrape_detail()` selector if needed.

---

## Step 5 — Full Category Run

```bash
py globalair_scraper.py --category single_engine --no-detail
```

Then verify in Supabase:
- `source = 'globalair'`
- `source_id` starts with `"ga_"`
- Reasonable spread of makes/models

---

## Step 6 — Full Run

```bash
py globalair_scraper.py
```

GlobalAir has ~500 model pages. Many will have 0 listings (niche/obscure models).
Expect 4–10 hours for a full run with detail pages.

Resume:
```bash
py globalair_scraper.py --resume
```

---

## URL Slug Troubleshooting

GlobalAir URL examples seen in screenshots:
| Model Name | Expected URL |
|---|---|
| Cessna 172 (Singles) | `/aircraft-for-sale/single-engine-piston/cessna-172` |
| Cirrus Aircraft (Singles) | `/aircraft-for-sale/single-engine-piston/cirrus-aircraft` |
| Beechcraft (Singles) | `/aircraft-for-sale/single-engine-piston/beechcraft` |
| Bonanza A36 TC | `/aircraft-for-sale/single-engine-piston/bonanza-a36-tc` |

The slug derivation is: lowercase, spaces→hyphens, special chars removed.
If a specific model 404s, manually find its URL on GlobalAir and compare to what
`_slugify()` produces. The discrepancy will be obvious.

---

## Key Architecture Notes

| Feature | Implementation |
|---|---|
| Model discovery | `GetAllDistictAircraft` POST API — no auth, no body, returns full list |
| Category inference | Parenthetical suffix in model name e.g. `(Singles)` → `single-engine-piston` |
| Pagination | Click `button#loadPageX` until it disappears |
| Price | `data-price` attribute on card (clean integer) |
| TT/Year | `data-totaltime` / `data-year` attributes on card |
| SN / RN | Icon-adjacent text (serialnumber.png, registrationnumber.png) |
| Detail specs | `div.row > div.col` label/value pairs |
| Detail sections | `div.mobileLHDtl.mb20` with `h4.text-darkblue` headers |
