# Avionics Source Research (Wave 1)

Last updated: 2026-03-07  
Owner lane: MISC (research + data seed only)

## Scope

This audit focuses on sources needed to populate a DB-backed avionics catalog for parser matching and conservative valuation support.  
Priority order follows `AVIONICS_EXPANSION_PLAN.md`:

1. Tier A: FAA authoritative sources
2. Tier B: OEM product references
3. Tier C: MRO/catalog sweeps for model coverage expansion

---

## Tier A (Authoritative)

### 1) FAA ADS-B Certified Equipment List

- **URL:** <https://www.faa.gov/air_traffic/technology/equipadsb/installation/equipment>
- **Format:** HTML tables (downloadable page snapshot)
- **Fields available:** Surveillance manufacturer, model, approved position source(s), aircraft applicability, approval date
- **Bulk downloadability:** No official CSV/API found; HTML page can be downloaded and parsed reliably
- **Automated ingestion recommendation:** **GO**
- **Why:** High-authority list with explicit approved transponder models and approved GPS position sources; directly useful for `tso_refs` + alias expansion.

### 2) FAA TSO Authorization Database (RGL legacy endpoint)

- **URL:** <https://rgl.faa.gov/Regulatory_and_Guidance_Library/rgTSO.nsf/0/>
- **Format:** Legacy web database (record pages per TSO authorization)
- **Fields expected:** TSO number, revision, title/scope, status, references to MOPS/performance standards
- **Bulk downloadability:** No modern public bulk export discovered in this run
- **Automated ingestion recommendation:** **CONDITIONAL GO (manual mapping first, automation later)**
- **Why:** Authoritative for standards mapping, but endpoint reliability/access is inconsistent from this environment. For Wave 1, maintain a curated TSO map.

#### FAA TSO numbers mapped to GA avionics function categories (Wave 1)

| Function category | Relevant TSO refs | Notes |
|---|---|---|
| GPS IFR / WAAS navigator | `TSO-C129a`, `TSO-C145e`, `TSO-C146e` | Legacy IFR GPS and WAAS SBAS classes |
| Transponder / Mode S / ADS-B Out | `TSO-C74c`, `TSO-C112f`, `TSO-C166c`, `TSO-C154c` | Mode A/C/S, 1090ES, and UAT ADS-B |
| NAV/COMM radios | `TSO-C37d`, `TSO-C38d`, `TSO-C40c` | VHF comm + VOR/ILS class references |
| Autopilot | `TSO-C9c` | Automatic pilot systems |
| TAWS | `TSO-C151c` | Terrain Awareness and Warning Systems |
| ELT | `TSO-C91a`, `TSO-C126c` | Legacy and modern ELT standards |
| Audio panel / marker | `TSO-C50c`, `TSO-C35d` | Audio selecting + marker beacon components |

---

## Tier B (OEM product/model references)

### Garmin
- **Requested URL:** <https://buy.garmin.com/en-US/US/catalog/product/index.html> (returned 404)
- **Working URL used:** <https://www.garmin.com/en-US/c/aviation/>
- **Format:** JS-driven category content
- **Fields observed:** Product families and marketing metadata; MSRP not consistently scrape-friendly in one static feed
- **Bulk downloadability:** No
- **Automated ingestion recommendation:** **GO (curated/manual-assisted)**
- **Why:** Core Wave 1 families (`GTN`, `GNS`, `G3X`, `G5`, `GFC`, `GTX`, `GDL`, `GMA`) are essential; use curated JSON + periodic refresh.

### Avidyne
- **URL:** <https://www.avidyne.com/products/>
- **Format:** HTML + product/menu slugs
- **Fields observed:** Product lines and model families (`IFD`, `DFC90`, `Entegra`, `R9` references)
- **Bulk downloadability:** No
- **Automated ingestion recommendation:** **GO (curated/manual-assisted)**
- **Why:** High-value piston-single catalog entries; scrape can discover family names, but model-level normalization still benefits from curation.

### Aspen Avionics
- **URL:** <https://aspenavionics.com/products/> (blocked/not stable in this environment)
- **Format:** Site access inconsistent (`406`/`404` from non-browser fetch)
- **Fields observed:** Manual verification required for model naming/pricing
- **Bulk downloadability:** No
- **Automated ingestion recommendation:** **NO-GO for direct scraping; GO for manual curation**
- **Why:** High anti-bot/access friction for scripted fetch; maintain curated `EFD/Evolution` list.

### uAvionix
- **URL:** <https://uavionix.com/products/>
- **Format:** HTML cards
- **Fields observed:** Model names and product cards (`skyBeacon`, `tailBeacon`, `AV-30`, `ping200XR`)
- **Bulk downloadability:** No
- **Automated ingestion recommendation:** **GO (light scrape + manual QA)**
- **Why:** Product names are accessible and strongly relevant to ADS-B parsing.

### BendixKing
- **URL:** <https://bendixking.com>
- **Format:** Marketing/dynamic content
- **Fields observed:** Legacy + current product references (`AeroCruze`, legacy family mentions)
- **Bulk downloadability:** No
- **Automated ingestion recommendation:** **GO (manual curation primarily)**
- **Why:** Critical legacy stack coverage for parser recall; direct scrape quality is limited.

### S-TEC (Genesys legacy)
- **URL checked:** via BendixKing/Genesys references and market listings
- **Format:** No clean, structured public model index discovered in this run
- **Fields observed:** Common family names (`System 20/30/40/50/55X/65`, `3100`)
- **Bulk downloadability:** No
- **Automated ingestion recommendation:** **GO (manual curation + market evidence)**
- **Why:** Essential parser aliases in real listing text, especially legacy autopilot references.

---

## Tier C (MRO and catalog sweeps)

### Avionic Support Group target
- **URL checked:** <https://asginc.net/>
- **Finding:** No public general avionics capability list PDF discovered
- **Recommendation:** **NO-GO** for automation now; requires direct vendor contact/manual request.

### Aircraft Spruce
- **URLs:**  
  - <https://www.aircraftspruce.com/pdf/index.html>  
  - <https://www.aircraftspruce.com/pdf/2025Individual/2025_IN.pdf>  
  - <https://www.aircraftspruce.com/pdf/2026Individual/Cat26218.pdf>
- **Format:** PDF catalogs
- **Fields available:** Product/model text and part references, broad pricing context
- **Bulk downloadability:** Yes (PDF files)
- **Automated ingestion recommendation:** **CONDITIONAL GO**
- **Why:** Broad coverage but noisy extraction (OCR/layout artifacts); use as supplemental token source only.

### Kitty Hawk Technologies target
- **URL checked:** <https://kittyhawktech.com/>
- **Finding:** Defense engineering company content, no relevant GA avionics capability list
- **Recommendation:** **NO-GO** for avionics catalog ingestion.

### Dallas Avionics target
- **URL checked:** <https://www.dallasavionics.com/cgi-bin/install_catalog/home.cgi>
- **Format:** HTML install catalog
- **Fields available:** Category and install catalog structure; model-level extractability limited in static pass
- **Bulk downloadability:** No API/bulk discovered
- **Automated ingestion recommendation:** **NO-GO (for now)**
- **Why:** Better suited to manual lookup than automated model extraction.

### Additional public capability list used for extraction depth
- **URL:** <https://silo.tips/download/avionics-capability-list>
- **Direct PDF endpoint used:** <https://silo.tips/downloadFile/avionics-capability-list?preview=1>
- **Format:** PDF (Aerotechnic avionics capability list mirror)
- **Fields available:** Part number, unit description, unit type/model tokens
- **Bulk downloadability:** Yes (single PDF)
- **Automated ingestion recommendation:** **GO (supplemental, with dedupe QA)**
- **Why:** High density of legacy model identifiers useful for alias expansion.

---

## Source Audit Summary (Go/No-Go)

| Source | Verdict | Ingestion mode |
|---|---|---|
| FAA ADS-B approved equipment list | GO | Automated HTML parse |
| FAA TSO authorization DB | CONDITIONAL GO | Curated mapping first; automation after access hardening |
| Garmin aviation | GO | Curated/manual-assisted |
| Avidyne products | GO | Curated/manual-assisted |
| Aspen products | NO-GO for scraper | Manual curation |
| uAvionix products | GO | Light scrape + manual QA |
| BendixKing | GO | Manual curation |
| S-TEC legacy models | GO | Manual curation + market comps |
| Avionic Support Group site | NO-GO | No public capability list located |
| Aircraft Spruce PDF catalogs | CONDITIONAL GO | Supplemental extraction only |
| Kitty Hawk Technologies | NO-GO | Not relevant for GA avionics unit catalog |
| Dallas Avionics install catalog | NO-GO (current) | Manual lookup only |
| Aerotechnic capability PDF mirror | GO | Supplemental extraction |
