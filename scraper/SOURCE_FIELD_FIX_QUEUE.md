# Source Field Fix Queue

Generated from latest `scraper/FIELD_COVERAGE_REPORT.md` and current scraper behavior.

Use this as the execution checklist for Phase 2/3 parser and selector improvements.

## Execution / verification

- Work the list **top to bottom** (Controller → … → Barnstormers). After each source change, run a **bounded smoke** scrape (`--limit` / preview scripts) and spot-check Supabase field fill rates for the fields touched.
- After browser-extension or bridge changes, run `npm run pipeline:ops:bridge-unmapped-audit` and promote high-frequency `raw_data.bridge_unmapped` keys via migrations when stable.
- Ingest-time **make/model** normalization now runs in `scraper/schema.py` via `listing_identity_ingest.normalize_scraped_make_model` (same rules as `make_model_rules.json`); per-source selectors in this queue remain the lever for raw field coverage.

---

## Priority Order

1. `controller`
2. `aso`
3. `trade_a_plane`
4. `avbuyer`
5. `aerotrader`
6. `globalair`
7. `barnstormers` (small-sample cleanup)

---

## Controller

- **Field:** `time_since_prop_overhaul` (`7.1%`)
  - **Extraction target:** detail spec rows containing `prop 1 time`, `prop 2 time`, `spoh`, `prop smoh`, `time since prop overhaul`
  - **Action:** expand per-prop parsing coverage and run `--force-details` waves by category.
  - **Expected lift:** `+8` to `+15` points.

- **Field:** `asking_price` (`17.5%`)
  - **Extraction target:** pricing banner variants and fallback price nodes on detail pages.
  - **Action:** broaden selector fallback + recrawl unchanged detail rows with `--force-details`.
  - **Expected lift:** `+10` to `+20` points.

- **Field:** `location_raw/state/seller_name/seller_type` (`32.9%`)
  - **Extraction target:** dealer/seller contact card and machine location blocks.
  - **Action:** broaden detail selectors and keep category refresh passes.
  - **Expected lift:** `+10` to `+20` points.

---

## ASO

- **Field:** `time_since_prop_overhaul` (`22.1%`)
  - **Extraction target:** engine/prop detail tables with `SPOH` style headers and per-row metrics.
  - **Action:** increase table-shape compatibility and live-write sampling for `multi_engine` and `single_engine`.
  - **Expected lift:** `+15` to `+30` points.

- **Field:** `seller_type` (`33.8%`)
  - **Extraction target:** contact/seller panel wording (dealer/private/broker/company markers).
  - **Action:** classify seller text from detail contact sections and fallback title strings.
  - **Expected lift:** `+20` to `+35` points.

- **Field:** `time_since_overhaul` (`67.5%`)
  - **Extraction target:** `TSO`/`TSN` table headers + description fallback.
  - **Action:** improve parse resilience where first metric row is missing/shifted.
  - **Expected lift:** `+10` to `+20` points.

---

## Trade-A-Plane

- **Field:** `time_since_overhaul` (`0.0%`)
  - **Extraction target:** detail description and engine sections (`SMOH`, `TSO`, `TSN`, `Engine 1/2` patterns).
  - **Action:** rely on detail fetch + parser fallback (`description_intelligence.times`) when anti-bot allows.
  - **Expected lift:** `+20` to `+45` points after stable detail access.

- **Field:** `time_since_prop_overhaul` (`0.0%`)
  - **Extraction target:** `SPOH`, `Prop 1/2`, prop overhaul language.
  - **Action:** persist secondary prop metrics from description and table rows.
  - **Expected lift:** `+10` to `+30` points.

- **Field:** `seller_name` (`23.1%`) / `seller_type` (`2.3%`)
  - **Extraction target:** advertiser contact card and dealer/private wording.
  - **Action:** strengthen contact selectors; preserve anti-bot-safe pacing.
  - **Expected lift:** `seller_name +25` to `+45`, `seller_type +20` to `+40`.

- **Field:** `total_time_airframe` (`25.5%`)
  - **Extraction target:** `TTAF/TT` in detail text and spec rows.
  - **Action:** parse and persist from detail text fallback.
  - **Expected lift:** `+20` to `+35` points.

---

## AvBuyer

- **Field:** `state` (`0.0%`)
  - **Extraction target:** location text normalization (`City, ST`, state/province full names).
  - **Action:** harden state parser and location splitting in both card/detail parse.
  - **Expected lift:** `+40` to `+70` points.

- **Field:** `time_since_prop_overhaul` (`0.0%`) / `time_since_overhaul` (`2.8%`)
  - **Extraction target:** engine/prop spec blocks and long-form description.
  - **Action:** add per-field regex + section-aware extraction fallback.
  - **Expected lift:** overhaul `+10` to `+25`, prop `+5` to `+20`.

- **Field:** `asking_price` (`34.1%`)
  - **Extraction target:** header price variants and alternative currency/price nodes.
  - **Action:** expand price selector fallback chain.
  - **Expected lift:** `+20` to `+35` points.

---

## AeroTrader

- **Field:** `location_raw` (`0.0%`) / `state` (`0.0%`)
  - **Extraction target:** dealer location/contact region text.
  - **Action:** map location parser from detail seller section.
  - **Expected lift:** `+40` to `+70` points.

- **Field:** `time_since_overhaul` (`0.0%`) / `time_since_prop_overhaul` (`1.6%`)
  - **Extraction target:** engine/prop specs and description fallback text.
  - **Action:** parse SMOH/SPOH rows and preserve canonical fields.
  - **Expected lift:** overhaul `+15` to `+35`, prop `+10` to `+25`.

- **Field:** `total_time_airframe` (`31.8%`)
  - **Extraction target:** TTAF/total time in specs.
  - **Action:** improve numeric parse coverage and fallback text patterns.
  - **Expected lift:** `+20` to `+35` points.

---

## GlobalAir

- **Field:** `state` (`0.0%`)
  - **Extraction target:** seller location/contact city/state block.
  - **Action:** state normalization fix once anti-bot challenge path is stable.
  - **Expected lift:** `+40` to `+70` points.

- **Field:** `time_since_prop_overhaul` (`0.0%`) / `time_since_overhaul` (`6.2%`)
  - **Extraction target:** engine/prop details in listing facts.
  - **Action:** parser updates + challenge-resilient detail refresh mode.
  - **Expected lift:** overhaul `+10` to `+25`, prop `+5` to `+20`.

- **Field:** `n_number` (`55.5%`) / `description` (`69.5%`)
  - **Extraction target:** listing facts + remarks blocks.
  - **Action:** broaden selector variants in refresh mode.
  - **Expected lift:** `n_number +15` to `+30`, `description +10` to `+20`.

---

## Barnstormers

- **Field group:** `location_raw/state/seller_type/time_since_overhaul/time_since_prop_overhaul`
  - **Current fill:** mostly `0%` (small sample size).
  - **Action:** lightweight parser cleanup and one controlled refresh pass.
  - **Expected lift:** meaningful percentage movement but low absolute impact due low row count.

---

## Multi-Engine Tracking (Cross-Source)

- **Now available in DB:** `engine_count`, `second_engine_time_since_overhaul`, `second_time_since_prop_overhaul`, `engines_raw`, `props_raw`.
- **Controller:** active persistence already validated.
- **ASO/TAP/others:** continue source-specific extraction and anti-bot-safe refresh passes.
- **Scoring rule:** second-engine fields should only count for twin/multi-engine listings (single-engine listings are not penalized for missing engine #2).

