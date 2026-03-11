# AeroTrader Scraper v2 — Verification & Cursor Tasks

## Setup

Drop `aerotrader_scraper.py` into your project folder:
```
D:\Documents\$$Full Hangar\2.0\full-hangar\
```

This replaces `scraper.py`. The old file can be kept as a backup.

---

## Step 1 — Test Makes Discovery

```bash
cd "D:\Documents\$$Full Hangar\2.0\full-hangar"
py aerotrader_scraper.py --make Cessna --dry-run --no-detail --verbose
```

Watch the log output. Before any cards appear you should see:
```
Discovered XX makes
[1/1] Cessna
  Total: 92 aircraft for Cessna
  Page 1: 25 cards
```

**If "Discovered 0 makes":**
The makes discovery URL may have changed. Try opening:
`https://www.aerotrader.com/aircraft-for-sale/make?zip=10001&radius=10000`
in your browser. If that 404s, open the main browse page instead:
`https://www.aerotrader.com/aircraft-for-sale?zip=10001&radius=10000`

Then find a make link in the sidebar (e.g. "Cessna (92)"), right-click →
Copy link address. You should see `?make=Cessna%7C2237190` in the URL.

If makes discovery keeps failing, you can hardcode the makes dict temporarily:
```python
# In run(), replace the discovery call with:
makes = [
    {"name": "Cessna", "id": "2237190",
     "url": "https://www.aerotrader.com/Cessna/aircraft-for-sale?make=Cessna%7C2237190&zip=10001&radius=10000"},
    {"name": "Piper",  "id": "2239732",
     "url": "https://www.aerotrader.com/Piper/aircraft-for-sale?make=Piper%7C2239732&zip=10001&radius=10000"},
    # Add more from browser URL bar as you navigate
]
```

---

## Step 2 — Verify Card Data (data-* attributes)

After Step 1 prints JSON, verify the first card:
- `source_id` = 7-10 digit number (e.g. `"5039464579"`)
- `make` = "Cessna" (title case)
- `model` = "172" or "SKYHAWK" (uppercased)
- `asking_price` = integer (e.g. `125000`) or null
- `location_raw` = "city, ST" format (e.g. `"ca, CA"`)
- `state` = 2-letter code (e.g. `"CA"`)
- `year` = 4-digit integer

**If fields are null:** The article element may not have `data-ad-id`. 
In `get_cards()`, add a debug print:
```python
articles = soup.find_all("article")
print(f"Total articles: {len(articles)}")
for a in articles[:2]:
    print(a.attrs)  # check which data-* attrs are present
```

---

## Step 3 — Verify Detail Pages

```bash
py aerotrader_scraper.py --make Piper --dry-run --verbose
```
(Remove `--no-detail`)

Check JSON output for:
- `description` populated (from `div.dealer-description.clearBoth`)
- `n_number` populated if mentioned in description
- `serial_number` populated if mentioned
- `avionics_notes` lists keywords found in description
- `total_time_airframe` extracted from text if mentioned

**If description is null:** The selector may need adjustment. On a detail page,
right-click the description text → Inspect. Verify the class is still
`dealer-description clearBoth` (both classes present on same div).
Update `parse_detail()` if needed.

---

## Step 4 — Pagination Test

Cessna has 92 listings = 4 pages. Verify:

```bash
py aerotrader_scraper.py --make Cessna --dry-run --no-detail 2>&1 | findstr /I "page"
```

Should show:
```
Page 1: 25 cards
Page 2: 25 cards
Page 3: 25 cards
Page 4: 17 cards
```
Total should be 92.

---

## Step 5 — Live Single-Make Run

```bash
py aerotrader_scraper.py --make Cessna --no-detail
```

Verify in Supabase:
- `source = 'aerotrader'`
- `source_id` is a numeric string (no prefix)
- Spot-check 3 listings against the live site

---

## Step 6 — Full Run

```bash
py aerotrader_scraper.py
```

All makes with detail pages. Expect ~4–8 hours.

Resume after interruption:
```bash
py aerotrader_scraper.py --resume
```

Show browser window if bot detection seems to be blocking:
```bash
py aerotrader_scraper.py --headless false
```

---

## Key Differences from Original scraper.py

| Feature | Old scraper.py | aerotrader_scraper.py |
|---|---|---|
| Card parsing | CSS class selectors (fragile) | `data-*` attributes (robust) |
| Make URLs | `/Cessna-Aircraft/aircraft-for-sale` | `/Cessna/aircraft-for-sale?make=Cessna\|ID` |
| Makes discovery | Hardcoded list | Dynamic from browse page |
| Description selector | Guesses from multiple classes | `div.dealer-description.clearBoth` (confirmed) |
| `source_id` | Parsed from URL slug | Direct from `data-ad-id` attribute |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| 0 cards on page | Add `print(soup.find_all("article")[:2])` to check attrs |
| Bot block (403/503) | Run with `--headless false` to see browser, add longer delays |
| Makes page 404 | Hardcode makes dict (see Step 1) |
| `description = null` | Re-inspect selector on live detail page |
| Pagination stops at page 1 | Check if page 2 URL differs — capture from browser Network tab |
