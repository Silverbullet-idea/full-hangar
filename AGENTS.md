# Full Hangar — Agent Workflow Helper

> Every agent reads this first and updates it when done.
> Last updated: March 21, 2026

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
- Deal Desk scenario schema landed via migration `20260314000055_add_deal_desk_scenarios.sql` (applied with `supabase db push`).
- Post-scrape pipeline flow and KPI/log summarization utilities added.
- Project architecture and refactor baseline documented in `REFACTOR_PLAN.md`.
- Admin portal shipped at `/internal/admin` with data quality, buyer intelligence, and invite management.
- Beta invite/session schema added via migration `20260307000050_add_beta_invites.sql`.
- Admin user management and password hashing utilities shipped (`/internal/admin/users`, `lib/admin/users.ts`).
- Manual production redeploy trigger commit was pushed on `main` after stale admin HTML/caching behavior.

### Frontend Product and UX

- Theme system shipped with persistent dark/light mode, dual logos, and tokenized styling parity.
- Deal Desk shipped at `/internal/deal-desk` with per-listing live profit calculator, debounced scenario persistence, compare view, and inline `DealDeskCard` wiring on listing detail pages.
- Deal Desk expanded to full 9-section flip P&L tool with acquisition capex, upgrade tagging, carrying costs, financing, exit costs, and 3x3 sensitivity grid. Migration `20260316000056_expand_deal_desk_scenarios.sql` applied.
- Market Intel Room shipped at `/internal/market-intel` with 8 sections: market pulse, submodel comparison, price drivers, avionics premium map, geographic intelligence, sold signals, flip analysis, and active listings grid. Linked from Deal Desk and deals page.
- Market Intel link confirmed in `/internal/` navigation surfaces used by internal deals/admin/deal-desk pages.
- Deals research-link runtime hardening shipped: Market Intel row action now preserves/derives make+model when deal-signal merges return sparse identity fields, with smoke coverage at `tests/smoke/market-intel-links.spec.js` (environment-aware skip when no resolvable deals rows are present).
- Deals->Market Intel smoke made deterministic: Playwright fixture routing now mocks `/rest/v1/public_listings`, `/api/internal/deal-signals`, and `/api/internal/recent-sales` for stable deals-row link assertions, and the skip condition was removed (`tests/smoke/market-intel-links.spec.js` now fully passing).
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
- Header hydration mismatch fix shipped: theme-dependent header brand/toggle now render a stable pre-mount shell and only apply stored dark-mode state after mount, preventing React `#418` text/src mismatches on detail-page loads.
- Market comps table controls updated on listing detail: removed `Risk`/`Deal` columns, switched `Price` to light-green emphasis, and added clickable sort toggles for `Price`, `Year`, and `TT` (ascending/descending).
- Description-intelligence extraction expanded for prop-focused timing: parser now supports decimal hour values, better `time since RAM/overhaul` phrase capture, emits structured `prop` payload (`model`, `spoh`), backfill can populate `time_since_prop_overhaul` + `prop_model`, and a new audit script (`scraper/audit_description_time_coverage.py`) quantifies potential coverage uplift before score-impacting rollout.
- Backfill write-path compatibility hotfix shipped for prop-time extraction: parser-derived hour values are now normalized to integer-safe writes in `scraper/backfill_scores.py` before DB updates, preventing `invalid input syntax for type integer` failures during resumed backfill runs; latest 90-day coverage audit reports `Engine SMOH 26.27%` (+`0.82pp`), `Prop SPOH 10.05%` (+`1.83pp`), and `Prop Model 7.40%` (+`6.43pp`) combined coverage.
- Listing detail comps chart readability improved: X-axis now uses data-driven price-domain bounds with smart padding (12% range padding and a `$50k` minimum on each side) and rounded tick bounds, preventing compressed point clustering from broad auto-scales.
- Listing detail engine-value UX shipped: `Engine Value Estimate` panel now renders below Airframe/Engine with life-used progress, SMOH-vs-TBO context, remaining value/reserve display, and conditional past-TBO overrun liability; true-cost/deferred-maintenance metrics now include engine overrun where present, and Deal Desk carrying-costs now pre-seed/suggest engine reserve per hour from listing pricing data.
- Engine-value frontend integration expanded across all target surfaces: listings browse now supports engine health badge + engine-time filter + engine-life sort (`ev_pct_life_remaining`), listing detail engine panel now consumes live score payloads (`score_data.engine_value`) with TBO reference + calendar advisory + `tbo_only/none` handling, and internal deals now include engine-life column sorting plus deferred-cost totals that include `ev_engine_overrun_liability`.
- Engine-value data-path fallback hardening shipped in `lib/db/listingsRepository.ts` + internal deals fetch columns: when `public_listings.ev_*` is null, list APIs now derive `ev_*` fields from top-level engine metrics (`engine_hours_smoh`, `engine_tbo_hours`, `engine_remaining_value`, `engine_overrun_liability`, `engine_reserve_per_hour`) so engine UI can render during view-sync lag.
- Comps panel supports multiple comparison modes and dynamic chart loading behavior.
- `/beta/join` and `/beta/dashboard` beta-facing intelligence preview shipped with token-session access.
- `/beta/join` now supports Google Sign-In for authorized users listed in `admin_users`.
- `/internal/admin` now includes source-level inventory detail view (table, completeness tiers, unknown-domain disambiguation, and 15-field coverage heatmap).
- Geographic Intelligence section (market-intel Section 5) upgraded from plain table to interactive SVG choropleth map with state-level color encoding, listing count circles, hover tooltips, non-US footnote table, and full dark/light theme parity. New component: `app/components/GeoIntelMap.tsx`. State path data at `lib/geo/us-states-albers.ts`.
- Mobile responsiveness pass shipped: listings page now has a bottom-sheet filter drawer on mobile (< 768px) with active-filter badge count, replacing the sidebar; listing detail page comps chart fixed for narrow viewport overflow, comps table columns hide on mobile, gallery images use CSS snap horizontal scroll, touch targets audited to 44px minimum; Deal Desk sensitivity grid is desktop-only with mobile fallback message, all 9 sections are single-column on mobile, number inputs have `inputMode="numeric"`, sticky P&L summary bar added for mobile; global header overflow verified; back-nav link added to listing detail on mobile. Full dark/light theme parity maintained throughout.
- Mobile safe-area follow-up: root `viewportFit: "cover"` plus `env(safe-area-inset-*)` on Deal Desk sticky bar, filter drawer footer, and scroll padding; drawer max height uses `85dvh`; site header top padding respects notch.
- Homepage redesign shipped: ticker bar, updated hero copy + score card mockup, Carfax one-liner banner, animated stats counters, market infographic grid (6 cards), how-it-works 3-step, deal patterns 3-card, score breakdown with pillar bars, testimonial restyle, footer CTA update. No backend changes.
- Homepage bug fixes: corrected double-$ price strings, ticker bar now full-bleed via `calc(-50vw + 50%)` margin breakout, score card pillar bar colors corrected (orange/green/amber).

### Backend, Pipeline, and Data Sources

- Shared scraper foundations landed (`env_check`, `schema`, `scraper_base`, config/tier normalization, retry/upsert safety).
- Trade-A-Plane and Controller pipelines hardened with adaptive controls, retries, and safer fallbacks.
- Trade-A-Plane detail-capture expansion shipped: scraper now defaults to all-aircraft make sweeps (not single-piston only), parses listing-detail labeled specs + section blocks into structured fields (including twin engine/prop timing where present), and stores unmapped detail fields under `raw_data.tap_unmapped` for schema-safe maximum capture.
- Trade-A-Plane upsert hardening shipped for mixed DB constraints: bounded runs no longer trigger stale-inactive flips, unknown column payloads are folded into `raw_data` before writes, and `42P10` environments now fall back to `source_site/source_id` update-or-insert behavior.
- Trade-A-Plane avionics scraper scaffold added at `scraper/avionics_tap_scraper.py` with requests + Playwright fallback and JSON inventory export path (`scraper/data/avionics/inventory_extracts/trade_a_plane_avionics*.json`).
- ASO deep scraper restore/rebuild completed at `scraper/aso_scraper.py`: dynamic feed/group discovery, resilient ASP.NET paging, rich detail parsing (airframe/engines/props/APU/maintenance/comments/contact), raw section capture for unknown-field preservation, and slower humanized pacing defaults.
- ASO upsert compatibility hardening landed in the rebuilt scraper: conflict fallback prioritizes `source_site,source_listing_id`, unknown columns are auto-pruned per environment, and controlled live deep-write smoke passes succeeded after restore.
- ASO avionics extraction lane added via `scraper/avionics_aso_scraper.py`, which mines avionics sections from aircraft detail pages and emits normalized mentions to `scraper/data/avionics/inventory_extracts/aso_avionics_from_aircraft.json`.
- ASO restart-aware scheduling pass shipped: make/model coverage exports now publish to `scraper/state/aso_make_model_coverage_latest.{json,csv}`, scraper restart flags (`--only-new`, `--skip-recent-detail-days`) were added, and one-time next-week maintenance tasks were registered (`FullHangar_ASO_NewOnly_20260321`, `FullHangar_ASO_RecentAware_20260321`).
- ASO task automation extended for weekly continuity + error signaling: disabled recurring Saturday tasks (`FullHangar_ASO_NewOnly_Weekly`, `FullHangar_ASO_RecentAware_Weekly`) plus a one-time enabler (`FullHangar_ASO_EnableWeekly_20260321`) now switch to weekly after next-week runs, and ASO maintenance scripts now emit transcript logs under `scraper/logs/` plus alert entries (`scraper/logs/scheduled_task_alerts.log` and Application event entries via `eventcreate`) on failure.
- Scheduled-alert visibility now includes a daily digest task (`FullHangar_ScheduledTaskAlertDigest_Daily`) using `scripts/run-scheduled-task-alert-digest.ps1`, with desktop-notification fallback (`BurntToast` -> `msg`) and state tracking at `scraper/state/scheduled_task_alert_digest_state.json`.
- Additional sources integrated and iterated (AeroTrader, AFS, ASO, GlobalAir, AvBuyer, Barnstormers).
- AvBuyer coverage/performance hardening shipped in `scraper/avbuyer_scraper.py`: added `light` (LSA) + `military-classic-vintage` (warbird) category coverage, broadened make discovery beyond `?make=` links, improved detail-over-card field merge behavior (price/location/description/spec notes), expanded engine/prop overhaul extraction fallbacks (`SMOH/TSOH/SPOH` patterns), added non-USD fallback conversion to estimated USD (configurable via `AVBUYER_USD_RATES_JSON`) when detail-page USD switching is unavailable, and added `--new-only` monitor mode that inserts unseen IDs while still refreshing seen-state for existing rows.
- Non-aircraft detection/hide workflow implemented and operationalized.
- FAA enrichment + ownership-transfer feed + internal recent-sales wiring completed.
- FAA engine/registry uplift implemented and executed: `scraper/enrich_faa.py` now persists FAA engine model/manufacturer (`faa_engine_model`, `faa_engine_manufacturer`) and conservatively backfills `engine_model` only when missing/placeholder; `scraper/backfill_scores.py` now falls back to FAA engine model during scoring when listing engine model is blank. Latest matcher pass added relaxed N-number zero-variant candidates plus serial normalization/field fallback checks, followed by a full pending FAA sweep (`--limit 10000`, `matched=0`, `unmatched=81`) and checkpointed scoring recovery (`--resume-from-checkpoint --limit 800`), then a missing-only mop-up run (`attempted=117`, `updated=117`, `failed=0`) to clear null score fields. Current live metrics: `total_listings=8986`, `pending_faa_match_total=632`, `with_faa_engine_model=2587`, `missing_value_score=0`.
- Registration coverage + international-tail groundwork shipped: added shared parser (`scraper/registration_parser.py`), source-level registration audit/report outputs (`scraper/audit_registration_coverage.py`, `scraper/registration_coverage_latest.{json,md}`), shadow/promotion backfill tooling (`scraper/backfill_registration_fields.py`), source-quality KPI expansion for US-vs-non-US registration tracking, FAA enrichment guardrails for non-US registrations, and schema/view migrations for canonical registration fields (`registration_raw`, `registration_normalized`, `registration_scheme`, `registration_country_code`, `registration_confidence`).
- Targeted registration-refresh follow-up executed: `globalair` and `controller` remain challenge-gated (manual CAPTCHA still required per run), while `avbuyer` write-path conflict handling was corrected to align with DB uniqueness (`source_site,source_listing_id`) and a focused refresh completed (`Saved 4/60`) before regenerating the latest registration coverage snapshot.
- Registration quality stabilization pass executed post-refresh: registration backfill (`--apply --promote-n-number`) applied `3` row updates, FAA enrichment pass (`--limit 3000`) processed `946` pending rows (`matched=298`, `unmatched=110`), and bounded score backfill (`--limit 2500`) updated `4` rows; latest audit now reports `63.66%` N-number coverage and `73.76%` any-registration coverage with AvBuyer at `25.12%` N-number (`+0.16pp`).
- Controller extension v1 reliability upgrade landed (`browser-extension/*`): added mode selector (`card_only`/`detailed`), checkpoint-aware resume behavior, safe-profile humanized pacing delays, challenge/interstitial pause guards (instead of false empty-page exits), richer detail extraction action, and popup run-status visibility for paused/complete states.
- Unified extension resiliency/coverage pass shipped: added a GlobalAir category selector in popup/start payload, switched GlobalAir URL build path to selected category slug, and implemented source block cooldown auto-retry (`30m`) so challenge-hit lanes pause then resume from checkpoint instead of ending the source.
- Unified extension make-discovery expansion shipped: blank make inputs now trigger source-side make discovery for Controller/GlobalAir/TAP (`DISCOVER_*_MAKES`) so each selected lane can auto-build a full make queue (including category-scoped discovery for GlobalAir) before iterative scraping.
- GlobalAir category hardening from captured page corpus (`globalair_listing_Example4..13`) shipped: popup options now align with live canonical slugs (`single/twin-engine-piston`, `single/twin-engine-turbine`, `private-jet`, `helicopters`, `amphibian`, `commercial`, `experimental-kit`, `light-sport`, `vintage`, `warbird`) and background normalization maps legacy alias values to valid category routes.
- Unified extension category selectors expanded to all lanes: added Controller category selector (verified `CategorySlug` mapping with route IDs), TAP category selector (`Single/Multi Engine Piston`, `Turboprop`, `Jets`, `Piston/Turbine Helicopters`, `Gyroplane`), category-aware discovery URLs, and category-scoped make iteration routing for both Controller and TAP.
- TAP category-routing refinement shipped from captured TAP examples (`TAP_listing_Example11..16`): TAP now supports combined helicopter routing (`category_level1=Piston+Helicopters` + `category_level1=Turbine+Helicopters`), special filter-backed categories (`light_sport=t`, `warbird=t`, `amphibious=t`, `homebuilt=t`), make discovery now validates anchor URLs against active TAP category filters, and TAP pagination now uses `s-page` URLs for category-consistent paging.
- Unified extension multi-category + anti-bot hardening shipped (`browser-extension/*`): category controls are now multi-select checkboxes per source with backward-compatible scalar->array state migration, run-loop now iterates categories->makes->pages with checkpoint-safe category indexes, and Controller challenge handling was tightened via hybrid challenge detection, adaptive cooldown escalation, no-progress guards, and safer empty-page advancement criteria.
- Unified extension popup ergonomics + Controller threshold tuning follow-up shipped: popup width increased and category groups now render as two-column checkbox grids without internal scroll panes; Controller no-progress/empty-page guards were tuned to avoid premature exits on duplicate pages while still escaping genuine dead loops.
- Unified extension compact-layout pass shipped for popup height constraints: categories were rearranged into a single 3-column matrix (`TAP`/`GlobalAir`/`Controller`) with compressed labels and stacked controller-specific pairs, while diagnostics and source/make filters moved into collapsible panels so default popup view avoids horizontal/vertical scrollbars on typical extension window bounds.
- Popup top-section whitespace reduction follow-up shipped: title/bridge/mode/status/risk/KPI counters were consolidated into a single dense topbar row to reclaim vertical space and place the category matrix closer to the top of the popup viewport.
- Popup category matrix visual polish follow-up shipped: added subtle neutral gradient tinting across all rows (including non-banded categories) while retaining stronger color bands for priority grouped category families.
- New-only crawl mode shipped for unified extension + bridge: popup now exposes a `New-only details` run toggle, background state persists `detailNewOnly`, bridge adds batch `POST /exists` identity lookup, and detailed mode now checks page listings against DB so only DB-missing cards open detail pages while all rows still ingest/update.
- TAP anti-stall guard follow-up shipped: added per-make TAP result fingerprinting in extension run loop and auto-advance when page results repeat unchanged across multiple pages (`tap_stagnant_results`), preventing long hangs in a single category/make when TAP pagination returns duplicate card sets.
- GlobalAir category-list fallback shipped: when category pages expose listings but no make links, discovery no longer marks lane complete; it now falls back to a category-list sentinel and scrapes the category listing sheet directly (with `s-page` pagination URLs) so runs continue without make-filter dependency.
- Unified bridge timeout resilience pass shipped (`scraper/bridge_server_unified.py`): added transient Supabase retry/backoff for key read/upsert operations (522/timeout/5xx-class conditions), hardened `/ingest` to always return structured JSON errors on failure (with `retryable` + per-source error counts), and ensured bridge/session `errors`/`by_source` counters are incremented consistently when ingest fails mid-request.
- Unified multi-source extension shell landed (`browser-extension/*`): popup/background/content architecture now supports `controller` + `globalair` + `tap` in one extension, including source rotation mode (Controller → GlobalAir → TAP), preserved Controller workflow parity, new TAP full-detail content driver extraction, and a single bridge target (`localhost:8765`) for all sources.
- Controller detail-capture expansion landed: extension and scraper now parse grouped detail specs into structured JSON (`controller_specs_flat`, `controller_specs_groups`) plus normalized fields for condition/flight-rule/equipment/interior/exterior and twin powerplant timing (`engine_2_*`, `prop_2_*`), backed by migration `20260313000059_add_controller_detail_capture_fields.sql`.
- Bridge ingest schema-safe fallback shipped: unknown extension payload keys no longer block upserts and are preserved in `raw_data.bridge_unmapped` (with key list + timestamp/source), plus new unmapped-key audit outputs via `scraper/audit_bridge_unmapped_fields.py` (`scraper/bridge_unmapped_fields_latest.{json,md}`).
- Registration parser false-positive fix shipped: added `FIXED` to registration noise tokens (`scraper/registration_parser.py`), then reprocessed today’s controller rows to clear `FIXED` -> `F-IXED` misclassification (`rows_updated=1`, remaining bad rows `0`).
- Avionics Wave 1 source audit + local seed assets shipped (`scraper/avionics_source_research.md`, `scraper/AVIONICS_DATA_SOURCES_REPORT.md`, `scraper/avionics_catalog_seed.py`, and `scraper/data/avionics/avionics_master_catalog.json` with 165 units).
- Internal admin APIs added for data quality, platform stats, buyer intelligence, and invite management.
- Listing media resilience hardened (URL validation, gallery failover, proxy-safe placeholders, integrity audit tooling).
- AirPower engine-overhaul pricing backend scaffold shipped: added table migration `20260321000060_add_engine_overhaul_pricing.sql`, new scraper `scraper/airpower_engine_scraper.py` (Playwright category discovery + requests detail parsing with Chrome view-source reconstruction support), and pipeline wrapper `scripts/run-airpower-pipeline.ps1` (`npm run pipeline:airpower`).
- public_listings view gap closure migration applied (`20260320000066_add_missing_fields_to_public_listings_view.sql`): added accident/NTSB fields, FAA panel fields (`faa_owner`/`faa_status`/`faa_cert_date`/`faa_type_aircraft`), new scoring fields (`investment_score`, `market_opportunity_score`, `execution_score`, `pricing_confidence`, comp band fields), `deal_comparison_source`, and `manufacturer_tier`. `PUBLIC_LISTINGS_VIEW.md` updated to reflect new canonical view SQL.
- v1.9.3 score-distribution deploy ops: `scraper/validate_score_distribution_fix.py` hardened (module import order, `sys.path` for `core`, `scraper/.env`, column list matches live `aircraft_listings`). Save `scraper/score_distribution_audit_post_fix.txt` only **after** `backfill_scores.py --all --compute-comps` completes — mid-backfill audits skew the `intelligence_version` mix. `SCORE_DISTRIBUTION_FIX_RUNBOOK.md` checklist updated for vintage-heavy dry-run sample.

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
- Description parser time/hours acronym expansion shipped: added broader `SMOH`/`TSMOH`/`TSOH`/`TTSO`/`TSLOVH`/`TSLO`/`TMOH`/`TSO` (with `TSO-C*` exclusion), `SPOH`/`TSPOH`/`s/POH`/`s/PO`, `STOH`/`TSTOH`, `SFOH`, `TSN`/`TTSN`/`SNEW`, and `NDH` phrase variants plus phrase-first patterns. New `description_intelligence` fields now emitted: `stoh`, `sfoh`, `time_since_new`, `no_damage_history` (JSONB-only pending column migration decision). Full rerun completed (`backfill_description_intelligence --limit 50000 --apply`: `processed=10038`, `updated=3663`, `skipped_current=4155`; `backfill_scores --limit 12000`: `attempted=1054`, `updated=1054`, `failed=0`), and latest 90-day audit now reports `Engine SMOH 38.54%` baseline / `39.63%` combined (`+1.09pp`) and `Prop SPOH 21.10%` baseline / `21.46%` combined (`+0.36pp`) with `Prop Model 9.03%` baseline / `15.61%` combined (`+6.58pp`).
- Engine-value scoring prep landed in `core/intelligence/aircraft_intelligence.py`: added overhaul pricing lookup helpers + `score_engine_value()` output fields (`engine_hours_smoh`, `engine_remaining_value`, `engine_overrun_liability`, `engine_reserve_per_hour`) and bumped intelligence version to `1.9.0`, while keeping pricing lookup gated behind `FULL_HANGAR_ENABLE_ENGINE_VALUE_SCORING`.
- Engine-value lookup hardening follow-up shipped in `core/intelligence/aircraft_intelligence.py` (`v1.9.1`): pricing lookups now sanitize/validate engine-model candidates before querying (`_build_engine_lookup_candidates`), extract canonical tokens from noisy description-style strings (e.g., `... IO-540-AB1A5 ...`), and skip non-engine/noisy values (e.g., avionics-program text) to reduce pathological query stalls during broad backfills.
- Engine-value activation + coverage uplift follow-up shipped (`v1.9.2`): feature flag enabled in local envs, `public_listings` view migration `20260322000065_public_listings_engine_value_fields.sql` applied (`ev_*` columns), `score_engine_value()` now falls back to `engine_hours_smoh`, pricing lookup now retries with FAA engine model and supports family-estimated pricing when exact exchange rows are missing, and targeted backfill passes completed (`attempted=132`, `updated=132`, `failed=0`) with no null-score regression in `validate_scores.py`.
- Engine-value coverage uplift pass shipped in `scraper/backfill_scores.py` + pricing table follow-up: added stricter engine-model usability guards with FAA fallback preference during scoring resolution, seeded `engine_overhaul_pricing` coverage rows for high-impact missing families/models (`TSIO-550-K`, `IO-390-C3B6`, `IO-360`, `O-470` under source `coverage_seed`), and executed focused re-score passes; latest snapshot moved active SMOH coverage to `87/295` (`29.5%`, up from `53/295`).
- Engine-value turbine + parser cleanup follow-up shipped: `description_parser.sanitize_engine_model()` now rejects high-noise narrative tokens (`out/one/our/original/...`) and analyzer/autopilot leakage, `scraper/backfill_scores.py` junk-token guards were expanded, turbine-family coverage seeds were added under source `coverage_seed_turbine` (`PT6A-67P/67B/140/66D`, `PW545C/B`, `PW615F-A`, `FJ44-3A`), and another focused re-score pass lifted active SMOH coverage to `120/292` (`41.1%`) with pricing-missing rows reduced to `86`.
- Engine-value deterministic normalization pass shipped in `core/intelligence/aircraft_intelligence.py`: lookup candidate canonicalization now repairs common malformed tokens before TBO/pricing queries (`TI0/TSI0/I0/0-` -> `TIO/TSIO/IO/O-`, removes `SER/SERIES`, strips leaked manufacturer prefixes, and hyphen-normalizes prefix+digits+suffix forms), followed by another focused re-score run that lifted active SMOH coverage to `148/292` (`50.7%`) and reduced pricing-missing rows further to `61`.
- Engine-model parser malformed-token normalization follow-up shipped in `scraper/description_parser.py`: sanitizer now canonicalizes residual forms (`0-200` -> `O-200`, `IO 520` -> `IO-520`, `O&VO-360` -> `O-360`, compact `TSIO520NB` -> `TSIO-520NB`, plus `SER/SERIES` stripping and `TI0/TSI0/I0` OCR repairs) before scoring writes; focused re-score pass increased active SMOH engine-value coverage to `153/292` (`52.4%`) and lowered pricing-missing rows to `56`.
- Piston full-database engine-value sweep executed for Lycoming/Continental cohort: ran a dedicated cached engine-value-only backfill across all matched piston rows (`cohort=1179`), updating `276` rows and filling previously-null `engine_remaining_value` on `172` rows; current piston SMOH coverage is `803/983` (`81.69%`) with remaining misses concentrated in pricing-only gaps (`180`, led by `TSIO-360`, `O-540-*`, `O-320-*`, `CD-300`, `O-200`).
- Piston pricing expansion + full-lane rerun completed: added targeted piston family coverage seeds (`coverage_seed_piston2`) for `TSIO-360`, `O-540`, `O-320`, `O-200`, `IO-240`, and `CD-300`, then reran a piston-only missing-row engine-value pass (`updated=179`, `filled=84`); latest piston Lycoming/Continental cohort metrics are `cohort=1180`, `SMOH=965`, `engine_value=870` (`90.16%` SMOH coverage), with remaining misses now `95` and entirely pricing-driven.
- Piston identity canonicalization sweep completed (generic engine labels): targeted rows with non-specific piston engine text (`LYCOMING`/`CONTINENTAL`-style) were auto-promoted using FAA/parser fallbacks (`canonicalization_updates=7`, `FAA=1`, `parser=6`) and followed by a missing-row recompute pass (`updated=89`, `filled=4`); latest piston cohort snapshot now reports `cohort=1185`, `SMOH=920`, `engine_value=835` (`90.76%` SMOH coverage).
- Engine component-sales fallback hardening shipped in `core/intelligence/aircraft_intelligence.py`: `_get_component_sales_median()` now uses sanitized per-type model candidates (engine lane reuses `_build_engine_lookup_candidates`) and skips engine queries when no plausible engine token exists, preventing noisy long-text `aircraft_component_sales` `ilike` probes while preserving canonical-token matches.
- Backfill ingest-path engine cleanup shipped in `scraper/backfill_scores.py`: `listing_for_intelligence()` now sanitizes `engine_model`/`faa_engine_model` before scoring, parser-derived engine-model updates are sanitized before writeback, and scoring now prefers cleaned parser engine values when existing listing engine text is missing/noisy/overlong so canonical engine tokens propagate earlier in the pipeline.
- Targeted noisy-engine at-rest cleanup executed: rows matching `engine_model ILIKE '%HOURS SNEW%'` / `%PROGRAM TAP ADVANTAGE%` were reviewed and corrected with canonical candidates (`IO-540-AB1A5`, `IO-360-C1C6`, `TIO-540-AJ1A`, `IO-550-B39`, `FJ 44 SERIES`, etc.), followed by ID-scoped score backfill (`attempted=9`, `updated=9`, `failed=0`); residual noisy backlog reduced to `hours_snew=1`, `program_tap=0`.
- Engine TBO reference expansion shipped: migration `20260321000063_expand_engine_tbo_reference.sql` added extension/provenance/scoring columns, compatibility upsert constraint migration `20260321000064_engine_tbo_reference_upsert_constraints.sql` was applied, and `scraper/engine_tbo_seed_update.py` seeded/upserted 249 Continental/Lycoming rows with all verification spot checks passing.
- Score distribution fix implemented in `core/intelligence/aircraft_intelligence.py` (`v1.9.2` → `v1.9.3`): age-differentiated imputed defaults, widened risk tier bands (`LOW >= 78`, `HIGH 25-44`), days_on_market tiebreaker, `_components_measured` tracking, and hard-safety CRITICAL floor (`value_score <= 25`). Pre-deployment validation tooling at `scraper/validate_score_distribution_fix.py` and `scraper/audit_score_distribution.py`; deployment runbook at `SCORE_DISTRIBUTION_FIX_RUNBOOK.md`. Awaiting current backfill completion before deploying.

---

## Open Work (Lean Backlog)

Each item should stay one-line actionable with clear completion criteria.

### High Priority

- **Board hygiene:** keep this file concise and current after each substantial session.
- **BAS maintenance (biweekly):** stop continuous BAS crawling; run `npm run pipeline:avionics:bas:biweekly` once every other week and review only net-new candidates before catalog promotion.
- **Global collection focus (active):** prioritize `search-results-page?collection=avionics` via `npm run pipeline:avionics:global:collection` and keep matching/ingest stable as primary avionics-source workflow.
- **Source field fix queue execution (active):** run through `scraper/SOURCE_FIELD_FIX_QUEUE.md` source-by-source (Controller → ASO → TAP → AvBuyer → AeroTrader → GlobalAir → Barnstormers), with controlled smoke runs and DB delta checks after each source.
- **ASO deep crawl completion (active):** full-site ASO deep scrape is running with slow pacing (`scraper/aso_scraper.py --detail`); keep monitoring run health and finalize post-run coverage deltas + stale-row reconciliation.
- **TAP avionics access gate (active):** Trade-A-Plane avionics endpoints are challenge-gated (`geo.captcha-delivery`) in current environment; complete a human-solved browser session/cookie strategy before expecting automated avionics inventory extraction at scale.
- **Bridge unmapped-key promotion loop (active):** run `scraper/audit_bridge_unmapped_fields.py` after extension/scraper changes, promote high-frequency `raw_data.bridge_unmapped` keys into first-class columns, then clear the top queue on next migration pass.
- **Wave 2/3 rollout activation (active):** baseline coverage now exists for `piston_multi`, `turboprop`, `rotorcraft`, and `jet`; next step is segment-level threshold tuning and coverage uplift (especially low extraction coverage in rotorcraft/jet) before any score-impacting cutover.
- **Engine-value coverage follow-up (active):** remaining SMOH rows missing `engine_remaining_value` are now concentrated in unresolved turbine families (`PT6A-*`, `PW54x/PW61x`, `FJ44-*`) plus residual junk engine tokens (`Out/One/Our`); prioritize pricing-source expansion for turbine families and parser cleanup to suppress narrative-token leakage.
- **Engine-value coverage follow-up (active):** post-turbine seeding, remaining misses are now split between model-resolution gaps (`~83` rows resolving to `<none>`) and residual pricing gaps (`~86` rows with TBO but no pricing); next pass should promote FAA/parser canonical engine tokens for `<none>` rows and expand deterministic pricing coverage for high-frequency unresolved models.
- **Engine-value coverage follow-up (active):** latest split is model-resolution gaps (`~83` rows resolving to `<none>`) vs residual pricing gaps (`~61` rows with TBO but no pricing); next pass should prioritize parser/FAA promotion for `<none>` rows plus targeted pricing expansion for `JT15D`, `AS907`, `HTF7700`, and remaining `0-*/SERIES` variants.
- **Engine-value coverage follow-up (active):** latest split is still dominated by model-resolution gaps (`~83` rows resolving to `<none>`) with residual pricing gaps now down to `~56`; prioritize FAA/parser backfill for `<none>` rows and targeted pricing expansions for remaining turbine families (`JT15D`, `AS907`, `HTF7700`, `PT6A-42/52`).
- **Engine-value coverage follow-up (active):** piston lane now has strong model resolution (remaining misses are pricing-only); next pricing expansion should prioritize high-frequency piston families (`TSIO-360`, `O-540`, `O-320`, `O-200`, `IO-240`) while turbine expansion remains optional/deferred.
- **Engine-value coverage follow-up (active):** piston lane now sits at `90.16%` SMOH coverage and remaining misses are largely non-specific or noisy identities (`LYCOMING`, `CONTINENTAL`, `factory/diesel` strings, sparse AEIO/IO edge variants); next step is identity canonicalization/promotion (FAA + parser enrichment) for these residual generic tokens before additional pricing seeding.
- **Engine-value coverage follow-up (active):** piston lane now sits at `~90.8%` SMOH coverage; residual misses are mostly long-tail pricing gaps and sparse edge identities (e.g., AEIO/IO niche variants), so next pass should focus on targeted long-tail pricing rows rather than broad parser/model cleanup.
- **Avionics quality loop:** reduce top unresolved tokens from latest audit (`KX155`, `GFC500`, `GFC600`, `IFD440`, `GNX375`) and raise scoped extraction coverage for low-coverage sources (notably `aso` and `trade_a_plane`).
- **Avionics quality loop:** continue unresolved-token reduction on remaining leaderboard (`KX170B`, `KX165`, `STEC30`, `KFC200`, plus lingering Garmin peripheral IDs) and migrate more inventory to parser v`2.0.5` via rolling intelligence backfill.
- **Avionics quality loop:** finish micro-tail unresolved tokens (`KX170B`, `KX175B`, `GDU25`, `PMA150`) and review typo-like singles (`GTX650XI`, `GTX345RW`, `GTN335`, `GIA275`) before optional parser `v2.1.4` closeout.
- **Pending migration decision:** add `stoh`, `sfoh`, and `no_damage_history` columns to `aircraft_listings` and wire into `backfill_scores.py` write path (currently stored in `description_intelligence` JSONB only).
- **Score distribution deployment (ready):** after `backfill_scores.py --all --compute-comps` exits cleanly, run `npm run pipeline:score-dist:post-backfill` (or follow `SCORE_DISTRIBUTION_FIX_RUNBOOK.md` manually).

### Medium Priority

- **DS-4 Type Clubs:** complete research matrix + scrapeability report and wire any allowed scrapers.
- **DS-6 Bluebook Eval:** deliver integration plan with ROI recommendation.
- **DS-7 VREF Eval:** deliver integration plan and Bluebook-vs-VREF recommendation matrix.
- **DS-8 State Tax Data:** complete research and determine viable portals for normalized ingest.

### Low Priority / Future

- **DS-9 YouTube Prototype:** transcript-mining proof of concept and confidence-labeled report.
- **User-facing roadmap:** auth/saved searches, marketing home page, pre-buy export. Mobile polish: ✅ core pass complete — next: performance (ISR + image optimization).

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
3. **Engine value / `public_listings` `ev_*`:** apply order and verification notes are in `docs/ENGINE_VALUE_MIGRATIONS.md` (migrations `20260321000062`, `20260321000061`, `20260322000065` — skip any already on the remote).
4. Run:

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

# After full `backfill_scores.py --all --compute-comps` completes (see SCORE_DISTRIBUTION_FIX_RUNBOOK.md)
npm run pipeline:score-dist:post-backfill

# One-shot: full `--all --compute-comps`, then post-backfill, then git commit audit + related docs/scripts
npm run pipeline:score-dist:full-v193-and-commit

# Chunked full re-score (`--all` in `--limit` batches + one `compute-comps-only` at end); resume-safe via checkpoint
# Example: `npm run pipeline:backfill:all-chunked -- -ChunkSize 500 -FreshStart`
npm run pipeline:backfill:all-chunked
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
