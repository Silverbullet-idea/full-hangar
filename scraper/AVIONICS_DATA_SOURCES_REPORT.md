# Avionics Data Sources Report (Ryan)

Date: 2026-03-07  
Lane: MISC research/build deliverable  
Output focus: local JSON seed assets + source audit; no parser/scoring internals modified.

## Outcome Snapshot

- Built `scraper/avionics_catalog_seed.py` and generated `scraper/data/avionics/avionics_master_catalog.json`.
- Current master catalog size: **165 unique units** (Wave 1 target `>=150` met).
- FAA ADS-B dataset was downloaded locally and parsed from:
  - `scraper/data/avionics/faa_adsb_equipment.html`
- Curated OEM/legacy seeds created in `scraper/data/avionics/`:
  - `garmin_seed.json` (37)
  - `avidyne_seed.json` (14)
  - `aspen_seed.json` (10)
  - `legacy_market_seed.json` (25)
  - `supplemental_seed.json` (41)

## Source-by-Source Verdicts

### Tier A

- **FAA ADS-B Approved Equipment** (`https://www.faa.gov/air_traffic/technology/equipadsb/installation/equipment`)  
  **Verdict:** GO  
  **Why:** Most authoritative free source for approved transponder and position-source model names.

- **FAA TSO Authorization DB** (`https://rgl.faa.gov/Regulatory_and_Guidance_Library/rgTSO.nsf/0/`)  
  **Verdict:** CONDITIONAL GO  
  **Why:** Authoritative but endpoint access reliability is inconsistent in scripted fetch; Wave 1 uses curated TSO mapping in seed data.

### Tier B

- **Garmin aviation catalog/pages**  
  **Verdict:** GO (curated/manual-assisted)  
  **Why:** Core Wave 1 families; dynamic pages make pure scraping brittle.

- **Avidyne products**  
  **Verdict:** GO (curated/manual-assisted)  
  **Why:** Product family data accessible and highly relevant for IFD + DFC + Entegra references.

- **Aspen products**  
  **Verdict:** NO-GO for direct automation; GO for manual curation  
  **Why:** Repeated 406/404 behavior from scripted fetch path in this environment.

- **uAvionix products**  
  **Verdict:** GO  
  **Why:** Product cards are accessible and map directly to common ADS-B listing terms.

- **BendixKing + legacy S-TEC**  
  **Verdict:** GO (manual curation first)  
  **Why:** Critical parser coverage for legacy autopilot/nav stacks, but not clean bulk feeds.

### Tier C

- **Avionic Support Group target site**  
  **Verdict:** NO-GO (public capability PDF not found)  
  **Why:** Requires direct contact/manual request for full capability list.

- **Aircraft Spruce PDF catalogs**  
  **Verdict:** CONDITIONAL GO  
  **Why:** Downloadable and broad, but extraction noise is high; use as supplemental token enrichment, not primary truth source.

- **Dallas Avionics install catalog**  
  **Verdict:** NO-GO (current)  
  **Why:** Static page does not expose a clean bulk model list.

- **Kitty Hawk Technologies target**  
  **Verdict:** NO-GO  
  **Why:** Public content is not a GA avionics capability catalog.

- **Aerotechnic capability list mirror (silo)**  
  **Verdict:** GO (supplemental)  
  **Why:** Dense legacy model token source for alias expansion/dedupe QA.

## Units Captured per Source

### Included in Wave 1 master catalog

- FAA ADS-B parsed contribution in master: **47 units**
- Curated source contribution in master: **118 units**
- Total unique units in master catalog: **165**

### Curated source unit counts

- Garmin seed: **37**
- Avidyne seed: **14**
- Aspen seed: **10**
- Legacy market seed (uAvionix/BendixKing/S-TEC): **25**
- Supplemental seed (legacy radios/transponders/autopilots): **41**

### Tier C extraction sweep counts (model-like tokens, pre-dedupe)

- `silo_avionics_capability_list.pdf`: **14** filtered avionics-model tokens
- `avionics_specialist_cap.pdf`: **121** filtered avionics-model tokens
- `aircraft_spruce_2025_instruments.pdf`: **148** filtered avionics-model tokens

> Note: Tier C extracted tokens are intentionally not auto-promoted as canonical units without QA because PDFs include OCR/layout artifacts and non-unit part identifiers.

## Coverage Gaps (Wave 1)

- **Factory-integrated flight deck variants** (airframe-specific avionics bundles) remain underrepresented because they are often marketed by package, not discrete LRU model names.
- **Niche legacy OEMs** (Narco, ARC/Century, early Apollo variants) have partial coverage; additional historical documents are needed for cleaner canonicalization.
- **Aspen full product detail** is constrained by anti-bot behavior on direct scripted fetch routes.
- **Direct FAA TSO record-level automation** is not implemented yet; Wave 1 uses curated TSO mapping references.

## Wave 2 (Multi-Piston) Recommended Ingestion Targets

1. Add high-end autopilot and integrated surveillance combos (`GFC 600`, `KFC 225` adjacencies, `Lynx/Trig` pairings) with segment-specific fitment notes.
2. Expand Collins/Honeywell legacy and retrofit units seen in multi-engine listings.
3. Add installation-context metadata (panel-mount vs remote, dual-system patterns, optional modules).
4. Build a dedicated alias QA pass against real multi-piston listing text to prune false positives from short legacy tokens.
5. Add per-segment valuation confidence levels for installed-value realism in twin-engine listings.

## Paid Subscription / Manual Access Flags

- **Potential manual-contact sources:** Avionic Support Group detailed capability sheets, some OEM dealer price sheets, some installer model matrices.
- **Likely paid/controlled channels:** Installer back-office catalogs and subscription valuation references (if pursued in future waves).
- **Current Wave 1 dataset:** built from publicly accessible pages/PDFs plus manual curation; no paid API or subscription feed consumed in this pass.
