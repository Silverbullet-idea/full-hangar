# ASO Scraper — Verification & Cursor Tasks

## Setup

Copy `aso_scraper.py` into your project folder:
```
D:\Documents\$$Full Hangar\2.0\full-hangar\
```

Install dependencies (already have most from Controller scraper):
```bash
py -m pip install requests beautifulsoup4 lxml python-dotenv --break-system-packages
```

---

## Step 1 — Dry Run (Single Category, 2 Groups)

```bash
cd "D:\Documents\$$Full Hangar\2.0\full-hangar"
py aso_scraper.py --category single_engine --limit 2 --dry-run --no-detail --verbose
```

**Verify:**
- Prints model group names and URLs discovered
- Prints 2–3 listing JSON objects with `source_id`, `title`, `asking_price`, `n_number`, `total_time_airframe`
- No errors about missing selectors
- Creates `aso_dry_run.json` in the project folder

**If 0 listings found:** The card selector may need adjustment. Open `aso_scraper.py`,
find `_parse_cards_from_soup()`, and check the `style` lambda — ASO may use `width:360px`
without a space. Try changing:
```python
style=lambda s: s and "360px" in s
```
to:
```python
True  # accept all td.searchResultsGrid
```

---

## Step 2 — Test Detail Page Fetch

```bash
py aso_scraper.py --category single_engine --limit 1 --dry-run --verbose
```
(No `--no-detail` this time)

**Verify in printed JSON:**
- `description` is populated with aircraft description text
- `engines_raw` contains JSON array with engine make/model/TSN
- `time_since_overhaul` is an integer (or null if not mentioned in description)

---

## Step 3 — Test Pagination

Find a model group with 50+ listings (e.g., Cessna 182 has ~39, Cessna 172 has ~113).
Run with verbose to see pagination:

```bash
py aso_scraper.py --category single_engine --limit 3 --dry-run --no-detail --verbose 2>&1 | findstr /I "page post"
```

**Verify:**
- Logs show "Page 1 of X", "POSTing to page 2", etc.
- Total listings scraped > 25 for any group with 50+ count

**If pagination fails:** The ASP.NET postback event target may differ.
In DevTools → Network tab, click the page 2 arrow on ASO and capture the POST body.
Look for `__EVENTTARGET` value and update `PAGER_NEXT_TARGET` or `PAGER_TXTPAGE_TARGET`
in the scraper constants.

---

## Step 4 — Full Single-Category Live Run

```bash
py aso_scraper.py --category single_engine --no-detail
```

**Verify:**
- Supabase dashboard shows new rows with `source = 'aso'`
- `source_id` format is `aso_201624` (aso_ prefix + adv_id)
- Spot-check 3 listings: verify price/TTAF/location are accurate vs. ASO website

---

## Step 5 — Full Run With Details

```bash
py aso_scraper.py
```

Runs all 5 categories with detail page fetches. Expect ~2–4 hours for full run
given rate limiting (2.5s minimum between requests).

Resume after interruption:
```bash
py aso_scraper.py --resume
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| 0 model groups found | Category URL changed | Check category URL in browser, update `CATEGORIES` dict |
| 0 listings from cards | Card TD selector mismatch | Inspect element → verify `class="searchResultsGrid"` and width |
| `$: Inquire` price = null | Expected — inquire listings have no price | Normal, `asking_price` will be null |
| Pagination stuck on page 1 | ViewState POST failing | See Step 3 fix above |
| Detail page returns empty | adSpecView class changed | Inspect detail page, update `scrape_detail_page()` selectors |

---

## Data Schema Notes

ASO listings land in `aircraft_listings` with these ASO-specific fields:
- `source = "aso"`
- `source_id = "aso_{adv_id}"` — unique per listing
- `source_url` — direct link to ViewAd.aspx detail page
- `engines_raw` — JSON string with engine array from engine table
- `engine_tsn` — first engine TSN as integer

The `n_number` field comes from the "Reg#" field on cards (e.g., `N137P`).
Strip the leading `N` only if FAA cross-reference logic requires raw digits.
