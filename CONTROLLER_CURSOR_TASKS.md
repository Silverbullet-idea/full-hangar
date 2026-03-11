# Controller.com Scraper — Verification & Cursor Tasks

## Key Architecture Facts (confirmed from DevTools)

| What | Finding |
|---|---|
| Platform | Sandhills Publishing React SSR (same as TractorHouse) |
| Bot protection | ASP.NET session + Sandhills.Auth.Cookie — no DataDome/Distil |
| Auth | Ryan logged in (LoggedIn=true, expires Aug 2026) |
| Search URL | `/listings/search?Category=8&page=2` |
| Pagination | `?page=N` param — cleanest of all scrapers |
| Card selector | `div.list-listing-card-wrapper` |
| Detail link | `a.list-listing-title-link` |
| Listing ID | Embedded in href: `/listing/for-sale/{id}/{slug}` |

---

## Step 0 — Export Your Login Cookies (Do This First!)

Your session expires August 2026. Export once — scraper uses for months.

**Option A — EditThisCookie extension (easiest):**
1. Install EditThisCookie in Chrome
2. Go to controller.com (while logged in)
3. Click EditThisCookie icon → Export (JSON)
4. Save as `controller_cookies.json` in your project folder

**Option B — DevTools:**
1. DevTools → Application → Cookies → www.controller.com
2. Right-click → Copy all as JSON (if available)
3. Save as `controller_cookies.json`

The scraper will auto-load this file. Without it, Playwright will try to log in using:
```
CONTROLLER_EMAIL=rdale68@gmail.com
CONTROLLER_PASSWORD=Ihate2change!
```
in your `.env` file.

---

## Step 1 — Confirm Category IDs

Navigate to each category on Controller and check the URL:
`https://www.controller.com/listings/for-sale/???-aircraft/??`

| Category | Expected URL to check | Update in scraper |
|---|---|---|
| Single Engine Piston | `/listings/search?Category=6` | ✅ CONFIRMED = 6 |
| Twin Engine Piston | `/listings/search?Category=8` | ✅ CONFIRMED = 8 |
| Jets | `/listings/search?Category=3` | ✅ CONFIRMED = 3 |
| Turboprop | `/listings/for-sale/turboprop-aircraft/8` | ✅ CONFIRMED = 8 |
| Turbine Helicopter | `/listings/search?Category=7` | ✅ CONFIRMED = 7 |
| Piston Helicopter | `/listings/search?Category=5` | ✅ CONFIRMED = 5 |
| Light Sport Aircraft | `/listings/search?Category=433` | ✅ CONFIRMED = 433 |
| Experimental/Homebuilt | `/listings/search?Category=2` | ✅ CONFIRMED = 2 |
| Piston Amphibious/Floatplanes | `/listings/search?Category=1` | ✅ CONFIRMED = 1 |
| Turbine Amphibious/Floatplanes | `/listings/search?Category=71` | ✅ CONFIRMED = 71 |

OR try the search URL format:
`https://www.controller.com/listings/search?Category=1` (try 1-500)

Once confirmed, update `CONTROLLER_CATEGORIES` dict at top of `controller_scraper.py`.

---

## Step 2 — Confirm specs-container Contents

In DevTools Elements panel, click to expand `div.specs-container` on a card.
What are the child elements? Send a screenshot or describe what you see.

Expected (most likely one of):
```html
<!-- Pattern A: labeled spans -->
<span class="spec-label">Total Time</span>
<span class="spec-value">820</span>

<!-- Pattern B: divs with text -->  
<div>Total Time: 820</div>
<div>Year: 2005</div>
```

The scraper tries both patterns. But if the actual structure differs, update `_parse_specs()`.

---

## Step 3 — First Dry Run (Turboprop, No Details)

```bash
cd "D:\Documents\$$Full Hangar\2.0\full-hangar"
py controller_scraper.py --category turboprop --dry-run --no-detail --verbose
```

**Expected output:**
```
Warming up session...
Already authenticated (LoggedIn cookie present)
Category: Turboprop  (Category=8)
  Total: 603 listings → 22 pages
  Page 1/22: 28 cards
{
  "source": "controller",
  "source_id": "ct_240083723",
  "title": "2005 AEROCOMP INC. COMP AIR 9 TURBINE",
  "year": 2005,
  "asking_price": 374900,
  "total_time_airframe": 820,
  "location_raw": "Aberdeen, Idaho",
  "state": "ID",
  "seller_name": "Aerista",
  ...
}
```

**Troubleshooting:**
- `0 cards found` → Card selector may have changed. Check Elements tab for current card class name.
- `year: null, total_time_airframe: null` → `div.specs-container` structure differs. Need Step 2.
- `asking_price: null` → `div.price-contain` structure differs. Check DevTools on price element.
- Login failure → Add credentials to `.env` or export cookies.

---

## Step 4 — Verify Card Data Quality

Check `controller_dry_run.json` for first 3 cards:
- `source_id` = `"ct_NNNNNNNNN"` (9-digit Controller listing ID)
- `year` = 4-digit integer
- `asking_price` = integer or null (null for "Call for price" listings)
- `total_time_airframe` = integer or null
- `location_raw` = "City, State" format
- `state` = 2-letter state code or null (international listings = null)
- `seller_name` = broker/dealer name or null

---

## Step 5 — Test Detail Page Enrichment

```bash
py controller_scraper.py --category turboprop --dry-run --verbose
```
(Remove --no-detail to fetch detail pages for first 3 listings)

Check for additional fields populated:
- `description` — full listing description
- `serial_number` — S/N from detail page
- `n_number` — registration number
- `avionics_notes` — G1000, GTN750, etc. found in description
- `airframe_notes` — airframe section content
- `engine_notes` — engine section content
- `time_since_overhaul` — SMOH hours

---

## Step 6 — Single Category Live Run

Once dry run looks good:
```bash
py controller_scraper.py --category turboprop --no-detail
```

Check Supabase for `source='controller'` rows.

---

## Step 7 — Full Run

After confirming all category IDs:
```bash
py controller_scraper.py --category all
```

Resume if interrupted:
```bash
py controller_scraper.py --category all --resume
```

Expected runtime: 3-8 hours for all categories with detail pages.

---

## Cookie Export Reference

If cookies expire or session is invalidated, re-export:
1. Log into controller.com in Chrome
2. DevTools → Application → Cookies → www.controller.com
3. Key cookies to preserve:
   - `Sandhills.Auth.Cookie` (main auth — 3301 bytes)
   - `ASP.NET_SessionId`
   - `LoggedIn`
   - `UserAuthId`
   - `iterableEndUserId`
4. Re-export as `controller_cookies.json`
