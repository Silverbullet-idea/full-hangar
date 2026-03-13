# Full Hangar — Agent Workflow Helper

> Every agent reads this first and updates it when done.
> Last updated: March 8, 2026

This is the short, operational board for current work. Permanent standards stay in `.cursor/rules/fullhangar.mdc`.

---

## Ground Rules

- Max 3 parallel agents: `FRONTEND`, `BACKEND`, `MISC`.
- Ownership:
  - `FRONTEND`: `app/` (non-API), UI components, styles, page UX.
  - `BACKEND`: `scraper/`, `app/api/`, `lib/db/`, `core/intelligence/`, `supabase/migrations/`.
  - `MISC`: docs/research and one-off scripts that do not touch active frontend/scraper internals.
- Do not modify another active lane without coordination noted here.
- Python runtime: always `.venv312\Scripts\python.exe`.
- Dev server target: `http://localhost:3001`.
- Project root: `D:\Documents\$$Full Hangar\2.0\CursorReposity\full-hangar\`.

---

## Current Focus

- Keep the board accurate and lean while preserving completion tracking.
- Maintain frontend polish and parity for both dark/light themes.
- Continue data-source expansion where still incomplete (research-heavy tracks).
- Keep scraper + scoring reliability stable (timeouts, fallback behavior, resumability).

---

## Completed Recently (Condensed)

### Platform and Infra

- Next.js 16 setup stabilized on port `3001` with restart-oriented dev workflow.
- Supabase server access standardized via `lib/supabase/server.ts` (`createServerClient` and `createPrivilegedServerClient`).
- Post-scrape pipeline flow and KPI/log summarization utilities added.
- Project architecture and refactor baseline documented in `REFACTOR_PLAN.md`.
- Admin portal shipped at `/internal/admin` with data quality, buyer intelligence, and invite management.
- Beta invite/session schema added via migration `20260307000050_add_beta_invites.sql`.
- Admin user management and password hashing utilities shipped (`/internal/admin/users`, `lib/admin/users.ts`).
- Manual production redeploy trigger commit was pushed on `main` after stale admin HTML/caching behavior.

### Frontend Product and UX

- Theme system shipped with persistent dark/light mode, dual logos, and tokenized styling parity.
- Global header/search improvements shipped, including listings search entry and inventory-aware UX updates.
- Listings browsing UX significantly improved (banner controls, layout modes, row/compact density, filtering polish, return-state persistence).
- Listings filter reliability pass shipped: make/model family filtering now uses wildcard matching (preventing zero-result false negatives), max-price filtering now enforces positive non-null prices (excluding call-for-price/$0 rows), top-category make dropdowns now include low-count makes, and helicopter detection/isolation was tightened so rotorcraft no longer leak into fixed-wing category lanes.
- Listings sidebar filter expansion shipped: added deal-type selection, priced-only toggle, min/max price range (preset + manual), year range (preset + manual), total-time range (preset + manual), maintenance-burden bands, and true-cost exact range filters wired through URL params + API + DB query pipeline.
- Listings SSR reliability hardening shipped: `/listings` now degrades gracefully on initial data-load failures and prefers privileged server-side Supabase reads (with anon fallback) to avoid public-role permission crashes.
- Listing detail SSR reliability hardening shipped for `/listings/[id]`: metadata/detail/market-history fetches now fail soft instead of crashing, and server-side detail queries prefer service-role Supabase auth (with anon fallback) to avoid `aircraft_listings` permission regressions.
- Listing detail page upgraded with richer FAA snapshot, comps/cost visualization, score summary clarity, and avionics rendering quality.
- Listing detail comps UX refresh shipped: removed inline asking-price text from the H1 title line, moved asking price into the `Comp & Cost` panel above estimated range, and restored expanded comparable-market outputs with a comps table plus an additional "other comps" list while keeping the Price-vs-Year/Time toggle and exact-submodel toggle behavior.
- Listing detail comps API hardening shipped: `/api/listings/[id]/comps` now queries `public_listings` directly and avoids `aircraft_listings` dependency so chart payloads continue to resolve under public-role constraints.
- Listing detail comps API fallback hardened again: route now attempts privileged `aircraft_listings` reads first and auto-falls back to `public_listings` on any privileged-query failure to keep chart/table payloads available in mixed-permission environments.
- Root layout hydration-noise mitigation shipped: `suppressHydrationWarning` is now applied at `html/body` to avoid false-positive text mismatch errors from client bootstrap/theme state variance.
- Comps panel supports multiple comparison modes and dynamic chart loading behavior.
- `/beta/join` and `/beta/dashboard` beta-facing intelligence preview shipped with token-session access.
- `/beta/join` now supports Google Sign-In for authorized users listed in `admin_users`.
- `/internal/admin` now includes source-level inventory detail view (table, completeness tiers, unknown-domain disambiguation, and 15-field coverage heatmap).

### Backend, Pipeline, and Data Sources

- Shared scraper foundations landed (`env_check`, `schema`, `scraper_base`, config/tier normalization, retry/upsert safety).
- Trade-A-Plane and Controller pipelines hardened with adaptive controls, retries, and safer fallbacks.
- Additional sources integrated and iterated (AeroTrader, AFS, ASO, GlobalAir, AvBuyer, Barnstormers).
- Non-aircraft detection/hide workflow implemented and operationalized.
- FAA enrichment + ownership-transfer feed + internal recent-sales wiring completed.
- Avionics Wave 1 source audit + local seed assets shipped (`scraper/avionics_source_research.md`, `scraper/AVIONICS_DATA_SOURCES_REPORT.md`, `scraper/avionics_catalog_seed.py`, and `scraper/data/avionics/avionics_master_catalog.json` with 165 units).
- Internal admin APIs added for data quality, platform stats, buyer intelligence, and invite management.
- Listing media resilience hardened (URL validation, gallery failover, proxy-safe placeholders, integrity audit tooling).

### Intelligence and Scoring

- Hybrid scoring v`1.8.0` deployed with improved calibration and distribution outcomes.
- Avionics parser/catalog/valuation expansion completed through rollout + attribution persistence.
- Avionics coverage auditing restored via `scraper/audit_avionics_coverage.py` with scoped extraction coverage, parser-version distribution, unresolved-token leaderboard, and source-level breakdown outputs (`scraper/avionics_coverage_audit_latest.json`, `scraper/avionics_coverage_audit_latest.md`).
- Description parser avionics extraction advanced to v`2.0.4` with expanded alias coverage (IFD 440/540, GFC 500/600, GI 275, GNX 375, GPS 175, G500/G600 TXi, KX/KFC/KAS family aliases) and explicit `650/750` combo handling.
- Avionics observation backfill write-path hardened by deduping per-conflict keys before upsert (`scraper/avionics_observation_backfill.py`), preventing `ON CONFLICT ... cannot affect row a second time` failures.
- Runtime compatibility gaps were patched for local pipeline execution by restoring shared scraper helpers (`scraper/env_check.py`, `scraper/scraper_base.py`) and intelligence compatibility helpers (`core/intelligence/stc_intelligence.py`, `lookup_engine_tbo_from_model` in `core/intelligence/reference_service.py`).
- Description parser advanced to v`2.0.5` with high-frequency unresolved token coverage (`KX155`, `KFC150`, `GTX335R`, `GTX33`, `GMA345/1360/1347`, `GDL69/82/88`, `GIA64/64W`, `GDU1040`, `GDC72`, `GRS79`, `GCU476`) plus targeted reparse tooling (`scraper/backfill_description_intelligence.py`).
- Recent data refresh completed: `description_intelligence` updated for 1,537 recent listings and avionics observations refreshed for 3,000 listings; latest 90-day audit now reports `83.73%` matched-row rate and `65.91%` scoped extraction coverage.
- Description parser advanced again to v`2.0.6` with additional legacy stack coverage (`KX170B`, `KX165`, `KFC200`, `S-TEC30`) and full reparse run completed across recent inventory (`processed=8319`, `updated=4381`, `skipped_current=1916`).
- Full observation refresh completed for `8319` listings (`rows=7352`, `matched=6780`, `unresolved=591`) and post-refresh 90-day audit now reports `89.67%` matched-row rate, `10.33%` unresolved-row rate, and `68.12%` scoped extraction coverage.
- Description parser expanded with richer normalization and maintenance context extraction.
- Comps selection/waterfall logic improved and reflected in listing detail score explanations.
- Canonical completeness scoring map added in `lib/admin/completeness.ts` for parser-focused data quality recommendations.
- Avionics data expansion pipeline scaffolding landed: multi-source price observation migration (`20260311000054_add_avionics_price_observations.sql`), new extractor/scraper/consolidator/ingest scripts, and progress tracking (`scraper/avionics_expansion_progress.json`). Current run extracted 113 PDF rows + 3 inventory rows, added unresolved-token canonicals/aliases (`KAP150`, `GIA63`, `GDC74`, `PMA7/8k`), and refreshed 90-day audit output at `89.67%` matched-row rate / `68.4%` scoped extraction coverage.
- Phase 2 pricing matcher pass landed in `scraper/avionics_price_consolidator.py` + catalog expansion: compact-token model extraction (`KT74`, `EFD1000`, `GNS-XLS`, etc.) and 22 targeted canonicals/aliases were added, lifting priced observations with `unit_id` from `9` to `35` (`31` distinct units) and increasing priced DB points to `142` (`bas_part_sales=58`, `global_aircraft=84`).
- BAS detail-page parsing was upgraded in `scraper/avionics_bas_scraper.py` (authoritative part/model/manufacturer/condition from product details), raising BAS priced extraction to `230` rows and Supabase priced observations to `195` total (`bas_part_sales=111`, `global_aircraft=84`) after dedupe constraints.
- BAS category expansion shipped in `scraper/avionics_bas_scraper.py` (CLI categories + smoke mode + multi-category breadth scrape): full avionics-category pass (`max_pages=3`) extracted `917` BAS rows (`383` priced), and post-ingest Supabase now has `406` priced observations total (`bas_part_sales=322`, `global_aircraft=84`) with `48` priced rows mapped to `unit_id` across `34` distinct units.
- GlobalAir source was reworked to use the Searchanise-backed `search-results-page?collection=avionics` pipeline only (`scraper/avionics_global_scraper.py`), producing `301` priced avionics rows from that collection surface and lifting consolidated global matched rows to `33` (`23` distinct units) on latest local run.
- Phase 3 inventory expansion now includes Bennett + Pacific Coast Avionics (`scraper/avionics_bennett_scraper.py`, `scraper/avionics_pacific_scraper.py`): latest pass captured `60` priced Bennett rows and `413` priced Pacific variant rows, with post-consolidation totals at `3382` observations (`1794` priced; `304` matched rows across `78` distinct units) and ingest delta `price_obs+1017` / `market_values_updated=37`.
- Phase 5/6 quality pass hardened matching in `scraper/avionics_price_consolidator.py` (AeroCruze token support, short-alias boundary matching, and fallback alias scan when primary token-match misses) plus targeted catalog expansion (`+7` canonicals, `+10` aliases), improving source match counts to Pacific `96 → 124`, Bennett `29 → 41`, and Global `33 → 39` matched priced rows on the latest consolidation.
- A second targeted Phase 5/6 pass added high-frequency Global/Pacific canonicals (`+16` units, `+16` aliases; e.g., `KI 525A`, `KI 227`, `KA 92`, `KS 271A`, `GDL 69`, `PMA 450B`), lifting matched priced rows further to Pacific `128/406` and Global `55/275` (overall matched priced rows now `520`, distinct units `109`).
- Consolidation/ingest quality controls were upgraded: Global title normalization now strips duplicate tails/noisy registration suffixes (`278` normalized titles on latest run), consolidator emits `match_confidence` + `match_reason`, ingest defaults to high-confidence auto-ingest (`AVIONICS_INGEST_MIN_CONFIDENCE=high`), and market value recompute is now condition-aware (`market_p25_used/new/non_core/all` valuation basis selection).
- Medium-confidence review queue now auto-generates at `scraper/data/avionics/top_medium_confidence_candidates.json` from consolidation output, including source/reason rollups plus `suggested_action` (`approve_alias` vs `reject_non_unit`) to accelerate manual alias curation.
- Alias-review tooling shipped at `scraper/apply_reviewed_aliases.py` with review workflow files (`top_medium_confidence_reviewed.json`, `top_medium_confidence_apply_report.json`); latest run auto-approved and applied `MX-170B NAV/COMM` -> `BendixKing KX 170B`.
- Unresolved-token reduction pass applied from the curated queue (`GFC500`, `STEC50`, `GIA63`, `KX155`, `GDC74`, `KLN94`, `KX125`, `NGT9000`, `GRS79`, `GMA345`, `PMA7000B`, `PMA8000`, `GDL88`, `GDC72`, `GMA1360`, `PMA8000G`, `PMA450`, `PMA8000B`, `KAP150`, `GDL69`): parser bumped to `v2.0.7` and latest bounded refresh moved audit to `90.16%` matched-row rate with `70.07%` scoped extraction coverage (`unresolved_rows=689`).
- Full parser propagation sweep completed (`--limit 9000` for both description intelligence + observation backfill): latest 90-day audit now reports `93.64%` matched-row rate, `6.36%` unresolved-row rate, and `74.81%` scoped extraction coverage with parser-version distribution led by `2.0.7` (`4755` listings).
- Parser `v2.0.8` targeted unresolved-token pass + full sweep completed (`--limit 9000`), lifting latest 90-day audit to `95.4%` matched-row rate and `4.6%` unresolved-row rate (`unresolved_rows=355`) with `2.0.8` now dominant (`5091` listings).
- Parser `v2.0.9` targeted unresolved-token pass + full sweep completed (`--limit 9000`), adding coverage for `GDL39`, `GTX320A/325/33D/345DR`, `GTS820`, `GDU1044/620`, `GMC507`, `KX175B`, `GNS480`, `PMA6000/6000B/7000M`, and `GDC31`; latest 90-day audit now reports `96.46%` matched-row rate, `3.54%` unresolved-row rate (`unresolved_rows=278`), and `73.62%` scoped extraction coverage with `2.0.9` dominant (`5140` listings).
- Parser `v2.1.0` targeted unresolved precision + convergence pass completed (`--limit 12000`): unresolved suppression now accounts for canonical/matched compact-token variants (reducing false unresolved carry-through), plus additional mappings (`GTN625`, `GNS650`, `GTX375`, `GDU1045/1050`, `STEC40`, `PMA8000C`, `PMA450B`). Latest 90-day audit now reports `97.67%` matched-row rate, `2.33%` unresolved-row rate (`unresolved_rows=178`), `74.86%` scoped extraction coverage, and parser `2.1.0` now leads (`5713` listings).
- Parser `v2.1.1` curated unresolved-family pass completed (`--limit 12000`) using operator-provided token matrix (GDL/GTX/GDU/GMC/GCU/GDC/GRS/GMU/GTS/GTC/GNX/GNS/GTN/GPS/KLN/KX/KFC/STEC/PMA/NGT) and stronger unresolved suppression (candidate-token extraction from canonical + matched text). Latest 90-day audit now reports `99.08%` matched-row rate, `0.92%` unresolved-row rate (`unresolved_rows=75`), and `74.7%` scoped extraction coverage with parser `2.1.1` dominant (`5270` listings).
- Parser `v2.1.2` residual micro-pass completed (`--limit 12000`) from latest operator queue (`GTS8000`, `GTX33X`, `GTN327`, `GDL52R`, `PMA700B/PMA600B/PMA450A`, `KX155B/KX170`, `STEC2100`) with catalog sync (+11 canonicals) and variant coverage refinements. Latest 90-day audit now reports `99.16%` matched-row rate, `0.84%` unresolved-row rate (`unresolved_rows=67`), and `74.61%` scoped extraction coverage with parser `2.1.2` leading (`5118` listings).
- Parser `v2.1.3` final residual mapping pass completed (`--limit 12000`) using expanded operator guidance for remaining edge variants (`GTX800/354R`, `GTS600/8000`, `KX135`, `GDC72B`, `GTC580`, `GCU475`, `GTN625Xi`, plus `GTX750Xi` normalization to `GTN 750`). Post-refresh 90-day audit remains improved at `99.16%` matched-row rate and `0.84%` unresolved-row rate (`unresolved_rows=67`), with coverage `74.61%`.
- Parser `v2.1.3` propagation rerun completed to align parser-version lineage and sweep additional stale rows: latest 90-day audit now reports `99.51%` matched-row rate, `0.49%` unresolved-row rate (`unresolved_rows=41`), and `75.96%` scoped extraction coverage, with `v2.1.3` now dominant (`5314` listings).
- Parser `v2.1.3` residual cleanup rerun completed after final edge-case mapping adjustments; latest 90-day audit now reports `99.57%` matched-row rate, `0.43%` unresolved-row rate (`unresolved_rows=36`), and `76.29%` scoped extraction coverage with `v2.1.3` dominant (`6207` listings).
- Internal admin telemetry expanded with a new **Avionics Intelligence** section on `/internal/admin` and supporting API route `/api/internal/admin/avionics-intelligence`, surfacing catalog size, parser adoption, coverage/match KPIs, and unresolved-token leaderboard for operational visibility.
- Wave 2 rollout activation pass completed for `piston_multi`: catalog seed applied (`units=10`, `aliases=40`, `certs=10`), segment market ingest refreshed (`rows=10`; valuation basis `oem_msrp=8`, `market_insufficient=2`), and latest 90-day audit moved to `99.62%` matched-row rate with `32` unresolved rows and `76.24%` scoped extraction coverage.
- Wave 3 shadow lane is now active for `turboprop`: seeded catalog segment (`units=9`, `aliases=28`, `certs=9`), applied turboprop market snapshots (`rows=9`), added segment-aware audit support (`--segment` + `segment_breakdown`), and captured a dedicated turboprop 90-day baseline (`listings_scanned=420`, `matched_rate=100%`, `unresolved_rows=0`, `coverage=73.47%`).
- Wave 3 shadow baselines completed for `rotorcraft` and `jet`: seeded catalog segments (`rotorcraft units=8`, `jet units=9`), applied market snapshots (`rotorcraft rows=8`, `jet rows=9`, all currently OEM-anchored), and published dedicated 90-day audits/queues with unresolved rows at `0` for both segments.
- Listing detail cleanup pass shipped for all active listings: added `scraper/reparse_listing_details_sections.py`, reparsed `description_full` sections (`processed=8319`, `updated=1253` + `engine-model cleanup updates=238`), and now prefer cleaned `avionics_notes` over raw `avionics_description` on listing detail pages for clearer Aircraft Details rendering.
- Wave 3 targeted uplift pass completed with parser `v2.1.5` + jet/rotor alias expansion (Collins Pro Line/FMS, Honeywell Primus/DU/RCZ/RNZ/DM/DF, Universal UNS, Garmin G3000/G5000, HeliSAS): full backfill + observation refresh raised jet extraction coverage to `72.98%` (from prior `55.65%`) while keeping quality within gates (`97.77%` matched, `2.23%` unresolved); rotorcraft remains stable at `34.15%` coverage with `100%` matched and `0%` unresolved.
- Wave 3 micro-pass `v2.1.6` completed on residual jet unresolved tokens (`RCZ833F`, `Primus 880`, `DM855`, `DU875/885`) with another full refresh cycle: jet now reports `73.46%` extraction coverage, `98.31%` matched-row rate, and `1.69%` unresolved-rate (`8` unresolved rows), maintaining gate compliance while preserving coverage gains.

---

## Open Work (Lean Backlog)

Each item should stay one-line actionable with clear completion criteria.

### High Priority

- **Board hygiene:** keep this file concise and current after each substantial session.
- **BAS maintenance (biweekly):** stop continuous BAS crawling; run `npm run pipeline:avionics:bas:biweekly` once every other week and review only net-new candidates before catalog promotion.
- **Global collection focus (active):** prioritize `search-results-page?collection=avionics` via `npm run pipeline:avionics:global:collection` and keep matching/ingest stable as primary avionics-source workflow.
- **Source field fix queue execution (active):** run through `scraper/SOURCE_FIELD_FIX_QUEUE.md` source-by-source (Controller → ASO → TAP → AvBuyer → AeroTrader → GlobalAir → Barnstormers), with controlled smoke runs and DB delta checks after each source.
- **Wave 2/3 rollout activation (active):** baseline coverage now exists for `piston_multi`, `turboprop`, `rotorcraft`, and `jet`; next step is segment-level threshold tuning and coverage uplift (especially low extraction coverage in rotorcraft/jet) before any score-impacting cutover.
- **Avionics quality loop:** reduce top unresolved tokens from latest audit (`KX155`, `GFC500`, `GFC600`, `IFD440`, `GNX375`) and raise scoped extraction coverage for low-coverage sources (notably `aso` and `trade_a_plane`).
- **Avionics quality loop:** continue unresolved-token reduction on remaining leaderboard (`KX170B`, `KX165`, `STEC30`, `KFC200`, plus lingering Garmin peripheral IDs) and migrate more inventory to parser v`2.0.5` via rolling intelligence backfill.
- **Avionics quality loop:** finish micro-tail unresolved tokens (`KX170B`, `KX175B`, `GDU25`, `PMA150`) and review typo-like singles (`GTX650XI`, `GTX345RW`, `GTN335`, `GIA275`) before optional parser `v2.1.4` closeout.

### Medium Priority

- **DS-4 Type Clubs:** complete research matrix + scrapeability report and wire any allowed scrapers.
- **DS-6 Bluebook Eval:** deliver integration plan with ROI recommendation.
- **DS-7 VREF Eval:** deliver integration plan and Bluebook-vs-VREF recommendation matrix.
- **DS-8 State Tax Data:** complete research and determine viable portals for normalized ingest.

### Low Priority / Future

- **DS-9 YouTube Prototype:** transcript-mining proof of concept and confidence-labeled report.
- **User-facing roadmap:** auth/saved searches, marketing home page, pre-buy export, mobile polish.

---

## Data Source Status Snapshot

- `DS-1 Barnstormers`: Implemented and integrated; keep iterative quality passes as needed.
- `DS-2 eBay sold/component feeds`: Implemented and feeding comps/deal signals.
- `DS-3 FAA ownership monitor`: Implemented and internally surfaced.
- `DS-4` to `DS-9`: Still open (see Open Work).

---

## Pending Migrations (Needs Verification)

Historical notes in prior versions listed a long migration queue (`20260301000018` through `20260307000051`) while other notes stated many were already live. Reconcile against the target Supabase project before running any replay.

Recommended verification flow:

1. Compare local `supabase/migrations/` files against applied remote migration history.
2. Apply only missing migrations in chronological order.
3. Run:

```bash
.venv312\Scripts\python.exe scraper\backfill_scores.py
```

---

## Known Verification Gaps

- **Script path mismatch:** multiple commands reference root or `scripts/` PowerShell files that may not exist in this workspace snapshot.
- **Legacy ownership references:** old `src/pages/api` and `src/components` ownership text conflicted with current `app/` + `app/api/` structure.
- **Performance docs:** references to `PERFORMANCE_BASELINE.md` and `PERFORMANCE_BUDGET.md` exist in historical notes but should be rechecked in-repo.
- **Task block drift:** prior long-form Task 1-11 and DS blocks had completion-state contradictions with the completed log.

Use `Needs verification` labels instead of assuming deletion for uncertain historical references.

---

## Key Commands (Validated First)

Prefer npm scripts from `package.json` as canonical entry points.

```bash
# Dev
npm run dev
npm run dev:restart

# Parallel dev + scrape
npm run dev:scrape
npm run dev:scrape:controller
npm run dev:scrape:aso
npm run dev:scrape:globalair

# Post-scrape / daily pipeline
npm run pipeline:post-scrape
npm run pipeline:post-scrape:with-ntsb
npm run pipeline:daily
npm run pipeline:summary

# Source pipelines
npm run pipeline:barnstormers
npm run pipeline:afs
npm run pipeline:aso
npm run pipeline:globalair
npm run pipeline:avbuyer
npm run pipeline:faa-monitor

# Intelligence / audits
npm run pipeline:avionics:audit
npm run pipeline:avionics:price-ingest
npm run pipeline:media:coverage:active
npm run pipeline:media:integrity
.venv312\Scripts\python.exe scraper\validate_scores.py
```

---

## Supabase Access (Canonical)

Use `lib/supabase/server.ts` only.

- `createServerClient()`: standard server reads.
- `createPrivilegedServerClient()`: privileged/internal operations requiring service role.

Service key resolution order:

1. `SUPABASE_SERVICE_KEY`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `NEXT_SUPABASE_SERVICE_ROLE_KEY`
4. Local dev fallback from `scraper/.env` (`SUPABASE_SERVICE_KEY`)

Never expose service-role keys to client/browser code.

---

## Environment Notes

`.env.local` (frontend):

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
INTERNAL_PASSWORD=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
```

`scraper/.env` (Python):

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
```

---

## Session Close Checklist

1. Update relevant sections in this file (completed/open/verification gaps).
2. Keep entries concise and outcome-focused; avoid long narrative logs.
3. Note any new migrations or operational blockers.
4. Commit changes using standard repo workflow when requested.
