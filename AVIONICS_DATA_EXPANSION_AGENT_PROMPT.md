# Avionics Data Expansion — BACKEND Agent Prompt

> Paste this entire prompt into a new Cursor agent session (BACKEND lane).
> Read AGENTS.md first, then execute this task end-to-end.

---

## Context

You are working on Full Hangar (full-hangar.com), an aircraft marketplace intelligence
platform. Your job is to expand the avionics database with real-world pricing and
equipment catalog data scraped from used-avionics dealers and FAA repair station
capability lists.

**Before writing a single line of code**, read these files in full:
- `AGENTS.md` — project ground rules, lane ownership, key commands
- `AVIONICS_EXPANSION_PLAN.md` — schema definitions and valuation policy
- `AVIONICS_CUTOVER_REPORT.md` — what has already been completed
- `scraper/data/avionics/avionics_master_catalog.json` — the existing 165-unit catalog
- `scraper/avionics_catalog_seed.py` — the existing seed script architecture
- `core/intelligence/avionics_intelligence.py` — the scoring engine you are feeding
- `scraper/schema.py` and `scraper/scraper_base.py` — shared scraper patterns

The existing schema includes: `avionics_units`, `avionics_aliases`,
`avionics_market_values`, `avionics_certifications`, `avionics_listing_observations`,
`avionics_bundle_rules`, `avionics_install_factors`.

**Current gap:** The catalog has 165 seeded units but market pricing is sparse.
The valuation engine currently falls back to `fallback_static` for many units.
Your task is to populate real multi-source pricing and expand catalog coverage
using the sources below.

---

## Resumable Workflow State File

**This is the most important rule in this prompt.**

At the very start, create (or read if it already exists):

```
scraper/avionics_expansion_progress.json
```

This file tracks every step. Write it after completing each sub-step — not just at
the end of major phases. If you are interrupted and restarted, read this file first
and skip all steps already marked `"done"`.

Initial structure:

```json
{
  "schema_version": 1,
  "last_updated": "<ISO timestamp>",
  "phases": {
    "phase_0_preflight": "pending",
    "phase_1_schema": "pending",
    "phase_2_pdf_capabilities": {
      "banyan": "pending",
      "weststar": "pending",
      "propel": "pending",
      "universal": "pending"
    },
    "phase_3_used_inventory": {
      "bas_part_sales": "pending",
      "wipaire": "pending",
      "global_aircraft": "pending"
    },
    "phase_4_price_consolidation": "pending",
    "phase_5_catalog_merge": "pending",
    "phase_6_alias_expansion": "pending",
    "phase_7_supabase_ingest": "pending",
    "phase_8_backfill_and_audit": "pending",
    "phase_9_cleanup": "pending"
  },
  "stats": {
    "pdf_units_extracted": 0,
    "inventory_units_extracted": 0,
    "new_units_added_to_catalog": 0,
    "existing_units_updated": 0,
    "price_observations_added": 0,
    "aliases_added": 0
  },
  "notes": []
}
```

Status values: `"pending"` → `"in_progress"` → `"done"` or `"skipped"` (if not applicable).
Update `last_updated` on every write.

---

## Phase 0 — Preflight Checks

Mark `phase_0_preflight` → `in_progress`.

1. Confirm Python runtime: `.venv312\Scripts\python.exe --version` (must be 3.12.x).
2. Confirm required packages are available: `requests`, `beautifulsoup4`, `lxml`,
   `pdfminer.six` or `pypdf`, `supabase`, `python-dotenv`. If any are missing,
   install with `.venv312\Scripts\pip.exe install <package> --break-system-packages`.
3. Load `scraper/data/avionics/avionics_master_catalog.json` and count existing units.
   Log the count into `stats.pdf_units_extracted`'s equivalent baseline note.
4. Verify Supabase connection by running a lightweight query against `avionics_units`.
   If this fails, stop and report the error clearly — do not proceed past Phase 0.
5. Read `avionics_expansion_progress.json` if it exists. If any phase is already
   `"done"`, skip it entirely in subsequent phases.

Mark `phase_0_preflight` → `done`.

---

## Phase 1 — Schema: Add Multi-Source Price Tracking

Mark `phase_1_schema` → `in_progress`.

The existing `avionics_market_values` table stores one value per unit/segment.
We need to track multiple raw price observations from different sources so we can
compute conservative medians and P25 values.

### 1A — Create Migration File

Create `supabase/migrations/<next_sequential_number>_add_avionics_price_observations.sql`.

Use the next sequential number after the highest existing migration file in
`supabase/migrations/`. Check the directory and count — do not guess the number.

Migration contents:

```sql
-- Avionics raw price observations from external sources
-- Supports multi-source median/P25 computation per the conservative valuation policy

CREATE TABLE IF NOT EXISTS avionics_price_observations (
  id                  BIGSERIAL PRIMARY KEY,
  unit_id             BIGINT REFERENCES avionics_units(id) ON DELETE CASCADE,
  canonical_name      TEXT,                        -- denormalized for orphan rows pre-match
  manufacturer        TEXT,
  model               TEXT,
  part_number         TEXT,
  observed_price      NUMERIC NOT NULL,
  currency            TEXT DEFAULT 'USD',
  condition           TEXT,                        -- 'used', 'serviceable', 'overhauled', 'new'
  source_name         TEXT NOT NULL,               -- e.g. 'bas_part_sales', 'wipaire', 'global_aircraft'
  source_url          TEXT,
  source_type         TEXT NOT NULL,               -- 'used_inventory', 'capability_list', 'oem_msrp'
  listing_title       TEXT,
  raw_description     TEXT,
  scraped_at          TIMESTAMPTZ DEFAULT NOW(),
  is_active           BOOLEAN DEFAULT TRUE,        -- set false when listing goes away
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_price_obs_unit_id      ON avionics_price_observations(unit_id);
CREATE INDEX IF NOT EXISTS idx_price_obs_source       ON avionics_price_observations(source_name);
CREATE INDEX IF NOT EXISTS idx_price_obs_manufacturer ON avionics_price_observations(manufacturer);
CREATE INDEX IF NOT EXISTS idx_price_obs_model        ON avionics_price_observations(model);
CREATE INDEX IF NOT EXISTS idx_price_obs_part_number  ON avionics_price_observations(part_number);

COMMENT ON TABLE avionics_price_observations IS
  'Raw price observations from used avionics dealers and capability lists. '
  'Used to compute conservative median/P25 values for avionics_market_values. '
  'Multiple rows per unit are expected and intentional.';
```

Also add a migration comment block at the top with the date and brief description.

### 1B — Add a Computed View

Append to the same migration file:

```sql
-- View: computed conservative values from multi-source observations
CREATE OR REPLACE VIEW avionics_price_summary AS
SELECT
  unit_id,
  canonical_name,
  manufacturer,
  model,
  source_type,
  COUNT(*)                                            AS sample_count,
  MIN(observed_price)                                 AS price_min,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY observed_price) AS price_p25,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY observed_price) AS price_median,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY observed_price) AS price_p75,
  MAX(observed_price)                                 AS price_max,
  MAX(scraped_at)                                     AS last_observed
FROM avionics_price_observations
WHERE is_active = TRUE
  AND observed_price > 0
  AND observed_price < 500000   -- winsorize outliers; adjust if bizjet units are added
GROUP BY unit_id, canonical_name, manufacturer, model, source_type;

COMMENT ON VIEW avionics_price_summary IS
  'Computed price statistics per avionics unit. '
  'P25 is the conservative anchor per project valuation policy.';
```

### 1C — Apply Migration

Run the migration against Supabase using the project's standard migration workflow.
If the project uses `supabase db push`, run it. If migrations are applied manually,
document the SQL file path clearly so Ryan can apply it, then proceed — the
downstream ingest steps can write rows even if the view is applied later.

Mark `phase_1_schema` → `done`.

---

## Phase 2 — PDF Capability List Extraction

For each PDF source below, the workflow is:
1. Download the PDF.
2. Extract text using `pdfminer.six` (preferred) or `pypdf` as fallback.
3. Parse the text into structured records: manufacturer, model, part_number,
   ata_chapter (if present), description, and the source file.
4. Normalize manufacturer names against the existing catalog aliases.
5. Write extracted records to `scraper/data/avionics/pdf_extracts/<source_name>.json`.
6. Do NOT ingest to Supabase yet — that happens in Phase 7.

Create `scraper/avionics_pdf_extractor.py` as a reusable module for this.

### PDF Source 1 — Banyan Air Service

Mark `phase_2_pdf_capabilities.banyan` → `in_progress`.

URL: `https://www.banyanair.com/pdf/FAA_Capabilities_List.pdf`

Download the PDF. Parse each row of the capability list table. Expected format is
typically: `[Manufacturer] [Model] [Part Number] [Description]` with possible
ATA chapter columns. Some PDFs use multi-column layouts — use heuristics to
reassemble logical rows from the pdfminer character-position output if needed.

Target fields per record:
```json
{
  "manufacturer": "KING",
  "model": "KDI-574",
  "part_number": "066-1069-04",
  "description": "DME INDICATOR",
  "ata_chapter": "34",
  "source": "banyan_capabilities",
  "source_url": "https://www.banyanair.com/pdf/FAA_Capabilities_List.pdf"
}
```

Save to `scraper/data/avionics/pdf_extracts/banyan.json`.
Log the record count to `avionics_expansion_progress.json`.
Mark `phase_2_pdf_capabilities.banyan` → `done`.

### PDF Source 2 — West Star Aviation

Mark `phase_2_pdf_capabilities.weststar` → `in_progress`.

URL: `https://www.weststaraviation.com/wp-content/uploads/2021/03/CHA-Capabilities-List-Rev-34.pdf`

Same extraction process. Note: West Star covers bizjet equipment heavily —
expect King Air, Citation, and Challenger avionics. These are out of scope for
piston_single scoring but should still be captured in the catalog for future
turboprop/jet waves. Tag records with `priority_family = 'turboprop'` or `'jet'`
based on manufacturer/model context clues.

Save to `scraper/data/avionics/pdf_extracts/weststar.json`.
Mark `phase_2_pdf_capabilities.weststar` → `done`.

### PDF Source 3 — Propel Aviation

Mark `phase_2_pdf_capabilities.propel` → `in_progress`.

URL: `https://www.propelaviation.com/wp-content/uploads/2025/04/145-O9QR-Capability-list-revision-9-December-12-2024.pdf`

Same extraction process. This is a Part 145 shop. Focus on instruments and radios.

Save to `scraper/data/avionics/pdf_extracts/propel.json`.
Mark `phase_2_pdf_capabilities.propel` → `done`.

### PDF Source 4 — Universal Avionics

Mark `phase_2_pdf_capabilities.universal` → `in_progress`.

Search for the Universal Avionics FAA Part 145 Capability List (RPT-20169 Rev 30)
via: `https://www.universalavionics.com`

Try these approaches in order:
  a. Search the Universal Avionics website for a PDF capability list link.
  b. Try: `https://www.universalavionics.com/support/` or `/service-support/`
  c. If no direct PDF link is found after reasonable effort, document the dead end
     in the progress file notes and mark this sub-step `"skipped"` with reason.
     Do NOT block the rest of the pipeline on this one source.

If found, extract using the same pattern.
Save to `scraper/data/avionics/pdf_extracts/universal.json` if successful.
Mark `phase_2_pdf_capabilities.universal` → `done` or `skipped`.

---

## Phase 3 — Used Avionics Inventory Scraping

For each site, build a dedicated scraper. All scrapers must:
- Use `requests` + `BeautifulSoup` first. Fall back to Playwright only if the
  response is empty, CAPTCHA'd, or JavaScript-gated.
- Respect rate limits: `random.uniform(2.0, 4.0)` seconds between requests.
- Check `robots.txt` first. If scraping is explicitly disallowed, mark `"skipped"`
  with a note and do not scrape. Document the robots.txt finding.
- Write raw results to `scraper/data/avionics/inventory_extracts/<source>.json`
  before any normalization.
- Do NOT ingest to Supabase yet — that happens in Phase 7.

Target fields per inventory record:
```json
{
  "manufacturer": "Garmin",
  "model": "GTN 750",
  "part_number": "010-01256-00",
  "condition": "serviceable",
  "price": 8500.00,
  "currency": "USD",
  "title": "Garmin GTN 750 GPS/Nav/Com - Serviceable",
  "description": "Includes tray and connectors...",
  "listing_url": "https://...",
  "source": "bas_part_sales",
  "scraped_at": "<ISO timestamp>"
}
```

### Inventory Source 1 — BAS Part Sales

Mark `phase_3_used_inventory.bas_part_sales` → `in_progress`.

Entry point: `https://baspartsales.com/avionics/`

Steps:
1. Check `https://baspartsales.com/robots.txt`. Document findings.
2. Load the avionics category page and identify the HTML structure for listing cards.
3. Identify pagination pattern (likely `?page=N` or `?start=N`).
4. For each listing card, extract: title, price, condition, part number (if shown),
   listing URL, manufacturer hint from title.
5. If detail pages exist and are not heavily rate-limited, fetch up to 500 detail
   pages to get part numbers and full descriptions. If detail fetching would exceed
   reasonable time (more than ~2 hours estimated), capture card-level data only
   and note this in the progress file.
6. Parse manufacturer and model from title using a regex heuristic:
   - Known manufacturer prefixes: Garmin, Avidyne, Bendix/King, King, Collins,
     Honeywell, Aspen, uAvionix, Narco, Gables, Safe Flight, Shadin, etc.
   - If uncertain, store raw title and flag `manufacturer_confidence = 'low'`.
7. Clean price: strip `$`, commas, "Call for price" strings (set price = null if
   not parseable as a number).

Save all records to `scraper/data/avionics/inventory_extracts/bas_part_sales.json`.
Log count to progress file.
Mark `phase_3_used_inventory.bas_part_sales` → `done`.

### Inventory Source 2 — Wipaire

Mark `phase_3_used_inventory.wipaire` → `in_progress`.

Entry point: `https://www.wipaire.com/used-parts-and-equipment/`

Steps:
1. Check `https://www.wipaire.com/robots.txt`.
2. Load the page. Wipaire may link out to external marketplaces (Controller,
   Trade-A-Plane, eBay). If the page itself does not contain avionics listings
   but instead links to external listings, follow those links and scrape the
   first layer of linked listings (do not recursively crawl external sites beyond
   one hop).
3. If the page has inline avionics items in a table or card format, scrape those
   directly using the same field schema as BAS Part Sales above.
4. If Wipaire's inventory is very thin (fewer than 20 avionics items) or fully
   redirects to external marketplaces with no in-page data, mark as `"skipped"`
   with explanation.

Save to `scraper/data/avionics/inventory_extracts/wipaire.json` if any records found.
Mark `phase_3_used_inventory.wipaire` → `done` or `skipped`.

### Inventory Source 3 — Global Aircraft Industries

Mark `phase_3_used_inventory.global_aircraft` → `in_progress`.

Entry point: `https://www.globalparts.com`

Steps:
1. Check `https://www.globalparts.com/robots.txt`.
2. Navigate to the avionics or instruments section. Try likely paths:
   `/avionics`, `/parts/avionics`, `/inventory?category=avionics`
   Inspect the top-level nav HTML to find the correct path before guessing.
3. Same scraping pattern as BAS Part Sales.
4. Note that Global Aircraft may list engines and props alongside avionics —
   filter to only avionics/instrument items by category or by title keywords.

Save to `scraper/data/avionics/inventory_extracts/global_aircraft.json`.
Mark `phase_3_used_inventory.global_aircraft` → `done` or `skipped`.

---

## Phase 4 — Price Consolidation and Deduplication

Mark `phase_4_price_consolidation` → `in_progress`.

Create `scraper/avionics_price_consolidator.py`.

This script:

### 4A — Load All Raw Extracts

Load all JSON files from:
- `scraper/data/avionics/pdf_extracts/` (capability list records — no prices)
- `scraper/data/avionics/inventory_extracts/` (inventory records — have prices)

### 4B — Normalize Manufacturer Names

Apply a manufacturer normalization map. Build this map in `scraper/config.py`
under `AVIONICS_MANUFACTURER_ALIASES` if it does not already exist. Example:

```python
AVIONICS_MANUFACTURER_ALIASES = {
    "KING": "BendixKing",
    "BENDIX/KING": "BendixKing",
    "BENDIX KING": "BendixKing",
    "GARMIN LTD": "Garmin",
    "GARMIN INTL": "Garmin",
    "COLLINS": "Collins Aerospace",
    "ROCKWELL COLLINS": "Collins Aerospace",
    "UNIVERSAL": "Universal Avionics",
    "UAVIONIX": "uAvionix",
    "U-AVIONIX": "uAvionix",
    "AVIDYNE CORP": "Avidyne",
    "ASPEN AVIONICS": "Aspen",
    # extend as needed
}
```

### 4C — Match Records to Existing Catalog Units

For each extracted record:
1. Try to match against `avionics_master_catalog.json` using:
   - Exact `canonical_name` match
   - Normalized `manufacturer` + `model` match
   - Part number match (if the catalog has part numbers — add them if not)
2. If matched: set `unit_id` on the record.
3. If unmatched: flag as `unmatched = True` and bucket for Phase 5 review.

Write the consolidated output to:
`scraper/data/avionics/consolidated_price_observations.json`

Each record should now have:
```json
{
  "unit_id": 42,               // null if unmatched
  "canonical_name": "Garmin GTN 750",
  "manufacturer": "Garmin",
  "model": "GTN 750",
  "part_number": "010-01256-00",
  "condition": "serviceable",
  "observed_price": 8500.00,
  "source_name": "bas_part_sales",
  "source_type": "used_inventory",
  "source_url": "...",
  "unmatched": false
}
```

### 4D — Generate Price Summary Report

Write `scraper/data/avionics/price_summary_report.md` with:

For each matched unit with 2+ price observations:
```
### Garmin GTN 750
- Observations: 6 (bas_part_sales: 4, global_aircraft: 2)
- Prices: $6,200 / $7,500 / $8,500 / $9,000 / $9,200 / $11,000
- P25: $7,500  |  Median: $8,750  |  P75: $9,200
- Recommended conservative anchor: $7,500 (P25)
```

Also include a section: **Unmatched Records** — list of manufacturer/model combos
from extracts that didn't match any catalog unit, sorted by frequency. These are
candidates for Phase 5 catalog additions.

Log counts to progress file.
Mark `phase_4_price_consolidation` → `done`.

---

## Phase 5 — Catalog Gap Fill (New Units)

Mark `phase_5_catalog_merge` → `in_progress`.

From the unmatched records in Phase 4, identify units that are:
1. Piston-single relevant (GA radios, GPS, transponders, autopilots, audio panels,
   EFDs, engine monitors, ADS-B units)
2. Appear in 2+ sources OR have a price attached (indicating real market activity)
3. Are NOT already a duplicate of an existing catalog entry under a different alias

For each qualifying new unit, add an entry to `avionics_master_catalog.json`
following the exact schema of existing entries. Fields required:
- `manufacturer`, `model`, `canonical_name`, `function_category`,
  `legacy_vs_glass`, `priority_family`, `is_active: true`
- `aliases`: array of known text variants from the extracts
- `notes`: brief description of where this unit was found

Also update `AVIONICS_EXPANSION_PLAN.md`'s "Open Items" section with any model
naming strategy decisions you made (e.g., how you handled generational variants
like GTN 650 vs GTN 650Xi).

Log new unit count to progress file.
Mark `phase_5_catalog_merge` → `done`.

---

## Phase 6 — Alias Expansion

Mark `phase_6_alias_expansion` → `in_progress`.

Review all extracted records for manufacturer/model string variants that don't
currently exist as aliases in `avionics_master_catalog.json`. For each variant
that maps to an existing canonical unit, add it as a new alias.

Examples of variants to look for:
- `KX 155` vs `KX-155` vs `KX155`
- `GTN-750` vs `GTN 750` vs `Garmin 750`
- `KFC 150` vs `KFC-150` vs `KFC150`
- Part numbers used as primary identifiers (e.g., `010-01256-00` for GTN 750)

Update `avionics_master_catalog.json` with new alias entries.
These aliases will be picked up by the parser in `avionics_intelligence.py`
and should directly reduce the unresolved-token rate from the latest audit
(current top unresolved: `GFC500`, `STEC50`, `KX155`, `GIA63`, `GDC74`,
`KLN94`, `NGT9000`, `PMA7/8k`, `KAP150`).

For each of the known top-unresolved tokens listed above, confirm an alias
exists or add one if not present. Do this explicitly — do not leave these unaddressed.

Log alias count to progress file.
Mark `phase_6_alias_expansion` → `done`.

---

## Phase 7 — Supabase Ingest

Mark `phase_7_supabase_ingest` → `in_progress`.

Create `scraper/avionics_price_ingest.py`.

This script reads `scraper/data/avionics/consolidated_price_observations.json`
and upserts records into `avionics_price_observations` (the table created in
Phase 1). It also syncs new catalog units and aliases to `avionics_units` and
`avionics_aliases`.

### 7A — Ingest Price Observations

For each record in the consolidated file:
- If `unit_id` is set and `observed_price` is not null: insert into
  `avionics_price_observations` with all fields.
- Use `(unit_id, part_number, source_name, source_url)` as a composite uniqueness
  check — do not re-insert duplicates on re-runs. Use upsert with
  `ON CONFLICT DO NOTHING` or check existence first.
- Capability list records with no price (from PDF extracts): insert with
  `observed_price = NULL`, `source_type = 'capability_list'`. These still provide
  catalog coverage even without pricing.

### 7B — Sync New Catalog Units to avionics_units

For each new unit added in Phase 5 that doesn't already exist in `avionics_units`:
- Insert into `avionics_units` and capture the returned `id`.
- Write the `id` back into `avionics_master_catalog.json` for future sessions.

### 7C — Sync New Aliases to avionics_aliases

For each new alias added in Phase 6 that doesn't already exist in `avionics_aliases`:
- Insert into `avionics_aliases` with `alias_source = 'listing'` and
  `confidence = 0.85`.
- Use `ON CONFLICT (unit_id, alias_norm) DO NOTHING`.

### 7D — Recompute avionics_market_values from Observations

After ingest, run an UPDATE pass against `avionics_market_values` for every unit
that now has 3+ price observations:

```sql
-- Example update logic; adapt to your actual DB query path
INSERT INTO avionics_market_values (
  unit_id, aircraft_segment, sample_count,
  price_min, price_p25, price_median, price_p75, price_max,
  valuation_basis, confidence_score, computed_at
)
SELECT
  unit_id,
  'piston_single' AS aircraft_segment,
  COUNT(*) AS sample_count,
  MIN(observed_price),
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY observed_price),
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY observed_price),
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY observed_price),
  MAX(observed_price),
  CASE WHEN COUNT(*) >= 3 THEN 'market_p25' ELSE 'market_p25' END,
  LEAST(0.9, COUNT(*) * 0.15),    -- confidence grows with sample count, caps at 0.9
  NOW()
FROM avionics_price_observations
WHERE is_active = TRUE
  AND observed_price IS NOT NULL
  AND observed_price > 0
  AND observed_price < 500000
GROUP BY unit_id
HAVING COUNT(*) >= 1              -- seed even 1-sample units; scoring engine applies discount
ON CONFLICT (unit_id, aircraft_segment) DO UPDATE
  SET sample_count    = EXCLUDED.sample_count,
      price_min       = EXCLUDED.price_min,
      price_p25       = EXCLUDED.price_p25,
      price_median    = EXCLUDED.price_median,
      price_p75       = EXCLUDED.price_p75,
      price_max       = EXCLUDED.price_max,
      valuation_basis = EXCLUDED.valuation_basis,
      confidence_score = EXCLUDED.confidence_score,
      computed_at     = EXCLUDED.computed_at;
```

Implement this as a Python function that builds and runs the SQL via the Supabase
client or as a direct `execute` call. Log the number of `avionics_market_values`
rows updated.

Log all counts to progress file.
Mark `phase_7_supabase_ingest` → `done`.

---

## Phase 8 — Backfill Scores and Audit

Mark `phase_8_backfill_and_audit` → `in_progress`.

### 8A — Reparse Description Intelligence

Run the description intelligence backfill to pick up the new aliases:

```bash
.venv312\Scripts\python.exe scraper\backfill_description_intelligence.py
```

If this script doesn't exist, use:

```bash
.venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps
```

Do NOT run the full unbounded backfill without a `--limit` first. Run:

```bash
.venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps --limit 100
```

Review the output for any errors before running full.

### 8B — Run Full Backfill if 100-Sample Pass is Clean

```bash
.venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps
```

Log `attempted`, `scored`, `updated`, `failed` counts to progress file.
If `failed > 0`, investigate before marking done.

### 8C — Run Coverage Audit

```bash
.venv312\Scripts\python.exe scraper\audit_avionics_coverage.py --segment piston_single
```

Record the new `matched_rate_pct` and `unresolved_rows` in the progress file.
Compare against the baseline from the cutover report:
- Baseline: 89.67% matched-row rate, 68.12% scoped extraction coverage
- Target: ≥92% matched-row rate, ≥72% scoped extraction coverage

If targets are not met, investigate the remaining unresolved token leaderboard
and add any high-frequency tokens as aliases (loop back to Phase 6 if needed,
but do NOT get stuck in an infinite alias-expansion loop — make one additional
pass and document remaining gaps).

Log final audit results to progress file.
Mark `phase_8_backfill_and_audit` → `done`.

---

## Phase 9 — Cleanup and Documentation

Mark `phase_9_cleanup` → `in_progress`.

### 9A — Update AGENTS.md

Update the **Completed Recently → Intelligence and Scoring** section with:
- A brief summary of this expansion (sources scraped, units added, prices ingested,
  new matched-rate percentage)
- Add `npm run pipeline:avionics:price-ingest` to the **Key Commands** section
  (you will create this npm script below)

Update the **Open Work → High Priority** avionics quality loop entries to reflect
the new baseline from the audit.

### 9B — Add npm Pipeline Script

Add to `package.json` scripts:
```json
"pipeline:avionics:price-ingest": "powershell -File scripts/run-avionics-price-ingest.ps1"
```

Create `scripts/run-avionics-price-ingest.ps1`:
```powershell
# Avionics price ingest pipeline
# Run this periodically (monthly) to refresh used-inventory pricing
Write-Host "Starting avionics price ingest pipeline..."
& .venv312\Scripts\python.exe scraper\avionics_pdf_extractor.py
& .venv312\Scripts\python.exe scraper\avionics_bas_scraper.py
& .venv312\Scripts\python.exe scraper\avionics_wipaire_scraper.py
& .venv312\Scripts\python.exe scraper\avionics_global_scraper.py
& .venv312\Scripts\python.exe scraper\avionics_price_consolidator.py
& .venv312\Scripts\python.exe scraper\avionics_price_ingest.py
Write-Host "Avionics price ingest complete."
```

### 9C — Final Progress File Update

Update `avionics_expansion_progress.json` one final time:
- All phases → `done` (or `skipped` with reason)
- Final stats populated
- Add a `"completed_at"` timestamp
- Add any `"notes"` about data quality issues, sites that blocked scraping,
  or follow-up work recommended

Mark `phase_9_cleanup` → `done`.

---

## Error Handling Rules (Apply Throughout)

- **Network errors / timeouts**: retry up to 3 times with exponential backoff
  (2s, 8s, 30s). If all retries fail, mark the source as `"skipped"` with the
  error logged in the progress file. Do not crash the entire pipeline.
- **PDF extraction failures**: if `pdfminer` can't parse a PDF, try `pypdf` as
  fallback. If both fail, note the failure and continue.
- **Price parsing**: if a price string can't be parsed as a number (e.g., "Call
  for price", "POA"), set `observed_price = null`. Do not skip the record entirely.
- **Supabase errors**: use the retry pattern established in `scraper_base.py`.
  On a 500 error, wait 5 seconds and retry once. On a 409 conflict, log and skip.
- **Never delete existing avionics_units or avionics_market_values rows** during
  this task. Only insert or update. Preserve existing OEM/MSRP anchors.

---

## Scope Boundaries

**In scope for this task:**
- The six sources listed above (4 PDFs, 3 used-inventory sites)
- Populating `avionics_price_observations` and recomputing `avionics_market_values`
- Expanding `avionics_master_catalog.json` with new units and aliases
- Syncing changes to `avionics_units` and `avionics_aliases` in Supabase
- Running the backfill and audit

**Out of scope (do not touch):**
- `core/intelligence/avionics_intelligence.py` — the scoring engine is not
  modified in this task; it reads from the DB tables you are populating
- Frontend components
- `app/` directory (any route or UI file)
- Any scraper for aircraft listings (Controller, TAP, ASO, etc.)
- The `INTELLIGENCE_VERSION` bump — do not change the scoring version; you are
  only improving the data the existing scorer reads, not the scoring logic itself

---

## Session Close

When you have completed all phases (or need to stop mid-session):

1. Write final state to `avionics_expansion_progress.json`.
2. Commit all new/modified files with message:
   `feat: avionics price observations ingest - [phase X complete]`
3. Post a brief status summary here:
   - Which phases are done
   - Which are skipped (and why)
   - Final stats: units added, aliases added, price observations ingested,
     new matched-rate from audit
   - Any blockers requiring Ryan's attention

---

*End of agent prompt. All files go under the project root:*
*`D:\Documents\$$Full Hangar\2.0\CursorReposity\full-hangar\`*
*Python runtime: `.venv312\Scripts\python.exe`*
