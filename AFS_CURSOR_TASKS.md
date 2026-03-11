# AircraftForSale.com Scraper — Verification & Cursor Tasks

## Setup

Drop `afs_scraper.py` into your project folder:
```
D:\Documents\$$Full Hangar\2.0\full-hangar\
```

No new dependencies — uses the same stack as `aso_scraper.py`.

---

## Step 1 — Dry Run, 1 Page, No Detail

```bash
cd "D:\Documents\$$Full Hangar\2.0\full-hangar"
py afs_scraper.py --category single_engine --limit 1 --dry-run --no-detail --verbose
```

**Verify in printed JSON:**
- `source_id` = `"afs_601288"` (afs_ prefix + numeric ID)
- `title` populated, e.g. "2013 Cirrus SR20 G3"
- `n_number` populated (e.g. "N418DZ")
- `serial_number` populated (e.g. "2236")
- `total_time_airframe` as integer (e.g. 1655)
- `asking_price` as integer (e.g. 329900) or null for "Not priced"
- `location_raw` populated ("Maryland, United States")
- `source_url` is a valid aircraftforsale.com URL

**If 0 cards parsed:** The card class selector may have changed. Check:
```python
# In scrape_category_page() — try relaxing the class match:
cards = soup.find_all("div", id=re.compile(r"item_card_\d+"))
```

---

## Step 2 — Dry Run With Detail Pages

```bash
py afs_scraper.py --category single_engine --limit 1 --dry-run --verbose
```
(No `--no-detail`)

**Verify in JSON:**
- `asking_price` confirmed from `data-item-price` attribute (most reliable)
- `highlights` contains the seller's description paragraph
- `airframe_notes` contains airframe accordion text
- `avionics_notes` contains avionics list
- `description` = concatenated highlights + airframe_notes
- `time_since_overhaul` populated if mentioned in description

**If `highlights` is null:** The accordion structure uses `aircraft-details-row` 
with a "Highlights" label. Check the detail page HTML — the label text may be 
slightly different. Try:
```python
# In scrape_detail(), add a fallback:
for row in soup.find_all("div", class_="aircraft-details-row"):
    print(row.find("div", class_="aircraft-details-label").get_text())
```

---

## Step 3 — Verify Pagination

Cirrus has 135 listings — with `show_per_page=120` that's 2 pages. Run:

```bash
py afs_scraper.py --category single_engine --limit 2 --dry-run --no-detail 2>&1 | findstr /I "page total"
```

**Verify:**
- Log shows "Page 1" then "Page 2"
- Total card count > 120 (confirms page 2 loaded)
- No duplicate source_ids

---

## Step 4 — Live Single-Category Run

```bash
py afs_scraper.py --category single_engine --no-detail
```

**Verify in Supabase:**
- New rows with `source = 'aircraftforsale'`
- Spot-check 3 listings against live site

---

## Step 5 — Full Run

```bash
py afs_scraper.py
```

All 5 categories with detail pages. Expect ~3–6 hours for full run.

Resume after interruption:
```bash
py afs_scraper.py --resume
```

---

## Data Notes

| Field | Source |
|---|---|
| `asking_price` | `span.main-price[data-item-price]` on detail (most reliable) |
| `n_number` | Card table "REG" column or info-bar on detail |
| `total_time_airframe` | Card table "TT" column or `span.info-value` on detail |
| `highlights` | `div.aircraft-details-row` where label = "Highlights" |
| `airframe_notes` | `li#airframe div.accordion-content` |
| `avionics_notes` | `li#avionics div.accordion-content` |
| `interior_notes` | `li#interior div.accordion-content` |
| `location_raw` | "Maryland, United States" format — no state code parsing yet |

**Note on location:** AFS stores full country text ("Maryland, United States") 
not state codes. The `state` field will be null for most AFS listings until 
a US state name → code lookup is added.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| 0 cards parsed | Try `id=re.compile(r"item_card_\d+")` selector instead of class |
| price = null for priced listings | Check if "Not priced" text appears; if not, inspect price element class |
| detail page returns empty dict | Check if `aircraft-details-row` / `aircraft-details-label` classes changed |
| make/model wrong | URL slug parsing may fail for unusual makes — check `_parse_title_from_url()` |
