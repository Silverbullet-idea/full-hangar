# AvBuyer Scraper — Verification & Cursor Tasks

## Setup

Drop `avbuyer_scraper.py` into your project folder:
```
D:\Documents\$$Full Hangar\2.0\full-hangar\
```

---

## Step 1 — Test Plain Requests (No Playwright)

```bash
cd "D:\Documents\$$Full Hangar\2.0\full-hangar"
py -c "
import requests
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
r = requests.get('https://www.avbuyer.com/aircraft/twin-piston/cessna?make=3532&include_wo_price=Y', headers=headers)
print(f'Status: {r.status_code}, Size: {len(r.text)} bytes')
from bs4 import BeautifulSoup
soup = BeautifulSoup(r.text, 'html.parser')
cards = soup.find_all('div', id=lambda i: i and i.startswith('item_card_'))
print(f'Cards found: {len(cards)}')
if cards:
    print(cards[0].get_text()[:300])
"
```

**Expected:** Status 200, 5-20 cards found.

**If blocked (403 or 0 cards):** Run with `--playwright` flag from now on.

---

## Step 1b — Confirmed Card Structure (No Investigation Needed)

The DevTools screenshot confirmed the card structure. Key selectors locked in:
- **Year/SN/TT**: `ul.fa-no-bullet.clearfix > li` → `["Year 2006", "S/N 4029", "Total Time 8289"]`
- **Price**: `div.price` → `"Price: USD $9,995,000"` (or "Make offer" / "Please call")
- **Location+Seller**: `div.list-item-location` → text + `<b>Seller Name</b>`
- **Description**: `div.list-item-para`
- **Detail link**: `a.tricky-link`
- **Title**: `h2.item-title`

These are all hardcoded in the scraper. No data-* attribute investigation needed.

---

## Step 2 — Make Discovery

```bash
py avbuyer_scraper.py --category twin-piston --dry-run --no-detail --verbose
```

Watch for:
```
Category: Twin Engine Piston  |  /aircraft/twin-piston
  /aircraft/twin-piston: discovered XX makes
  Make: Cessna  |  ...?make=3532&include_wo_price=Y
  Make: Piper   |  ...?make=3579&include_wo_price=Y
```

**If "discovered 0 makes":** The browse-by-model URL may differ.
Try manually: https://www.avbuyer.com/aircraft/twin-piston/browse-by-model
If that 404s, the makes are in the sidebar filter. On the listing page,
right-click a make in the left filter → Inspect to find the `?make=NNNN` links.
Then manually build the makes list and pass via `--make`.

**If makes ARE found but cards show 0:**
The card selector may need adjustment. Check what `id` attributes the cards have:
```python
from bs4 import BeautifulSoup
# In the script, add after fetch: 
cards_all = soup.find_all('div', id=True)
print([c['id'] for c in cards_all if 'item' in c.get('id','').lower()][:5])
```

---

## Step 3 — Verify Card Data Parsing

Check first 2 cards in dry run JSON for:
- `source_id` = `"ab_NNNNNN"` format (6-digit listing ID)
- `year` integer (from "YEAR 2014" text)
- `serial_number` string (from "S/N 157" text)
- `total_time_airframe` integer (from "TOTAL TIME 3676")
- `asking_price` null (for "Make offer" listings) or integer
- `location_raw` text (e.g. "Europe, Monaco")
- `seller_name` populated (e.g. "Global Jet Monaco")

**If year/SN/TT all null:** The "YEAR XXXX | S/N XX | TOTAL TIME XXXX"
text format may differ. Add this debug to `parse_card()`:
```python
print("CARD TEXT:", card.get_text(" ", strip=True)[:300])
```
Then update the regex patterns in `_parse_year_sn_tt()`.

---

## Step 4 — Verify Detail Pages

```bash
py avbuyer_scraper.py --category jets --make "Dassault" --dry-run --verbose
```

Check JSON for:
- `description` = bullet list from description section
- `airframe_notes` = AIRFRAME section content (Total Hours, Landings, etc.)
- `engine_notes` = ENGINES section content
- `avionics_notes` = keywords found

**If sections are null:**
The `div.aircraft-specifications` class may vary. On a detail page, 
right-click the "AIRFRAME" section header → Inspect.
Verify exact class on the containing div. Update `parse_detail()`.

---

## Step 5 — Pagination Test

Large Jets has 218 listings = 11 pages:

```bash
py avbuyer_scraper.py --category jets --make "Dassault Falcon" --dry-run --no-detail --verbose 2>&1 | findstr /I "page\|cards\|total"
```

Should show:
```
11 page(s)
Page 1: 20 cards
Page 2: 20 cards
...
Page 11: 18 cards
```

**If stops at page 1:** URL pattern for page 2 may differ.
Visit the second page manually: 
`https://www.avbuyer.com/aircraft/private-jets/large/page-2`
Confirm URL structure matches what `build_page_url()` generates.

---

## Step 6 — Live Single Category Run

```bash
py avbuyer_scraper.py --category twin-piston --no-detail
```

Verify in Supabase:
- `source = 'avbuyer'`
- `source_id` starts with `"ab_"`
- `aircraft_type = 'multi_engine_piston'`

---

## Step 7 — Full Run

```bash
py avbuyer_scraper.py
```

Expect 2-4 hours for all categories with detail pages.

Resume:
```bash
py avbuyer_scraper.py --resume
```

Force Playwright if plain requests get blocked mid-run:
```bash
py avbuyer_scraper.py --playwright
```

---

## Category → URL Mapping

| Category Arg | URL Path | aircraft_type |
|---|---|---|
| `single-piston` | `/aircraft/single-piston` | `single_engine_piston` |
| `twin-piston` | `/aircraft/twin-piston` | `multi_engine_piston` |
| `jets` | `/aircraft/private-jets/light` etc. | `jet` |
| `turboprops` | `/aircraft/turboprops` | `turboprop` |
| `helicopter` | `/aircraft/helicopter/turbine` | `helicopter` |

---

## Key Architecture Notes

| Feature | Implementation |
|---|---|
| Bot protection | None detected — plain requests default, Playwright auto-fallback |
| Make discovery | Browse-by-model page + sidebar `?make=NNNN` links |
| Pagination | `/page-N` URL suffix (confirmed from DevTools) |
| Cards | `div[id^="item_card_"]` |
| Card data | Parsed from "YEAR XXXX \| S/N XX \| TOTAL TIME XXXX" text |
| Detail specs | `div.grid-x.dtl-list` label/value cell pairs |
| Detail sections | `div.aircraft-specifications` → `h3` + content blocks |
| Price | Text parse — "Make offer" → null, "$329,000" → integer |
