# Full Hangar — Agent Status Board & Task Playbook

> **Every agent reads this first. Every agent updates this when done.**
> Last updated: March 7, 2026

This is the living project state. The `.cursor/rules/fullhangar.mdc` file has
the permanent project context. This file has what's happening RIGHT NOW — plus
detailed agent prompts for all upcoming tasks.

---

## ⚠️ Agent Ground Rules (Read Before Starting ANY Task)

- **Maximum 3 agents running simultaneously:** `FRONTEND`, `BACKEND`, and `MISC`.
- **FRONTEND** owns: `src/components/`, `src/pages/` (non-API), `src/app/` (non-API), `src/styles/`
- **BACKEND** owns: `scraper/*.py`, `src/pages/api/`, `src/app/api/`, `src/lib/db/`, `supabase/migrations/`
- **MISC** owns: `*.md` docs, config research, one-off scripts that don't touch active scraper/frontend code
- Agents must not modify files owned by another agent's active task without coordination noted here.
- After every task: update the ✅ Completed section, commit with `git add -A && git commit -m "feat: ..."`.
- **Python runtime:** always use `.venv312\Scripts\python.exe` — never `py`, `python`, or `py -m` directly.
- **Dev server:** runs on `localhost:3001` (port 3001, not 3000).
- **Project root:** `D:\Documents\$$Full Hangar\2.0\CursorReposity\full-hangar\`

---

## ⏸️ Currently Paused (Safe To Restart)

| Process | Command | Started | Notes |
|---------|---------|---------|-------|
| None | — | — | All active local terminal jobs were stopped for reboot safety. |
| Controller.com auth checkpoint | Manual login + CAPTCHA | Mar 3, 2026 | ✅ Ryan confirmed CAPTCHA is complete; backend agent can proceed with Controller-dependent scraping tasks. |

---

## ✅ Completed This Session

### Infrastructure
- [x] Documented canonical Supabase agent access interface in `AGENTS.md` (`createServerClient` / `createPrivilegedServerClient`, env precedence, and safety rules)
- [x] Next.js 16 + Turbopack running on localhost:3001
- [x] `npm run dev` now explicitly binds to port 3001 (`next dev -p 3001`) to avoid port drift to 3000
- [x] Added `restart-dev.ps1` + `npm run dev:restart` to auto-clear stale listeners on port 3001 before launch
- [x] Updated `start-dev-and-scrape.ps1` to launch `npm run dev:restart` for resilient frontend startup
- [x] Softened global site background from pure black to `#0D1117` for a less harsh dark theme while keeping orange-accent contrast
- [x] Migrated deprecated `middleware.ts` convention to `proxy.ts` for Next.js 16 compatibility
- [x] Applied UI softening pass 2: subtle background gradient depth, softer border/input tones on `/listings` and `/internal/deals`, and a glassy header tint
- [x] `/listings` now supports tile/row layout switching; row mode surfaces high-signal deal data in dense scan-friendly cards
- [x] Added inline info-tooltips (`i`) for Risk Level, Deal Rating, and Minimum Value Score filters
- [x] Completed detail-page micro-polish with softened panel/border/input tones aligned to updated dark theme
- [x] `/listings` control-bar upgrade: moved layout controls to right-column toolbar, added icon-based Tile/Row/Compact modes, added expanded Sort-By options, and compact `shown/filtered` counter
- [x] Standardized filter dropdown background/border tones in `/listings` sidebar
- [x] Enriched row/compact listing cards with denser at-a-glance buyer signals (deal tier/rating, market delta, TT, SMOH, deferred, avionics score/value, source, listing ID)
- [x] Added stronger color-coded buyer chips and reduced noise in row/compact cards: hide `MODERATE`, `N/A`, and `INSUFFICIENT DATA`; prioritize Tail #, TT, SMOH, Avionics
- [x] Added cross-layout deal-tier ribbons (green/blue/red), moved pricing emphasis to large green left-aligned value, and removed deferred chip noise (`Def $...`)
- [x] Removed `V 65.8` card display, standardized chip sizing in horizontal layouts, and added inline legend text for Tail/TT/SMOH/Av meanings
- [x] Improved `/listings` initial load perception: first-batch render (no full-dataset wait), 5-minute local cache reuse, and lazy/async card image loading
- [x] `/listings` Phase 2 perf refactor: server-driven paginated filtering/sorting via `GET /api/listings`, filter options endpoint `GET /api/listings/options`, and cache headers on both routes
- [x] Added timeout-safe listings query fallback in repository to prevent hard failures when Supabase view queries exceed statement time
- [x] Replaced top category pills with full-width evenly spaced banner menus; hover dropdowns now show make lists per category
- [x] Added right-side `Deals` banner menu with distinct styling and quick deal preset actions
- [x] Listing detail FAA enrichment upgrade: parse local FAA registry owner fields (owner/address/registration/status/mode S) plus engine/airworthiness details and surface them in FAA Snapshot + Airframe & Engine panels
- [x] Brand design system applied (Burn Orange, Century Gothic)
- [x] Full Hangar logo in header
- [x] Root layout fixed (was crashing due to `$$` in Windows path + Next.js 14 bug → upgraded to Next.js 16)
- [x] One-command parallel launcher (`start-dev-and-scrape.ps1`) to run webserver + scraper simultaneously
- [x] One-command post-scrape pipeline (`run-post-scrape-pipeline.ps1`) for scrape -> FAA enrich -> backfill -> market comps
- [x] Post-scrape pipeline now supports optional NTSB load stage (`-LoadNtsb`, `-NtsbDownload`)
- [x] Daily pipeline preset with timestamped logs (`run-daily-pipeline.ps1`)
- [x] Pipeline log KPI summarizer (`summarize-pipeline-log.ps1`) with daily auto-summary output
- [x] Full project architecture audit completed; `REFACTOR_PLAN.md` added with data flow map, file-by-file findings, and execution sequence
- [x] Data source expansion task pack imported (DS-1 through DS-9) into the Next Tasks queue
- [x] Supabase Cursor plugin authenticated via `/mcp_auth` and MCP access verified (`list_projects`, `list_tables`, and read-only `execute_sql` against `Full-Hangar`)
- [x] Task 8 baseline pass completed: added `PERFORMANCE_BASELINE.md` with Lighthouse before/after metrics and local audit notes
- [x] Added `PERFORMANCE_BUDGET.md` with merge-time thresholds (LCP, bundle size, API calls) and verification commands
- [x] Added `AVIONICS_EXPANSION_PLAN.md` with a parser-first avionics catalog strategy, conservative valuation policy (`P25`, `sample_count >= 3`), and OEM/MSRP-first override rules
- [x] Created `PUBLIC_LISTINGS_VIEW.md` with canonical view SQL, column inventory, migration checklist, and gap analysis
- [x] Verified live `public_listings` column set against `PUBLIC_LISTINGS_VIEW.md` (no column drift detected); documented runtime verification note and SQL-introspection fallback
- [x] Task 11 Phase 1 applied: migration `20260305000045_add_avionics_catalog_tables.sql` is live and `scraper/avionics_catalog_builder.py --segment piston_single --apply` seeded Supabase (`avionics_units=20`, `avionics_aliases=63`, `avionics_certifications=20`, `avionics_source_evidence=20`); added alias dedupe + `.env` loading in builder
- [x] Task 11 Phase 1 continued: migration `20260305000046_add_avionics_market_value_tables.sql` is live and `scraper/avionics_market_ingest.py --segment piston_single --apply` seeded valuation scaffolding (`avionics_market_values=20`, `avionics_bundle_rules=2`, `avionics_install_factors=4`) using conservative `P25` + `sample_count >= 3` policy defaults
- [x] Task 11 Phase 2 started: upgraded `scraper/description_parser.py` with `avionics_detailed` quantity extraction, unresolved token capture (`avionics_unresolved`), parser versioning, and GTN Xi/GTX alias coverage; updated `core/intelligence/avionics_intelligence.py` to consume enriched parser fields; parser test suite now 15/15 passing
- [x] Task 11 Phase 2 continued: migration `20260305000047_add_avionics_listing_observations.sql` is live and observation backfill applied (`processed_listings=199`, `rows=46`, `matched=40`, `unresolved=6`); current unresolved token set includes `gma340`, `gns430`, `gtx327`, `gtx3000`, `gtn750`, `ifd550` for next alias pass
- [x] Task 11 Phase 2 alias expansion pass: added parser + catalog + scoring coverage for `gma340`, `gns430`, `gtx327`, `gtx3000`, `ifd550`, and GTN-750 variants; re-seeded catalog (`avionics_units=25`, `avionics_aliases=78`), reran observation backfill (`processed_listings=199`, `rows=46`, `matched=45`, `unresolved=1`), and removed stale unresolved rows now covered by aliases (`unresolved_rows_total=0`)
- [x] Task 11 Phase 2 reporting loop: added `scraper/audit_avionics_coverage.py` + npm shortcut `pipeline:avionics:audit`, generated baseline reports (`scraper/avionics_coverage_audit_latest.json` + `.md`) showing 90-day coverage `matched_rows=45`, `unresolved_rows=0`, `matched_rate_pct=100.0`
- [x] Task 11 Phase 3 started: `core/intelligence/avionics_intelligence.py` now supports DB-backed unit valuation from `avionics_market_values` with policy order `OEM/MSRP -> P25 (sample_count>=3) -> static fallback`, including per-item source tags in `matched_items`; validated with `pytest scraper/tests/test_avionics_intelligence.py` (6/6) and dry-run backfill (`attempted=5, scored=5, failed=0`)
- [x] Task 11 Phase 3 continued: added migration `20260305000048_add_avionics_value_source_columns.sql` and wired persisted attribution fields (`avionics_value_source_breakdown`, `avionics_value_source_primary`, `avionics_market_sample_total`) through intelligence + backfill payloads; avionics tests now 7/7 passing and dry-run backfill remains clean (`attempted=5, scored=5, failed=0`)
- [x] Task 11 Phase 4/rollout continuation: completed source-attribution verification pass (clean backfill slice with no `missing column`/`400` warnings), captured current attribution mix (`market_p25=2`, `fallback_static=458`, `none=540`, `null=2890` of 3890), and expanded Wave 2 coverage by seeding `piston_multi` avionics catalog + valuation rows (`units=10`, `aliases=40`, `market_values=10`); avionics test suite remains green (7/7)
- [x] Task 11 Phase 4 alias loop: expanded parser/catalog coverage for unresolved tokens `GTN750` and `GTX345R` (parser v`2.0.1` + catalog alias seed), removed stale unresolved rows, reran observation backfill (`processed_listings=199`, `matched=45`, `unresolved=0`), and refreshed coverage audit (`observation_rows_total=55`, `matched_rate_pct=100.0`, `unresolved_rows=0`)
- [x] Task 11 Phase 4 valuation-depth pass: seeded conservative OEM/MSRP anchors in `scraper/avionics_market_ingest.py` and applied to both `piston_single` + `piston_multi` segments (`oem_seed_rows_total=27`; `piston_single=21`, `piston_multi=6`), then re-scored a clean slice (`attempted=100`, `failed=0`) improving listing attribution mix from `oem_msrp=0 / fallback_static=458` to `oem_msrp=33 / fallback_static=426`
- [x] Task 11 Phase 5 cutover hardening pass: added canonical capability units (`ADS-B In/Out`, `WAAS`, `Engine Monitor/JPI EDM`, `Stormscope`, `XM Weather`, `Synthetic Vision`, `ESP`, `TAWS-B`, `KX155`) plus OEM anchors, applied catalog + market ingest, and completed bounded production re-score with comps (`attempted=200`, `scored=200`, `failed=0`, `updated=200`) reducing `fallback_static` to `121` and lifting `oem_msrp` to `364` in current attribution snapshot; regression tests remain green (`24 passed`) and coverage audit is still `matched_rate_pct=100`, `unresolved_rows=0`
- [x] Tier 1 avionics attribution backfill runbook executed: captured baseline snapshot, confirmed parser coverage (`matched_rate_pct=100`, `unresolved_rows=0`), completed full-table avionics attribution refresh (`processed=4385`, `updated=4385`, `failed=0`) and logged before/after delta in `logs/avionics_backfill_tier1_20260306.md` (`null=3253 -> 0`, `oem_msrp=390 -> 1727`, `market_p25=1 -> 2`, `none=553 -> 2264`, `fallback_static=99 -> 392`)
- [x] Backfill reliability hardening: `scraper/backfill_scores.py` now uses cursor-paginated DB traversal for `--all`/missing-score modes (no first-page replay with `--limit`) plus configurable Supabase timeout controls (`SUPABASE_POSTGREST_TIMEOUT_SECONDS`, `SUPABASE_STORAGE_TIMEOUT_SECONDS`) and slow-row warning telemetry (`BACKFILL_ROW_SLOW_WARNING_SECONDS`)
- [x] Backfill long-run resilience pass: `core/intelligence/aircraft_intelligence.py` now creates Supabase clients with explicit timeout options and supports `FULL_HANGAR_DISABLE_LIVE_COMP_POOL`; `scraper/backfill_scores.py` now adds resumable checkpoints (`--resume-from-checkpoint`, `--checkpoint-file`), pricing lookup modes (`--pricing-snapshot-mode precomputed|full`), circuit-breaker fallback for slow comp lookups, and standalone comps stage (`--compute-comps-only`) to prevent single-row stalls from blocking full runs
- [x] Score validator intelligence-version fix: `scraper/validate_scores.py` now defaults to the live scorer version from `core/intelligence/aircraft_intelligence.py` (currently `1.8.0`) with optional `--intelligence-version` override for historical validation runs
- [x] Parser alias normalization pass: `scraper/description_parser.py` v`2.0.2` now recognizes compact avionics variants (`GTN650XI`, `GMA350`, `GTX330ES`) plus no-space ADS-B forms (`ADSBOUT`/`ADSB IN/OUT`), with test coverage expanded in `scraper/tests/test_description_parser.py` (18/18 passing) and bounded post-patch backfill validation run clean (`attempted=500`, `failed=0`)
- [x] Source-null enrichment fallback pass: `scraper/backfill_scores.py` now builds parser input from sparse-field fallbacks (`title`, `avionics_description`, `avionics_notes`, `make/model`) and injects freshly parsed `description_intelligence` into same-pass scoring; two consecutive bounded validation backfills stayed clean (`attempted=500`, `failed=0` each) and reduced the 1.7.0 `value_score=58.0` cluster (`500 -> 457 -> 434`, source-null subset `376 -> 338 -> 316`)
- [x] Hybrid scoring reset cutover (v`1.8.0`) completed: implemented calibrated hybrid score composition in `core/intelligence/aircraft_intelligence.py` (condition/market/execution blend + comp/deal/avionics-source adjustments + sparse-data fallback bands), added calibration-mix diagnostics to `scraper/backfill_scores.py`, and validated with clean bounded batches (`attempted=500`, `failed=0` twice) reducing `value_score=58.0` concentration from `426 -> 210` while preserving `value_score IS NULL=0`; full cutover completed with all 999 listings now on `intelligence_version=1.8.0`, comps recomputed (`computed_groups=30`), and final validator distribution recorded (`unique_scores=181`, most-common `51.70` at `28.6%`, risk mix `MODERATE=883/HIGH=87/CRITICAL=29`)
- [x] Added `HYBRID_CUTOVER_REPORT.md` documenting hybrid scoring reset execution details, before/after validation metrics, operational notes, and rollback command set for v`1.8.0`

### Frontend
- [x] Global navigation loading UX pass: added app-wide route-transition overlay with rotating brand icon (`app/components/NavigationLoadingProvider.tsx`) triggered on internal link clicks, mounted in root layout with suspense-safe query support, added App Router fallback loader (`app/loading.tsx`), and introduced shared overlay/spinner animation styling in `app/globals.css` with theme-aware backdrop handling.
- [x] Listings top-banner usability + taxonomy refresh: tightened dropdown close delay to `75ms`, added safer hover buffers to prevent accidental menu collapse, removed top-bar `Deal Rating` and `Value Score` dropdown buttons, and split `Turboprop` into `SE Turboprop` + `ME Turboprop` category buttons with dedicated make dropdown menus and server/client category filter wiring.
- [x] Turboprop split classifier tuning: refined SE/ME turboprop detection heuristics to reduce make-level false positives (notably broad Beechcraft spillover), expanded model keyword coverage (`Grand Caravan/208`, `Metroliner/Metro`, `441`), and aligned server-side category query OR filters with client-side menu classification.
- [x] Turboprop edge-case hardening pass: added jet-first category override (prevents `PC-24`/jet models from leaking into turboprop buckets) and added top-banner make-label normalization guards for fragmented source labels (`Grand`→`Cessna` when Caravan model context exists, `M-Class`→`Piper`, `King Air`→`Beechcraft`) so category dropdown menus stay clean and actionable.
- [x] Listings top-banner visibility parity pass: all category buttons now remain visible regardless of per-category count thresholds (including `SE Turboprop` and `ME Turboprop`) so category navigation stays predictable while dropdown menus still reflect live make availability.
- [x] Amphibian category precision pass: retained the `Amphibian` category and tightened detection/filtering rules to reduce false positives from broad `Sea` substring matches (moved to explicit seaplane/amphib/floats vocabulary plus known amphibian makes), and aligned server-side `SEA_OR` query with the stricter classifier.
- [x] Theme default update + residual light-mode parity pass: switched default site theme to `light` (while preserving manual toggle persistence), expanded global light-theme bridge coverage for additional legacy dark utility tokens (`#121923`, `#141c27`, `#162131`, `#161f2d`, `#121822`), and patched listing-detail/comps inline styling to use theme tokens so remaining dark-only sections render correctly in light mode.
- [x] Light-mode surface parity pass: added global light-theme overrides in `app/globals.css` for legacy hardcoded dark utility classes (`bg-[#1A1A1A]`, `bg-[#141922]`, `bg-[#161d28]`, dark borders, and white/muted text variants) so listings cards, filters, and toolbars render as true light surfaces when light mode is active.
- [x] Sitewide theme system pass: added persistent dark/light mode infrastructure (`ThemeProvider`, bootstrap script, header toggle), dual-logo switching by theme (`/branding/FullHangar.png` dark + `/branding/FullHangarLight.png` light), and CSS token overrides in `app/globals.css` so existing brand utility classes adapt to light mode while preserving dark as default on first load.
- [x] Branding asset restoration: added `public/branding/FullHangar.png` from the provided official logo so the new multi-source header loader can render the real brand mark in production without requiring external hosting.
- [x] Header-brand resilience upgrade: added `app/components/HeaderBrand.tsx` multi-source logo loader (`NEXT_PUBLIC_BRAND_LOGO_URL` -> `/branding/FullHangar.png` -> `/branding/FullHangar.svg`) with automatic text fallback so production branding survives missing-asset deploys while allowing instant logo restoration via env/file drop.
- [x] Production stability hotfix: restored listing detail comparable-chart data path by adding app-router endpoint `app/api/listings/[id]/comps/route.ts` (returns `{ target, comps, metadata }` with model-family/exact/category fallback logic), and replaced missing header image dependency with branded text-logo fallback in `app/layout.tsx` to avoid 404 logo regressions during deploys.
- [x] Fractional ownership UX expansion: added `/listings` Ownership Type filter (`all/full/fractional`), card-level fractional badges + `Share Price`/`Ownership` rows, and detail-page `Fractional Ownership` chip with explicit share-to-full-price breakdown; added migration `20260307000049_add_fractional_ownership_fields.sql` with first-class fractional columns and wired scraper/backfill write-through (`is_fractional_ownership`, share ratio/price, normalized full estimate, review flag, evidence JSON).
- [x] Fractional ownership pricing pass: `scraper/description_parser.py` v`2.0.3` now extracts explicit share terms (`1/10`, `10% ownership`, ordinal share wording) into `description_intelligence.pricing_context`; `scraper/tradaplane_scraper.py` now normalizes explicit fractional share prices to full-aircraft `asking_price`/`price_asking` while preserving raw share metadata and flagging ambiguous partnership-only copy for review; `scraper/backfill_scores.py` now supports targeted re-score selectors (`--id`, `--source-id`) and preserves existing fractional pricing metadata during parser refresh; `/listings/[id]` now displays a fractional-pricing context note beneath the title.
- [x] Listing detail parsing-utils extraction pass: moved seller-description parsing, description-intelligence parsing, engine-model/manufacturer normalization, avionics line extraction/merge, and avionics render helper from `app/listings/[id]/page.tsx` into `app/listings/[id]/components/detailParsingUtils.tsx`, keeping page behavior and data flow unchanged
- [x] Listing detail thin-shell follow-up: extracted remaining generic helper logic from `app/listings/[id]/page.tsx` into `app/listings/[id]/components/detailUtils.ts` (price-history normalization/stats/chart helpers, row parsing helpers, source/title/display utilities) with no API or UI behavior changes
- [x] Listing detail formatter consolidation pass: moved shared detail-page formatting helpers (`formatHours`, `formatIsoDate`, `formatCompTier`, `formatSeatsEngines`) from `app/listings/[id]/page.tsx` into `lib/listings/format.ts` to reduce inline duplication without changing UI behavior
- [x] Listings shared formatter pass: added `lib/listings/format.ts` companion utilities and switched `app/listings/ListingsClient.tsx` card-value formatting to shared helpers (`formatPriceOrCall`, `formatScore`) with no behavior/layout changes
- [x] Listings card extraction follow-up: moved remaining card rendering/spec-table JSX from `app/listings/ListingsClient.tsx` into `app/listings/components/ListingCard.tsx`, leaving `ListingsClient` focused on state/fetch/derivations
- [x] Listings client decomposition pass: extracted `app/listings/ListingsClient.tsx` UI sections into dedicated components (`ListingsTopBanner`, `ListingsFiltersSidebar`, `ListingsResultsToolbar`, `ListingsGridAndPagination`) while preserving existing filtering/sorting/data-fetch behavior
- [x] Component decomposition pass: extracted `/internal/deals` dashboard sections into dedicated components (`TopStatsRow`, `RecentSalesPanel`, `DealsControlsBar`, `DealsFiltersPanel`, `DealsTable`) and extracted `/listings/[id]` into column components (`LeftDetailColumn`, `RightDetailColumn`) with page-level data flow unchanged
- [x] `/listings` — browse page with card grid, value score badges, risk badges
- [x] `/listings/[id]` — detail page with structured data tables, score panel, image gallery
- [x] Category filter bar (Single Engine, Multi-Engine, Turboprop, Jet, Helicopter, LSP, Sea)
- [x] Image proxy at `/api/image-proxy` (bypasses Controller.com hotlink protection)
- [x] `/internal/deals` — private deal-finder dashboard with priority tab, watchlist, row expansion
- [x] Deal explanation panel in /internal/deals
- [x] Tab persistence (localStorage saves last active tab)
- [x] Deal alert API at `/api/deal-alerts`
- [x] Score colors: red→yellow-green→green progression
- [x] `/internal/login` + password auth middleware
- [x] Public listings now filter to active listings (`is_active = true`)
- [x] Public detail page "How We Scored This" section with data confidence + comp source tags
- [x] Price history panel on public detail page (latest/high/low, drops, change timeline)
- [x] Avionics detail panel on public detail page (detected equipment, STCs, upgrade potential note)
- [x] Price history trend chart on public detail page (sparkline + drop markers)
- [x] Fixed `/listings` fetch compatibility with current `public_listings` view
- [x] Added `/listings` safe-now UX filters (text search, max price quick picks, reset filters)
- [x] Restored detail page stability before migrations
- [x] Added resilient `/listings` image fallback: failed proxied images swap to branded placeholder
- [x] Source badges on `/listings` now map from `source`/`source_id`, open original listing URLs in new tab
- [x] Image proxy now allows known Trade-a-Plane CDN hosts
- [x] `/listings` images now attempt multiple candidates before falling back to placeholder
- [x] N-number coverage audit completed: DB currently 50/1311 (3.81%)
- [x] Trade-a-Plane scraper now extracts `n_number` from card/detail text
- [x] Backfill now infers `n_number` from existing listing text when missing
- [x] Fixed listing detail source CTA text to match actual source URL
- [x] Listing detail page now includes FAA Snapshot & Verification panel
- [x] Fixed detail page 500s on `/listings/[id]` caused by pending-view schema drift
- [x] `/listings` now supports client-side pagination controls with configurable page size (12/24/36/48)
- [x] `/listings` layout refactor: search at top, filters on left rail, grid + pagination on right
- [x] Global header now includes search input that routes to `/listings?q=...`
- [x] Listing detail query falls back to Supabase RPC (`get_faa_snapshot`) for live FAA fields
- [x] FAA enrichment script tolerates alternate FAA registry column names
- [x] FAA snapshot RPC normalized to index-friendly candidate matching
- [x] Fixed FAA snapshot fallback guard
- [x] Added serial-number FAA RPC fallback (`get_faa_snapshot_by_serial`)
- [x] Listing detail now parses Seller Description text as fallback to populate aircraft fields
- [x] Hardened `/listings` loader against intermittent Supabase statement timeouts
- [x] `/listings` timeout UX softened: renders loaded inventory without blocking red error banner
- [x] Performance pass: migrated `/listings` and `/listings/[id]` images to `next/image` with explicit dimensions/sizes (proxy URLs set `unoptimized` to avoid localPatterns query-string runtime errors)
- [x] Task 8 Phase 2: `/listings` now server-seeds initial listings + filter options from `listingsRepository` and skips the first client refetch (reduces initial waterfall)
- [x] `/listings` top category/deals banner buttons now use URL-linked, DB-backed filters (`category`/`dealTier`) for shareable views
- [x] Added combined top-deals mode (`TOP_DEALS` = Exceptional + Good) with Exceptional-first ordering plus stronger active-state contrast on top banner controls
- [x] Global header now shows live aircraft inventory counter (`X Listings!`) beside the logo from `aircraft_listings` DB count
- [x] Comparable chart now supports model-family comps by default (e.g., `172*` submodels together) with a submodel-only toggle button for exact-submodel comparisons
- [x] `/api/listings/options` now returns count metadata, and `/listings` filter dropdowns now display counts for Makes, Models, Sources, Deal Rating, and Minimum Value Score
- [x] `/listings` model filtering now uses model-family semantics (`modelFamily`) with a new dependent Sub Model filter (`subModel`) for exact variant narrowing after selecting a model family
- [x] Listings API now supports `modelFamily` + `subModel` query parameters and returns accurate filtered totals with exact-count mode for correct pagination/readout
- [x] `/listings` filter UX now supports draft selection + explicit Search apply flow (filters no longer auto-refresh results on every change)
- [x] Moved `Per Page` control to top toolbar, updated pagination readout to `Page X of Y`, and moved `Deal Rating` + `Value Score` controls into the top category banner order
- [x] Listings top banner cleanup: removed category/deals count suffixes, forced `Deals` button to render last, and made Make/Model/Submodel filter counts update live as selections change
- [x] Listings filters/top-bar polish: removed `State` filter UI and restyled top banner buttons (except `Deals`) to unified blue background with white text and yellow hover text
- [x] Image proxy host allowlist expanded for missing listing photos (`resources.globalair.com`, `cdn.avbuyer.com`, `media.sandhills.com`); verified Gulfstream `/listings?q=Gulfstream` primary images now return HTTP 200 through `/api/image-proxy`
- [x] Image proxy hardening pass: migrated from brittle exact-host list to safe host-suffix rules for all active scraper ecosystems (`controller.com`, `aerotrader.com`, `barnstormers.com`, `globalair.com`, `avbuyer.com`) plus exact CDN hosts (`dsgiipnwy1jd8.cloudfront.net`, `cdn-media.tilabs.io`, `media.sandhills.com`); added protocol guard and source-aware referer header
- [x] Comp & Cost chart target-marker reliability: target listing now always renders as a yellow point (`This Aircraft`) even when target price or Y-axis metric is missing by using transparent fallback anchors; tooltip now flags when estimated coordinates are used
- [x] Listings UI count cleanup: removed count suffixes from Filters (`Make`, `Model`, `Sub Model`, `Source`) and removed numeric count suffixes from top-bar dropdown menus
- [x] Listing detail `Score Summary` now uses an investment-style breakdown (Market, Condition, Execution), promotes `Investment score` as the primary score when available, and surfaces `Pricing Confidence` in-card
- [x] Scoring engine now uses a robust comp waterfall (exact submodel year-window → model family → make fallback), with comp-tier/universe metadata surfaced in listing detail `Score Summary`
- [x] Listings dropdown/search reliability pass: fixed `market_best`/`market_worst` sorting to use market delta (`vs_median_price`), enabled backend handling for `risk_low`/`risk_high`, split `Above Market` vs `Overpriced` deal menu options, added smarter query parsing for multi-term search (`Cessna 152`) and timeout-safe fallbacks so `/listings` and `/api/listings` return graceful responses instead of 500s under heavy query load
- [x] Listings search performance pass: added lightweight search-only query path in `lib/db/listingsRepository.ts` for header/search-bar traffic (`q`-only requests) with token-aware parsing and direct table lookup fallback, reducing timeout-prone broad view scans while preserving existing filtered-query behavior
- [x] Added Playwright smoke coverage for listings dropdown/search routes: new `tests/smoke/listings-smoke.spec.js` verifies key dropdown link URLs and core search API/page responses; wired `npm run test:smoke:listings` for quick regression checks

### Intelligence Engine
- [x] v1.0.0 — Engine TBO, prop TBO, LLP, deferred maintenance
- [x] v1.1.0 — FAA alert integration (DEREGISTERED/REVOKED/EXPIRED → risk override)
- [x] v1.2.0 — Data confidence scoring (HIGH/MEDIUM/LOW caps max score)
- [x] v1.3.0 — Avionics intelligence (keyword parsing, installed value, 15% weight)
- [x] v1.4.0 — Deal rating vs market comps + baseline fallback
- [x] v1.5.0 — STC modification detection + market premium (Penn Yan, Air Plains, STOL, etc.)
- [x] v1.7.0 — Added market-opportunity + execution + investment scoring layers with pricing-confidence adjustment for top-down deal prioritization
- [x] v1.8.0 — Hybrid scoring reset: calibrated blend of condition/market/execution with sparse-data fallback bands and calibration-path diagnostics to reduce score clustering while preserving safety overrides

### Data Pipeline
- [x] Added strict non-aircraft audit + hide workflow: new `scraper/audit_non_aircraft_listings.py` emits `scraper/non_aircraft_review_latest.json` for manual verification, `scraper/hide_listings_by_id.py` supports dry-run/apply `is_active` hides from explicit approved IDs, and npm aliases were added (`pipeline:audit:non-aircraft`, `pipeline:hide:non-aircraft:dry`, `pipeline:hide:non-aircraft:apply`); initial strict audit currently flags 20 candidates including target `source_id=5016588051` (wanted ads, appraisal ads, tow-bar equipment, and placeholder liner rows)
- [x] Controller.com scraper (Playwright, all makes)
- [x] Trade-a-Plane scraper — dry run verified (5 Cessna listings, correct source IDs)
- [x] AeroTrader scraper integration: added `scraper/aerotrader_scraper.py` as primary implementation, aligned to canonical schema/upsert conventions, and converted `scraper/scraper.py` into a compatibility wrapper
- [x] AeroTrader pagination-loop safety: added repeated-page-signature detection and 3x consecutive `0/0` page guard in `scraper/aerotrader_scraper.py` to prevent long no-op runs during slow resume scrapes
- [x] AeroTrader new-only mode: added `--new-only` existing-ID filtering and configurable `--max-consecutive-zero-save-pages` to skip already-captured listings and stop long no-yield tails faster
- [x] AircraftForSale integration: added `scraper/afs_scraper.py` aligned to canonical schema/upsert conventions and switched `scraper/scraper.py` compatibility wrapper to AFS as primary
- [x] AircraftForSale pipeline wiring: added `scripts/run-afs-pipeline.ps1`, added npm aliases (`pipeline:afs`, `pipeline:afs:dry`, `pipeline:afs:preview`, `pipeline:post-scrape:afs`), and enabled `afs` in `start-dev-and-scrape.ps1`
- [x] ASO integration: added `scraper/aso_scraper.py` using canonical schema/upsert/fingerprint conventions, switched `scraper/scraper.py` compatibility wrapper to ASO as primary, and wired `scripts/run-aso-pipeline.ps1` plus npm/pipeline aliases (`pipeline:aso`, `pipeline:aso:dry`, `pipeline:aso:preview`, `pipeline:post-scrape:aso`, `dev:scrape:aso`)
- [x] ASO reliability pass: restored Supabase compatibility by adding missing `aircraft_listings` columns (`description_intelligence`, `manufacturer_tier`), added scraper schema preflight + optional `--allow-schema-downgrade`, and verified strict full run success (`parsed=150`, `saved=150`, `marked_inactive=0`)
- [x] Fixed `backfill_scores.py --compute-comps` call signature drift by passing sold + FAA transfer datasets into `build_comps_payload`, restoring one-pass backfill+comps behavior
- [x] Added weekly ASO automation script `scripts/run-aso-weekly.ps1` with slow-stage pauses and Cursor-visible status output in `ASO_WEEKLY_STATUS.md`; scheduled Windows task `FullHangar_ASO_WeeklySlow` for Sundays at 3:15 AM
- [x] Added live heartbeat status file `ASO_WEEKLY_STATUS_LIVE.md` that updates during each weekly run (stage start/end, running state, and failure notes) for in-Cursor progress visibility
- [x] ASO delta-efficiency pass: added unchanged listing write-skip with `last_seen` refresh, configurable `--detail-stale-days`, and configurable `--inactive-after-missed-runs` (weekly automation now defaults to 2 stale days and 3 missed runs before inactive)
- [x] Delta helper foundation added in `scraper/scraper_base.py` (`fetch_existing_state`, `should_skip_detail`, unchanged `last_seen` refresh, missed-run inactive marker), and template migration applied to `scraper/globalair_scraper.py` with new CLI flags `--detail-stale-days` + `--inactive-after-missed-runs`
- [x] Delta helper migration extended to `scraper/afs_scraper.py` with shared stale-detail skipping, unchanged write-skip/refresh, and configurable inactive threshold flags
- [x] ASO media extraction upgrade: scraper now captures `image_urls` candidates from detail pages (up to 30) and keeps `primary_image_url` synced to first valid gallery image when available
- [x] Added `scraper/aso_media_backfill.py` for resume-safe gallery backfill on already-captured ASO listings (default missing-only mode, optional full-refresh mode) plus npm helpers `pipeline:aso:media` and `pipeline:aso:media:dry`
- [x] Added periodic ASO media-maintenance automation: `scripts/run-aso-media-refresh.ps1` + `scripts/register-aso-media-refresh-task.ps1`, Cursor-visible status files (`ASO_MEDIA_REFRESH_STATUS.md`, `ASO_MEDIA_REFRESH_LIVE.md`, `ASO_MEDIA_REFRESH_HISTORY.md`), and npm aliases (`pipeline:aso:media:refresh`, `pipeline:aso:media:refresh:preview`, `pipeline:aso:media:schedule`)
- [x] Added optional Playwright fallback to `scraper/aso_media_backfill.py` for no-gallery edge cases and wired scheduled media refresh to run with `-PlaywrightFallback` (current ASO image coverage: primary 150/150, gallery 147/150)
- [x] Added deep raw-HTML/script image extractor mode to `scraper/aso_media_backfill.py` (`--deep-extractor`) to parse embedded/escaped image URLs before Playwright fallback; stubborn ASO no-gallery IDs currently remain `aso_189664`, `aso_190231`, `aso_199472`
- [x] Listing media coverage + targeted refresh foundation: added `scraper/report_listing_media_coverage.py` (overall/per-source no-image/at-least-one/more-than-one metrics + candidate exports under `scraper/state/media_refresh`), added npm commands (`pipeline:media:coverage`, `pipeline:media:re-audit`, source refresh shortcuts), added targeted `--media-refresh-only` mode to Trade-A-Plane/Controller/AeroTrader/Barnstormers, and upgraded GlobalAir/AvBuyer/AFS detail parsing to persist gallery `image_urls`; validation batches run (`trade_a_plane updated=5`, `controller updated=0`, `barnstormers updated=0`, `aerotrader blocked by repeated 403`) with active-scope coverage unchanged baseline→post (`overall no_picture=0.20%`, `>=1 image=99.80%`, `>1 image=33.43%`; `aerotrader >1 image=68.23%`, `aso >1 image=96.67%`, `avbuyer >1 image=0.00%`)
- [x] AvBuyer targeted media-refresh mode + live pass: added `--media-refresh-only`, `--source-ids-file`, and `--refresh-limit` to `scraper/avbuyer_scraper.py` (using `media_refresh_utils` candidate loading/update path), then executed a targeted refresh against `scraper/state/media_refresh/avbuyer/single_image_only.txt` with Playwright; bounded run processed first 100 IDs (`improved=100`, `updated=100`, `failed=0`) and lifted active AvBuyer `>1 image` coverage from `24.80%` to `40.82%` (`158 -> 260` of `637`)
- [x] GlobalAir integration: aligned `scraper/globalair_scraper.py` to canonical schema/env/upsert/fingerprint/description-intelligence conventions, switched `scraper/scraper.py` compatibility wrapper to GlobalAir as primary, and wired `scripts/run-globalair-pipeline.ps1` plus npm/pipeline aliases (`pipeline:globalair`, `pipeline:globalair:dry`, `pipeline:globalair:preview`, `pipeline:post-scrape:globalair`, `dev:scrape:globalair`)
- [x] AvBuyer migration pass: aligned `scraper/avbuyer_scraper.py` to shared scraper conventions (`env_check`, `schema`, `scraper_base`, `description_parser`, manufacturer normalization/tiering), added delta-safe upsert/inactive handling + smoke-test CLI controls, added focused targeting (`--model` text filter + `--target-url` direct mode + direct-make fallback), and wired pipeline runner `scripts/run-avbuyer-pipeline.ps1` with npm aliases (`pipeline:avbuyer`, `pipeline:avbuyer:dry`, `pipeline:avbuyer:preview`) after validating twin-piston smoke runs
- [x] AvBuyer controlled live validation: ran narrow write scope (`twin-piston`, `Cessna`, model `340A`, 1 page) with successful DB ingest (`saved 6/6`), limited FAA enrichment, and limited backfill/comps; fixed two runtime blockers found during live test (`get_supabase` shadowing + mixed-key bulk upsert payloads)
- [x] AvBuyer wider controlled live pass: executed two additional bounded write runs (`twin-piston` Cessna up to 2 pages, then Piper up to 2 pages) with successful ingest (`saved 10/10` + `11/11`), then completed limited FAA enrichment (`limit=80`) and limited backfill/comps (`limit=80`) with clean scoring update results
- [x] AvBuyer Beechcraft expansion: executed bounded live write run (`twin-piston` Beechcraft up to 2 pages) with successful ingest (`saved 5/5`), followed by limited FAA enrichment (`limit=60`) and limited backfill/comps (`limit=60`) with no scoring failures
- [x] AvBuyer phased expansion pass: completed sequence `1→2→3→4` with resume-safe category rollout (twin-piston maintenance pass, added `Diamond`/`Tecnam`/`Vulcanair`, expanded `single-piston`/`turboprops`/`helicopter` plus direct-target `jets` subcategories), then ran stepwise FAA/backfill validation (`enrich_faa --limit 250`, `backfill_scores --compute-comps --limit 250`) with clean scoring (`250/250`, `failed=0`) and updated AvBuyer inventory to `319` rows
- [x] AvBuyer currency hardening pass: updated `scraper/avbuyer_scraper.py` to enforce USD-only storage (`asking_price`/`price_asking`) via currency-aware parsing plus Playwright dropdown conversion (`#currency-dropdown -> USD`) when listings render in local currency; corrected target listing `ab_372946` to `$259,063` and remediated additional flagged piston outliers (`ab_373592: 3,300,000 -> 198,816`, `ab_372638: 2,100,000 -> 126,519`), with reusable audit reports in `scraper/price_outliers_latest.json` and `scraper/avbuyer_price_remediation_latest.json`
- [x] DS-1 kickoff: Barnstormers selector audit documented (`scraper/barnstormers_selectors.md`)
- [x] DS-1 kickoff: Barnstormers scraper implemented (`scraper/barnstormers_scraper.py`) with requests-first + Playwright fallback
- [x] DS-1 kickoff: Barnstormers pipeline script wired (`scripts/run-barnstormers-pipeline.ps1`) + npm alias (`pipeline:barnstormers`)
- [x] Barnstormers dry-run validation: 5 listings parsed from Single-Engine category with description intelligence + image extraction
- [x] Trade-a-Plane diagnostics (`scraper/diagnose_tradaplane_prices.py`)
- [x] Trade-a-Plane scraper backfills missing prices even when fingerprints unchanged
- [x] Trade-a-Plane upsert gracefully falls back when ON CONFLICT constraint unavailable
- [x] Trade-a-Plane bulk upsert normalizes payload keys and retries single-row fallback on `42P10`
- [x] Trade-a-Plane upsert mirrors `price_asking` into `asking_price`
- [x] Focused validation: Beechcraft (5/5), Cessna (10/10) — clean upsert + backfill
- [x] Full TAP refresh: 767 rows (Cessna 452, Piper 312, Unknown 3)
- [x] Backfill from JSON: attempted=767, scored=767, updated=767, failed=0 (post-fix)
- [x] Controller scraper upsert hardened to match TAP behavior
- [x] Controller scraper migration pass: integrated category-based URL mode (`--category`), improved card parsing using confirmed selectors (`list-listing-title-link`, `price-contain`, `location-span`, `specs-container`), fixed title-year regex parsing bug, and added smoke-test fast path (`--no-detail`) plus migration tracker `scraper/CONTROLLER_MIGRATION_PROGRESS.md`
- [x] Controller scraper validation pass: added interactive CAPTCHA resume mode (`--captcha-resume prompt`) and CDP browser attach (`--cdp-url http://localhost:9222`) for authenticated-session reuse; improved no-detail card location extraction and filtered non-listing media assets from detail gallery extraction
- [x] Resumable scrape checkpoints (`--resume`) + page-level upserts for both scrapers
- [x] Listing media: full image gallery capture, logbook link extraction, fingerprint skip
- [x] Listing lifecycle tracking: `is_active`/`inactive_date` + `listing_observations` daily history
- [x] FAA enrichment (faa_registry + faa_aircraft_ref + faa_engine_ref + faa_deregistered)
- [x] Backfill scores pipeline (`backfill_scores.py`) with auto-drop missing columns + retry
- [x] Backfill can optionally recompute market comps (`--compute-comps`)
- [x] Days-on-market tracking (`first_seen_date`, `last_seen_date`, `days_on_market`)
- [x] Price reduction tracking (`price_reduced`, `price_reduction_amount`)
- [x] Baseline aircraft values table seeded (Cessna 150/152/172, Piper Cherokee/Warrior, Beechcraft, Grumman)
- [x] Deal comparison source tracking (live comps vs estimated baseline vs insufficient data)
- [x] STC reference table migration ready (`20260301000018`)
- [x] NTSB loader implemented: `avall.zip` endpoint with `.mdb` ingestion via ODBC — 30,726 rows upserted
- [x] Market comps live run: scanned=999, computed_groups=64, upserted=64
- [x] Full DB re-score: attempted=1000, scored=1000, failed=0, updated=1000
- [x] Trade-a-Plane detail parsing now captures richer per-listing content into `description_full`
- [x] FAA/NTSB enrichment rerun: pending=288, matched=3, unmatched=285, deregistered_flagged=0
- [x] Fixed JSON backfill price syncing bug (`--from-json` mirrors both price fields correctly)
- [x] Re-verified full Trade-a-Plane backfill: attempted=1256, scored=1256, failed=0, updated=1256
- [x] Task 2 foundation started: shared scraper modules (`env_check.py`, `schema.py`, `scraper_base.py`) integrated into Trade-a-Plane + Controller scrapers
- [x] Task 2 API/repository foundation: added `lib/db/listingsRepository.ts`, refactored `/api/deal-alerts` to repository, added `/api/listings/[id]/full`
- [x] Task 9A backend progress: added `/api/listings/[id]/comps` endpoint with same-model/year-window comparables and make+category fallback
- [x] Task 5 progress: added deterministic `scraper/description_parser.py` with extraction helpers + confidence score and integrated `description_intelligence` enrichment into scraper upsert paths
- [x] Task 5 tests: added `scraper/tests/test_description_parser.py` with 10 parser cases (all passing)
- [x] Description parser refinement: added engine-model sanitization plus maintenance extraction (`cylinders_since_new_hours`, `hours_since_iran`, `last_annual_inspection`), and wired Trade-A-Plane/Controller upserts to prefer cleaned parser-derived engine models when raw specs are overlong
- [x] Backfill enrichment pass: `scraper/backfill_scores.py` now re-parses description text during DB re-score runs to refresh `description_intelligence` and backfill/clean `engine_model`, `total_time_airframe`, and `engine_time_since_overhaul` when missing or noisy
- [x] Added reusable enrichment audit utility `scraper/audit_engine_enrichment.py` (full-table pagination + JSON summary + noisy `engine_model` examples) for repeatable post-backfill quality checks
- [x] Internal deal-finder upgrade: `/internal/deals` now supports saved sort modes + quick filter presets for flip, motivated sellers, and call/reduction follow-up
- [x] API performance hardening: added response timing logs + cache headers to `/api/deal-alerts`, `/api/listings/[id]/full`, and `/api/listings/[id]/comps`
- [x] Task 4 progress: added `scraper/adaptive_rate.py` with history-driven delay/batch sizing from `scraper_sessions`
- [x] Task 4 progress: Trade-a-Plane scraper now supports `--max-listings`, `--session-budget-minutes`, `--retry-failed`, and failed URL capture in `scraper/failed_urls_tap.json`
- [x] Task 4 progress: Trade-a-Plane scraper now records run summaries to `scraper_sessions` (attempted/succeeded/errors/delay settings)
- [x] Task 4 progress: added shared manufacturer interleave utility (`build_interleaved_queue`) and per-session make-order randomization to reduce scrape patterns
- [x] DS-1 live run: Barnstormers scraper upserted 5 listings (`source_site=barnstormers`) after schema-safe field filtering
- [x] DS-1 follow-up: FAA enrichment rerun completed (`matched=11, unmatched=9`) and scoring backfill updated 15 rows
- [x] DS-1 pipeline fix: `run-barnstormers-pipeline.ps1` now uses supported `backfill_scores.py --limit 200`
- [x] Barnstormers migration hardening: imported external seed scraper for selector/reference parity, removed payload field stripping in upsert path, added make normalization + manufacturer tier mapping, tightened TT/SMOH extraction from labeled patterns, and added npm smoke commands (`pipeline:barnstormers:dry`, `pipeline:barnstormers:smoke`)
- [x] Barnstormers live validation pass: fixed `.env` loading in scraper startup and verified bounded write run (`Single Engine Piston`, `limit=10`) with `parsed=10`, `saved=10`; latest-row quality check shows `primary_image_url=5/10`, `image_urls=5/10`, `total_time_airframe=5/10`, `engine_time_since_overhaul=3/10`, `description_intelligence=10/10`
- [x] Barnstormers image-quality hardening: expanded detail-page listing-image selectors to page-level `/media/listing_images/` scan, filtered banner/logo assets from image candidates, and revalidated bounded run (`parsed=10`, `saved=10`) with latest-10 image quality check showing `bad_logo_or_banner=0` and `good_listing_images=5`
- [x] Barnstormers title-parsing hardening: extract year from non-leading title positions, strip lead marketing tokens before make detection, and resolve make/model using known manufacturer list; bounded revalidation (`parsed=10`, `saved=10`) confirms `bad_make=0` on latest-10 sample and correct parse for `CLEAN 1989 SCHWEIZER 269C`
- [x] Barnstormers engine-model cleanup: added detail-text model extraction + noisy-model suppression for `description_intelligence.engine.model` and `engine_model`; bounded revalidation (`parsed=10`, `saved=10`) shows `engine_model_present=6` with `bad_present=0` on latest-10 sample
- [x] Barnstormers aircraft-type normalization: added category-to-canonical type mapping plus regex-based cross-category overrides and an upsert-stage normalization gate; bounded revalidation (`parsed=10`, `saved=10`) completed with stable writes
- [x] Barnstormers model-string cleanup: added model tail sanitization for sales/marketing suffixes (`READY TO SHIP`, `FRESH ANNUAL`, etc.), integrated in title parsing, and revalidated bounded run (`parsed=10`, `saved=10`) with latest-10 `noisy_model_suffixes=0`
- [x] Barnstormers make-casing polish: refined acronym handling so true acronyms (`PZL`, `OMF`) are preserved while standard makes stay normalized (`Robin`), and revalidated bounded run (`parsed=10`, `saved=10`)
- [x] Barnstormers numeric-title/model cleanup: fixed numeric-leading title parsing (`46 TCRAFT ...`) and removed trailing numeric time fragments (`... SMOH/SPOH/TT`) from model strings; bounded revalidation (`parsed=10`, `saved=10`) shows latest-10 `numeric_make_values=0` and `numeric_model_noise=0`
- [x] Barnstormers make-alias normalization: added `Taylorcraft` aliases (`Tcraft`, `T-Craft`) in shared config and validated bounded run (`parsed=10`, `saved=10`) with normalized row `46 TCRAFT ... -> make=Taylorcraft`
- [x] DS-2 foundation: added `scraper/ebay_selectors.md`, `scraper/ebay_sold_scraper.py`, sold-transactions migration, and market-comps eBay blend hook
- [x] Task 3 backend scoring alignment: NTSB destroyed-history now caps `value_score` at 20 and forces `CRITICAL`; substantial damage now forces `HIGH`; no-history note added to `score_explanation`
- [x] DS-2 report hardening: `scraper/ebay_sold_scraper.py` now supports `--report-from-db`, auto-loads `scraper/.env`, and writes non-empty fallback sections for low-sample report output
- [x] DS-2 live run: applied Supabase migrations `20260304000037` + `20260304000038`, ingested first eBay sold rows into `aircraft_sold_transactions` (aircraft-category filtered), and recomputed market comps (`sold_rows=2`)
- [x] DS-2 expansion foundation: added grouped eBay search-term sets (`AIRCRAFT` / `ENGINES` / `AVIONICS` / `COMPONENTS`), component scrape mode, and `scraper/ebay_component_market_report.md`
- [x] DS-3 foundation: added migration `20260304000040_add_detected_ownership_changes.sql`, `scraper/faa_registry_monitor.py`, `scripts/run-faa-monitor.ps1`, and npm script `pipeline:faa-monitor`
- [x] DS-2 tuning pass: aircraft-mode breadcrumb classification now uses breadcrumb-only category parsing (reduces toy/parts bleed), broader live ingest rerun completed, and reports regenerated from DB (`aircraft_rows=2`, `component_rows=0`)
- [x] Applied Supabase migrations `20260304000039_add_aircraft_component_sales.sql` and `20260304000040_add_detected_ownership_changes.sql`; market comps recomputed successfully (`sold_rows=2`, `transfer_rows=0`)
- [x] DS-2 targeted category run: eBay aircraft-mode now issues `_sacat`-constrained searches (63676/63677/63678/63679/63680/26428-aware routing), live ingest added 1 new sold aircraft row (`sold_rows=3`), and comps/reports were regenerated
- [x] DS-2 components tuning: component-mode now uses mode-aware search exclusions and engine terms sort by highest price (`_sop=16`) while avionics/components retain default sold sorting
- [x] DS-2 components live run: expanded avionics term set (G1000/G500/G600/G3X/GDU/IFD/GFC), ingested component rows into `aircraft_component_sales` (`engine=1`, `avionics=2`), and regenerated DB-backed eBay reports (`component_rows=3`)
- [x] DS-2 deep-scan preset: added `--component-deep-scan` (expanded engine/avionics query set, 80-term budget default in components mode) and `scraper/ebay_top_component_comps.md` quick-review table output
- [x] DS-2 deep-scan live run: components mode deep scan upserted 25 new rows; DB snapshot now `component_rows=36` with `engine=3` and `avionics=9` (top prices: engine $19,250; avionics $11,980)
- [x] DS-2 focused component mode: added `--component-type all|engine|avionics` to run targeted scans by value stream; smoke-tested engine-only and avionics-only runs
- [x] DS-3 integration pass: added `/api/internal/recent-sales`, repository support for ownership-change joins, and a new “Recently Sold Aircraft (FAA Ownership Transfers)” panel on `/internal/deals`
- [x] DS-3 reliability pass: FAA monitor is now offline-first by default (`pipeline:faa-monitor` uses local zip), with optional monthly online refresh and manual zip-path support (`scraper/FAA_MANUAL_DOWNLOAD.md`)
- [x] DS-3 internal feed fix: `/api/internal/recent-sales` now uses a privileged server-side Supabase client so ownership-change rows are visible in the dashboard (verified count: 3)
- [x] Task 10 progress: expanded `scraper/config.py` with tiered manufacturer lists + alias normalization helpers, added `--tier` support to Trade-a-Plane and Controller scrapers, and added `scraper/backfill_tiers.py` + migration `20260304000041_add_manufacturer_tier.sql`
- [x] Task 3 frontend wiring: listing detail FAA panel now shows all accident-history states (green no-history, red accident summary + NTSB link, gray unavailable when N-number is missing)
- [x] Deprecated Controller alert-ingestion path removed by policy: deleted setup docs, parser/test artifacts, scheduler XML, wrapper script, and related npm commands
- [x] Task 11 cutover stabilization: added transient Supabase 500 retry handling in `scraper/backfill_scores.py`, produced `AVIONICS_CUTOVER_REPORT.md`, and archived clean bounded production rerun log `logs/avionics_cutover_backfill_retry_20260305_221710.log` (`attempted=200`, `scored=200`, `failed=0`, `updated=200`)
- [x] Task 10 reliability tests: added `scraper/tests/test_scraper_config.py` covering alias normalization, tier resolution, tier selection, and invalid tier handling (4 passing tests)
- [x] Task 9B frontend progress: added dynamic comps visualization on listing detail via `app/components/CompsChart.tsx` + `app/listings/[id]/CompsChartPanel.tsx` (desktop scatter by price vs TT/SMOH, mobile value-score bar fallback, API-backed stats line)
- [x] Listing detail UI polish: merged `Cost Analysis` + `Comparable Market Intelligence` into a single top-right `Comp & Cost` card; estimate range is light green with median shown beneath in white
- [x] DS-2 deal-finder signals pass: added component-gap intelligence (`normalized_engine_value`, `estimated_component_value`, `component_gap_value`) + flip trigger logic and exposed signals in `/internal/deals` via `/api/internal/deal-signals`
- [x] Listing detail comps UX polish: restored `Comp & Cost` chart visibility for small comp sets and upgraded point hover to a compact listing snapshot (image, location, price, TT/SMOH metric, DOM, risk, deal tier, quick link)
- [x] Listing detail completeness pass: `Aircraft Details` now falls back to FAA registry serial values, and `Airframe & Engine` now backfills `Engine Manufacturer` from FAA engine reference (`eng_mfr_name`) or parsed engine model when FAA detail is missing
- [x] Listings-to-detail state persistence: detail links now include a `returnTo` query preserving active `/listings` filters (make/model/source/risk/price/page/sort), and `Back to listings` now restores that exact filtered view
- [x] Listings card UX revamp across tile/row/compact layouts: removed color-coded chip/ribbon styling and replaced with table-style key facts focused on buyer-critical fields (price, TT, SMOH, engine model, tail, DOM, deal metrics, source, listing ID)
- [x] Listings table consistency pass: all three selectable layouts now render a single unified key-value table in the same order with `N-Number` first and explicit `N/A` fallbacks for missing fields
- [x] Listing detail avionics extraction pass: `Airframe & Engine` now renders a full bullet list from Seller Description + parsed intelligence + matched avionics (no truncation), and avionics valuation now reads `description_full` with expanded Garmin-suite equipment pricing aliases
- [x] Listing detail avionics readability pass: preserve rich multi-line avionics/equipment text (including `Additional Equipment`) in `Airframe & Engine`, avoid noisy canonical duplicates when rich source text is present, and expanded parser/intelligence mappings for Garmin G2000-era components (GMA/GTC/GTX/GTS/GIA/GSR/GDU/GEA/GRS/GDC/GMU/GCU/GFC/GMC/GDL, TAWS-B, SVT, ESP)
- [x] Comps chart completeness pass: added `Price vs Time` / `Price vs Year` toggle, surfaced a `price-known but missing time fields` comparison lane, excluded zero-price points from scatter plot, and added explicit plotted-vs-excluded diagnostics
- [x] Listing detail engine-data cleanup pass: `Engine Model` rendering now trims narrative spillover and uses `description_intelligence` fallbacks; page now surfaces parsed maintenance context (`Cylinders Since New`, `Hours Since IRAN`, `Last Annual`) and stronger TT extraction from seller text

### Database
- [x] faa_registry (310,196 rows), faa_aircraft_ref, faa_engine_ref, faa_deregistered loaded
- [x] engine_tbo_reference (110+ rows), propeller_tbo_reference (41 rows), life_limited_parts (35+)
- [x] aircraft_listings table with all intelligence columns
- [x] public_listings view
- [x] Schema-alignment migrations through `20260302000034`
- [x] `get_faa_snapshot` RPC migration (`20260302000033`)

---

## 🟡 Pending — Migrations to Apply in Supabase

Apply in order in Supabase SQL Editor:

```
supabase/migrations/20260301000018_stc_reference.sql
supabase/migrations/20260301000019_baseline_values.sql
supabase/migrations/20260301000020_add_deal_comparison_source_to_public_listings_view.sql  ⚠️ VIEW CHANGE — update PUBLIC_LISTINGS_VIEW.md after applying
supabase/migrations/20260302000024_add_listing_media_and_fingerprint_columns.sql
supabase/migrations/20260302000025_add_media_fields_to_public_listings_view.sql  ⚠️ VIEW CHANGE — update PUBLIC_LISTINGS_VIEW.md after applying
supabase/migrations/20260302000026_add_listing_observations_and_active_tracking.sql
supabase/migrations/20260302000027_add_public_listing_observations_view.sql
supabase/migrations/20260302000028_add_avionics_detail_columns.sql
supabase/migrations/20260302000029_align_backfill_upsert_columns.sql
supabase/migrations/20260302000032_align_backfill_db_query_columns.sql
supabase/migrations/20260302000033_add_faa_snapshot_rpc.sql
supabase/migrations/20260302000034_align_remaining_avionics_columns.sql
supabase/migrations/20260304000035_add_description_intelligence.sql
supabase/migrations/20260304000036_add_scraper_sessions.sql
supabase/migrations/20260304000041_add_manufacturer_tier.sql
supabase/migrations/20260304000042_add_component_gap_signals.sql
supabase/migrations/20260305000043_add_investment_scoring_columns.sql
supabase/migrations/20260305000044_add_comp_selection_metadata_columns.sql
supabase/migrations/20260305000045_add_avionics_catalog_tables.sql
supabase/migrations/20260305000046_add_avionics_market_value_tables.sql
supabase/migrations/20260305000047_add_avionics_listing_observations.sql
supabase/migrations/20260305000048_add_avionics_value_source_columns.sql
supabase/migrations/20260307000049_add_fractional_ownership_fields.sql
```

Note: `20260302000029` intentionally overlaps with `20260302000028` for idempotent schema healing. Running both is safe.

After applying:
```bash
.venv312\Scripts\python.exe scraper\backfill_scores.py
```

---

## 🟡 Next Tasks — Ordered by Priority

> Task 1 is complete (`REFACTOR_PLAN.md`). Execute tasks in order from Task 2 onward unless explicitly noted.

---

### TASK 1: Full Project Architecture Audit & Refactor Plan
**Status: ✅ Completed**
**Deliverable:** `REFACTOR_PLAN.md` in project root
**Completed on:** March 3, 2026
**Notes:** Includes executive summary, ASCII data-flow diagram, file-by-file findings, proposed structure, shared modules, DB/API/frontend refactor notes, and implementation sequence.

---

### TASK 2: Backend Refactor Implementation
**Priority: 🔴 HIGH — Complete after Task 1**
**Agent: BACKEND**

```
Read REFACTOR_PLAN.md fully before writing a single line of code. Follow its Implementation 
Sequence exactly. Do not skip steps.

For every change: (1) read current file, (2) understand all callers, (3) make the change,
(4) update callers, (5) run a dry-run to verify nothing broke, (6) add a header comment 
with date + 1-line summary of what changed.

SPECIFIC THINGS TO IMPLEMENT (plus anything additional from REFACTOR_PLAN.md):

A) Shared scraper base:
   Create scraper/scraper_base.py containing logic shared between tradaplane_scraper.py and 
   controller_scraper.py: rate limiting, retry with exponential backoff + jitter, Supabase 
   upsert patterns (including the 42P10 fallback), session logging, listing schema validation.
   Both scrapers must import from scraper_base — no duplication.

B) Centralized config:
   Create scraper/config.py with: per-site rate limit defaults, manufacturer lists by tier 
   (see Task 10), scoring weights, TBO fallbacks, cost estimates.
   Replace all hardcoded lists and magic numbers throughout the codebase with config imports.

C) Canonical listing schema:
   Define one TypedDict in scraper/schema.py and a matching TypeScript interface in 
   src/types/listing.ts. Every scraper outputs this shape. Every API route expects it.
   Add: validate_listing(raw_dict) → (valid_dict, list[str]) to schema.py.
   Call validate_listing() before every Supabase upsert.

D) API route data access layer:
   Create src/lib/db/listingsRepository.ts with: getListings(filters), getListingById(id),
   getComparableListings(make, model, maxPrice), getListingWithFaaSnapshot(id).
   All Next.js API routes must call these functions — no raw Supabase queries in route files.
   Route shape: parse params → call repo → return { data, error } with proper HTTP codes.

E) Environment variable validation:
   Create scraper/env_check.py — validates all required vars at startup, raises a clear 
   EnvironmentError with the missing var name if any are absent.
   Call env_check() at the very top of both scrapers before any other work.

After all changes:
  .venv312\Scripts\python.exe scraper\tradaplane_scraper.py --make Cessna --limit 3 --dry-run
  .venv312\Scripts\python.exe scraper\controller_scraper.py --make Cessna --limit 3 --dry-run
  Verify frontend loads at localhost:3001 with no console errors.
  Document any new migrations needed in MIGRATION_NOTES.md.
```

---

### TASK 3: NTSB Integration — Remaining Steps
**Priority: 🔴 HIGH — Loader done; scoring + UI wiring not yet done**
**Agent: BACKEND (steps 1–4) + FRONTEND (step 5)**

`load_ntsb.py` is complete and 30,726 rows are in the DB. These steps connect that data to the scoring engine and the listing detail page.

```
STEP 1 — Apply NTSB table migration (if 20260301000021 doesn't exist, create it):
  CREATE TABLE IF NOT EXISTS ntsb_accidents (
    id SERIAL PRIMARY KEY,
    n_number TEXT,
    event_date DATE,
    location TEXT,
    injury_level TEXT,
    aircraft_damage TEXT,
    weather_condition TEXT,
    phase_of_flight TEXT,
    probable_cause TEXT,
    event_id TEXT UNIQUE
  );
  CREATE INDEX IF NOT EXISTS idx_ntsb_n_number ON ntsb_accidents(n_number);

STEP 2 — Add accident columns to aircraft_listings (migration 20260301000022 if missing):
  ALTER TABLE aircraft_listings
    ADD COLUMN IF NOT EXISTS accident_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS most_recent_accident_date DATE,
    ADD COLUMN IF NOT EXISTS most_severe_damage TEXT,
    ADD COLUMN IF NOT EXISTS has_accident_history BOOLEAN DEFAULT FALSE;

STEP 3 — Update enrich_faa.py:
  After FAA registry match, also query ntsb_accidents WHERE n_number = matched n_number.
  Populate: accident_count, most_recent_accident_date, most_severe_damage, has_accident_history.

STEP 4 — Update aircraft_intelligence.py scoring:
  aircraft_damage = 'DESTROYED' → force risk_level = CRITICAL, cap value_score at 20
  aircraft_damage = 'SUBSTANTIAL' → deduct 15 points, set risk_level = HIGH
  1–2 minor incidents → deduct 5 points, add note to score_explanation
  No history → add "✓ No NTSB accident history on record" to score_explanation

STEP 5 — Update listing detail page (FRONTEND agent):
  In the FAA Snapshot & Verification panel, add an Accident History row:
  - No accidents: green "✓ No NTSB Accidents on Record"
  - Accidents found: red "⚠ N Accident(s) Found — Most Recent: [date], Damage: [level]"
  - N-number unavailable: gray "Accident history unavailable (no N-number matched)"
  Link the badge to NTSB's public search for that N-number when available.

Run after completing:
  .venv312\Scripts\python.exe scraper\enrich_faa.py --verbose --limit 20
  .venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps
```

---

### TASK 4: Trade-A-Plane Adaptive Scraping
**Priority: 🟠 HIGH — Complete after Task 2**
**Agent: BACKEND**

```
The Trade-A-Plane scraper hits errors after scraping quickly. Build a self-learning rate limiter 
that gets smarter with every run by reading from its own historical session data.

A) SCRAPE SESSION LOGGING:
   New Supabase table: scraper_sessions
   Columns: id (uuid), site (text), started_at (timestamptz), ended_at (timestamptz),
   listings_attempted (int), listings_succeeded (int), first_error_at_listing (int),
   error_type (text), avg_delay_ms (int), batch_size (int), session_notes (text)
   Insert a row at the end of every scrape run.

B) ADAPTIVE RATE LIMITER — Create scraper/adaptive_rate.py, class AdaptiveRateLimiter:
   On init, query the last 10 scraper_sessions for this site.
   - safe_batch_size = floor(avg(first_error_at_listing) * 0.7)
   - safe_delay_ms: last session had errors → +25%; no errors → -10% (floor 1500ms, ceiling 8000ms)
   Methods:
     wait() — sleep safe_delay_ms + random jitter ±20%
     should_pause() → True every safe_batch_size listings (triggers 30–120s break, logged)
     get_recommended_settings() → dict for logging
   On 429 or CAPTCHA response: increase delay 50% immediately + log to scraper_sessions.
   Integrate into tradaplane_scraper.py's detail-page fetch loop.

C) MANUFACTURER ROTATION (Pattern Disruption):
   Instead of all pages of Make A then all of Make B, interleave:
   Queue: [Cessna p1, Piper p1, Beechcraft p1, Cessna p2, Piper p2, ...]
   Shuffle manufacturer order randomly each session.
   New function in scraper_base.py: build_interleaved_queue(makes, max_pages) → list[ScrapeTask]
   ScrapeTask = dataclass(make, page_number, url)

D) SESSION CONTROLS:
   --max-listings N          stop after N listings
   --session-budget-minutes N    auto-stop after N minutes
   Skip detail fetch if URL already in DB and scraped within last 48 hours.

E) FAILURE RECOVERY:
   Wrap every detail page fetch in try/except.
   On failure: log URL to scraper/failed_urls_tap.json, continue (do NOT crash).
   End of session: "X succeeded, Y failed (see failed_urls_tap.json)"
   --retry-failed mode: reads failed_urls_tap.json and retries only those URLs.

Verify with:
  .venv312\Scripts\python.exe scraper\tradaplane_scraper.py --make Cessna --limit 5 --dry-run
  Confirm adaptive rate limiter logs settings and session is recorded in Supabase.
```

---

### TASK 5: Listing Description Intelligence Parser
**Priority: 🟠 HIGH**
**Agent: BACKEND**

```
Aircraft listing descriptions contain rich structured data we currently discard. Build a 
deterministic parser (regex + keyword matching — no external AI library) to extract it.

Example input:
  "1978 Beechcraft A36 TN, Whirlwind III Turbo-Normalized IO-550, 420 SRAM Overhaul, 5400 TT,
  Garmin 650/750, G-5, Aspen, S-TEC 3100, Tip Tanks, 1546 Useful Load"

Example desired output:
  { "engine": {"model": "IO-550", "smoh": 420, "tt": 5400},
    "mods": ["Whirlwind System III Turbo Normalizing", "Tip Tanks"],
    "avionics": ["Garmin GNS 650", "Garmin GTN 750", "Aspen EFD1000", "S-TEC 3100 DFCS", "G5 EFIS"],
    "useful_load_lbs": 1546, "oxygen": true, "confidence": 0.85 }

CREATE: scraper/description_parser.py

IMPLEMENT:

1. extract_times(text) → dict
   "TTAF: 2450" / "2450 TT" / "2,450 total time" → { "total_time": 2450 }
   "420 SMOH" / "420 SRAM" / "420 since major" → { "engine_smoh": 420 }
   "350 SPOH" / "350 since prop overhaul" → { "prop_spoh": 350 }
   "120 since top" / "120 STOP" → { "engine_stop": 120 }
   Handle commas in numbers. All values as integers.

2. extract_avionics(text) → list[str]
   Build AVIONICS_MAP dict at top of file mapping abbreviations to canonical names:
   "GTN 750" / "Garmin 750" → "Garmin GTN 750"
   "GNS 430W" → "Garmin GNS 430W"
   "G1000" → "Garmin G1000"
   "Aspen" / "Aspen EFD" → "Aspen EFD1000"
   "ADS-B" / "ADSB Out" → "ADS-B Out"
   "S-TEC 55X" / "STEC 55" → "S-TEC 55X Autopilot"
   "KAP 140" → "Bendix/King KAP 140"
   Return deduplicated canonical names.

3. extract_mods_and_stcs(text) → list[str]
   "Osborne tip tanks" / "tip tanks" → "Tip Tanks"
   "RAM conversion" → "RAM Engine Conversion"
   "Turbo normalized" / "TN" (context) → "Turbo Normalizing"
   "Robertson STOL" → "Robertson STOL Kit"
   "Horton STOL" → "Horton STOL Kit"
   "Speed brakes" → "Speed Brakes"
   "Knots 2U" → "Knots 2U Speed Mods"

4. extract_useful_load(text) → int | None
   "1546 useful load" / "useful load: 1546" / "UL 1546" → 1546

5. extract_fuel_capacity(text) → int | None
   "114 gal usable" / "total fuel 114" → 114

6. extract_special_equipment(text) → dict
   "oxygen" / "O2" / "TAT" → { "oxygen_system": true }
   "TKS" / "boots" / "de-ice" → { "known_ice": true }
   "A/C" / "air conditioning" → { "air_conditioning": true }

7. parse_description(text) → dict
   Master function calling all above, merged result + confidence score (0.0–1.0).

INTEGRATION:
   Call parse_description() on description + description_full fields after each scrape.
   Store as JSONB: ALTER TABLE aircraft_listings ADD COLUMN IF NOT EXISTS description_intelligence JSONB;
   Cross-check: if parser finds engine_smoh and DB engine_smoh is NULL, backfill from parser.

TESTING:
   Create scraper/tests/test_description_parser.py with at least 10 test cases using real 
   listing description snippets.
   Run: .venv312\Scripts\python.exe -m pytest scraper\tests\test_description_parser.py -v
   All tests must pass before marking this task complete.
```

---

### TASK 6: Controller.com — Deprecated Alert Pipeline
**Status: ❌ Removed by policy**
**Note:** This ingestion path is intentionally deprecated and removed from this repository.

---

### TASK 7: Controller.com — Browser-Assisted Historical Scraping (CDP)
**Priority: 🟡 MEDIUM — For historical backfill**
**Agent: BACKEND**

```
Use Ryan's existing authenticated browser session via Chrome DevTools Protocol for Controller.com
listing capture without relying on inbox-based workflows.

CREATE: CONTROLLER_CDP_SETUP.md (instructions for Ryan):
  Launch Brave with remote debugging BEFORE running the script:
    "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --remote-debugging-port=9222
  Browse controller.com normally for 2–3 minutes to establish session cookies.
  Then run the script — it attaches to the existing window.

CREATE: scraper/controller_scraper_cdp.py

BROWSER ATTACHMENT:
  from playwright.sync_api import sync_playwright
  with sync_playwright() as p:
      browser = p.chromium.connect_over_cdp("http://localhost:9222")
      context = browser.contexts[0]   # existing cookies intact
      page = context.new_page()

SCRAPING BEHAVIOR:
  Use build_interleaved_queue() from scraper_base.py (Task 2/4).
  Delay between requests: random.uniform(3.5, 8.0) seconds.
  1-in-5 chance of a brief scroll or pause before continuing.

SMART STOP CONDITIONS — stop and log prominently if:
  - CAPTCHA detected ("cf-challenge" in page content or URL redirects to /cdn-cgi/)
  - Response time >10s for 3 consecutive requests
  - 5 consecutive pages return 0 listings
  On stop: save progress to scraper/controller_cdp_progress.json for --resume.

DATA EXTRACTION:
  Reuse parsing patterns from controller_scraper.py, adapted for detail page HTML.
  Call parse_description() from Task 5 on full description text.
  Upsert with source = "controller_cdp"

CLI:
  .venv312\Scripts\python.exe scraper\controller_scraper_cdp.py --makes Cessna Piper --max-listings 100
  .venv312\Scripts\python.exe scraper\controller_scraper_cdp.py --resume
  .venv312\Scripts\python.exe scraper\controller_scraper_cdp.py --dry-run
```

---

### TASK 8: Frontend Performance Audit & Optimization
**Priority: 🟠 HIGH — Can run in parallel with Tasks 4–7**
**Agent: FRONTEND**

```
The site loads slowly on first visit. Measure, fix, and establish a Performance Budget that 
all future frontend decisions will be evaluated against.

STEP 1 — BASELINE AUDIT (read-only first):
  npx next build && npx next start
  Chrome DevTools → Lighthouse → Performance on:
    /listings
    /listings/[id] (real listing ID from Supabase)
    /internal/deals
  
  Record BEFORE metrics: LCP, FCP, Total Blocking Time, CLS, JS bundle size, request count.
  Save as PERFORMANCE_BASELINE.md in project root.

STEP 2 — FIND ALL ISSUES:
  a) Images: are listing photos using next/image with proper dimensions + loading="lazy"?
     Are proxied images served full-resolution when thumbnails would suffice?
  b) Data fetching: any useEffect API calls that could be getServerSideProps or RSC?
  c) Bundle size: npx @next/bundle-analyzer — identify large dependencies
  d) Fonts: is Century Gothic causing render-blocking?
  e) Re-renders: are listing cards re-rendering on every filter change (missing React.memo,
     unstable references)?
  f) API route speed: add timing logs — any slow Supabase queries?

STEP 3 — IMPLEMENT FIXES in priority order:

  HIGH IMPACT:
  1. Convert all listing images to next/image with explicit dimensions.
     First visible card: priority={true}. All others: priority={false}
  2. Move /listings data fetching to getServerSideProps (no useEffect waterfall on load)
  3. Add Suspense boundaries around listing grid — shell loads instantly, cards stream in
  4. Verify DOM never renders more than 24 cards at once (pagination already exists)

  MEDIUM IMPACT:
  5. Dynamic import heavy components with next/dynamic ssr:false
  6. Add Cache-Control: s-maxage=60 to listing list API routes
  7. Memoize expensive filter/sort operations with useMemo
  8. Consolidate /listings/[id] API calls into single /api/listings/[id]/full endpoint

  POLISH:
  9. Skeleton loading states matching card dimensions (prevents CLS)
  10. Preload fonts in _document.tsx with <link rel="preload">

STEP 4 — PERFORMANCE BUDGET DOCUMENT:
  Create PERFORMANCE_BUDGET.md:
    Max LCP: 2.5 seconds
    Max JS bundle (main chunk, gzipped): 200 KB
    Max initial API calls on page load: 2
    Rule: every new listing card component must be reviewed against these budgets before merge.

Re-run Lighthouse after changes. Document Before/After in PERFORMANCE_BASELINE.md.
```

---

### TASK 9: Comparative Market Intelligence (Comps Chart)
**Priority: 🟡 MEDIUM — market_comps table exists with 64 groups; now surface it visually**
**Agent: FRONTEND (chart) + BACKEND (API endpoint)**

#### Sub-Task 9A — Backend: Comparables API Endpoint
**Agent: BACKEND**

```
CREATE: src/pages/api/listings/[id]/comps.ts

QUERY LOGIC:
  1. Fetch target listing by ID (need: make, model, year, price, total_time_hours, engine_smoh)
  2. Find comps: same make + model + within 10 model years, minimum 3, maximum 20
     Fallback: same make + same category if fewer than 5 results
  3. Return each comp: { id, title, price, year, make, model, total_time_hours, engine_smoh,
     value_score, risk_level, listing_url, source, days_on_market }
  4. Also return target listing under "target" key in same shape
  5. Return metadata: { comp_count, search_criteria_used,
     price_range: {min, max, median}, time_range: {min_tt, max_tt, median_tt} }
  
  If target has no price: still return comps. Chart renders them; target dot is simply omitted.
  
  Add indexes if missing:
    CREATE INDEX IF NOT EXISTS idx_listings_make_model ON aircraft_listings(make, model);
    CREATE INDEX IF NOT EXISTS idx_listings_year ON aircraft_listings(year);
```

#### Sub-Task 9B — Frontend: Comps Scatter Chart Component
**Agent: FRONTEND**

```
READ FIRST: PERFORMANCE_BUDGET.md — this chart must be dynamically imported.

CREATE: src/components/CompsChart.tsx using Recharts (already in project).

CHART:
  X-axis: Price (USD), auto-scaled, formatted "$25K" / "$50K" etc.
  Y-axis: Total Time (hours) or Engine SMOH if richer data available

  Data points:
  - Comp listings: gray dots (○), size proportional to value_score
  - Target listing: Burn Orange (#AF4D27) filled dot (●) labeled "This Aircraft"
  - No price on target: dashed horizontal line at target's Y value, "This Aircraft (price TBD)"

  Tooltip on hover: Year Make Model, Price, Total Time, colored risk badge, "View Listing" link
  
  Stats bar below chart:
  "Comparing against 14 similar aircraft · Price range $28K–$115K · Median $67K"

INTEGRATION on listing detail page:
  const CompsChart = dynamic(() => import('../components/CompsChart'), { ssr: false })
  Skeleton placeholder ~280px while loading.
  If fewer than 3 comps: "Not enough comparable listings yet. Check back as our database grows."

RESPONSIVE:
  Desktop: scatter plot, full width
  Mobile (<640px): horizontal bar chart ranked by value score (scatter is unreadable on mobile)

BRAND COLORS:
  Target dot: #AF4D27 (Burn Orange)
  Comp dots: #999999
  Hover highlight: #FF9900 (Light Orange)
  Grid lines: #F0F0F0
```

#### Sub-Task 9C — Frontend: Price vs Value Score Mode
**Agent: FRONTEND**

```
Add a third chart mode in the listing-detail comps panel:
 - Price vs Time (existing)
 - Price vs Year (existing)
 - Price vs Value Score (new)

REQUIREMENTS:
 1. Plot all comps that have a valid price and value_score even when TT/SMOH is missing.
 2. Keep the existing plotted-vs-excluded diagnostics and include missing value_score counts.
 3. Preserve the "price-known comps missing time fields" lane for Time mode so data-quality gaps remain visible.
 4. Reuse current brand colors and tooltip styling for consistency.

SUCCESS CRITERIA:
 - Listings with sparse time fields still get a meaningful visual comparison via Value Score.
 - User can switch modes without refetching data.
 - Diagnostics clearly explain what is and is not plotted in each mode.
```

---

### TASK 10: Expand Manufacturer Scraping Scope
**Priority: 🟢 LOW-MEDIUM — After Task 4 is stable**
**Agent: BACKEND**

```
Expand manufacturer lists in config.py (Task 2) to cover all viable makes on Trade-A-Plane.
Organize by tier so Ryan can run fast Tier-1-only scrapes daily and full scrapes periodically.

UPDATE config.py:

TIER_1_HIGH_VALUE = [
  "Cessna", "Piper", "Beechcraft", "Cirrus", "Mooney", "Diamond",
  "Grumman/American General", "Commander", "Socata", "Columbia"
]

TIER_2_MEDIUM_VALUE = [
  "American Champion", "Bellanca", "Luscombe", "Maule", "Stinson",
  "Aeronca", "Taylorcraft", "Vans", "Kitfox", "Zenair/Zenith",
  "Lake", "North American", "Boeing/Stearman", "Curtiss", "DeHavilland",
  "Fairchild", "Waco", "Pitts", "Globe", "Aviat", "Glasair", "Lancair",
  "Liberty Aerospace", "Tecnam", "Icon Aircraft", "CubCrafters"
]

TIER_3_NICHE = [
  # All remaining Trade-A-Plane makes with 2+ listings (from screenshot):
  # 170pm, Adventure Air, Aero Adventure, Aerocomp, Aeroprakt, Arion, Ayres,
  # BRM Aero, Canadian Car & Foundry, Champion, Commonwealth, Corben, Cozy,
  # DaVinci Clinton, Ercoupe, Extra Flugzeugbau, Fieseler, Flight Design,
  # Flying Legend, Focke Wulf, Found Aircraft, Gippsaero, Glasair Aviation,
  # Hatz, Hawker, Helio, Jabiru, Javron, JMB, Just Aircraft, Kitplanes for Africa,
  # Messerschmitt, Micco, Mustang Aeronautics, Nanchang, Navy, Noorduyn, NzAero,
  # Osprey, Pietenpol, Pilatus, Pipistrel, Progressive Aerodyne, Questair,
  # Rans, Remos, Republic, Rockwell, Ryan, Scottish Aviation, Seawind, Siai Marchetti,
  # Sonex, SPA, Steen, Stewart, Stolp, Super Petrel, Supermarine, Symphony Aircraft,
  # Team Rocket, Team Tango, Titan, TL Sport Aircraft, Tomark Aero, Travel Air,
  # Varga, Vashon Aircraft, Veloce Planes, Velocity Aircraft, Vulcanair, Wag Aero,
  # Wheeler, Yakovlev, Zlin, Zlin Aviation
]

SCRAPE_ORDER = TIER_1_HIGH_VALUE + TIER_2_MEDIUM_VALUE + TIER_3_NICHE

ADD --tier CLI ARGUMENT to both scrapers:
  --tier 1          Tier 1 only (fast daily run)
  --tier 1 2        Tiers 1 and 2
  --tier all        Everything (default)

ADD MANUFACTURER_ALIASES for normalization across sites:
  MANUFACTURER_ALIASES = {
    "Beechcraft": ["Beechcraft", "Beech", "Raytheon Aircraft"],
    "Piper": ["Piper", "Piper Aircraft"],
    "Grumman": ["Grumman", "Grumman/American General", "American General"],
  }
  Normalize make field before upsert so "Beech Bonanza" and "Beechcraft Bonanza" 
  resolve to the same canonical make.

ADD manufacturer_tier column:
  ALTER TABLE aircraft_listings ADD COLUMN IF NOT EXISTS manufacturer_tier INT;
  Create scraper/backfill_tiers.py to backfill existing rows from tier lists.
```

---

### TASK 11: Avionics Catalog and Conservative Valuation Expansion
**Priority: 🔴 HIGH — Parser accuracy first, then valuation depth**
**Agent: BACKEND**

```
Read AVIONICS_EXPANSION_PLAN.md first and execute it in phases.

LOCKED DECISIONS (do not override without Ryan approval):
- Conservative anchor: P25
- Minimum sample floor: sample_count >= 3
- Override policy: OEM/MSRP first when conflicting with market comps
- Data policy: quality over quantity
- Segment priority: piston singles -> multi-piston -> broader fleet

IMPLEMENTATION PHASES:

PHASE 1 — Schema and seed catalog:
- Add migrations:
  - 20260305000045_add_avionics_catalog_tables.sql
  - 20260305000046_add_avionics_market_value_tables.sql
  - 20260305000047_add_avionics_listing_observations.sql
- Create canonical avionics unit + alias tables with provenance metadata.
- Seed piston-single priority families first (Garmin/Avidyne/Aspen/uAvionix/BendixKing/S-TEC).

PHASE 2 — Parser depth upgrade:
- Extend parser matching to use normalized aliases + quantity detection.
- Handle noisy variants (spacing, hyphenation, Xi/W suffixes).
- Persist unresolved avionics tokens for iterative alias expansion.

PHASE 3 — Conservative valuation engine:
- Build DB-backed value resolver:
  1) OEM/MSRP if available
  2) else market P25 when sample_count >= 3
  3) else conservative fallback
- Add confidence discounts and obsolescence haircuts.
- Keep anti-overlap logic so redundant avionics stacks are not double-counted.

PHASE 4 — Shadow run and cutover:
- Run old/new avionics scoring in parallel and compare drift.
- Tune only after coverage + precision checks pass.
- Cut over to DB-backed logic and run full score backfill.

SUCCESS CRITERIA:
- Parser precision >= 92% on piston-single gold set
- Unresolved-token rate reduced >= 40% from baseline
- Score explanations include value source + confidence

VERIFY WITH:
.venv312\Scripts\python.exe scraper\avionics_catalog_builder.py --segment piston_single --dry-run
.venv312\Scripts\python.exe scraper\avionics_market_ingest.py --segment piston_single --dry-run
.venv312\Scripts\python.exe -m pytest scraper\tests\test_avionics_intelligence.py -v
.venv312\Scripts\python.exe scraper\audit_avionics_coverage.py --segment piston_single
.venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps
```

---

## 🟡 Data Source Expansion Track (MISC Agent)

> Added from `AGENTS_DATA_SOURCES.md` on March 3, 2026.
> These tasks are independent of Tasks 1-11 and can run in parallel workstreams.

### DS-1: Barnstormers.com Scraper
**Priority: 🔴 HIGH**
**Agent: MISC (handoff to BACKEND for pipeline integration)**

- Audit Barnstormers list/detail selectors and pagination; document in `scraper/barnstormers_selectors.md`.
- Build `scraper/barnstormers_scraper.py` using requests + BeautifulSoup with Playwright fallback.
- Scrape all major aircraft categories and store mappings in `scraper/config.py` (`BARNSTORMERS_CATEGORIES`).
- Parse description text through `parse_description()` and output canonical `scraper/schema.py` listing shape.
- Integrate pipeline via `scripts/run-barnstormers-pipeline.ps1` and `pipeline:barnstormers` npm script.

### DS-2: eBay Completed Listings (Sold Transactions)
**Priority: 🔴 HIGH**
**Agent: MISC (handoff to BACKEND)**

- Build `scraper/ebay_sold_scraper.py` using Playwright and only capture sold listings (green sold prices).
- Expand search-term coverage in `scraper/config.py`:
  - `EBAY_SEARCH_TERMS_AIRCRAFT` for high-priority aircraft models (existing comps flow)
  - `EBAY_SEARCH_TERMS_ENGINES` for engine models/families (IO-360, O-320, IO-550, PT6, etc.)
  - `EBAY_SEARCH_TERMS_AVIONICS` for common avionics units (GTN 650/750, GNS 430W/530W, Aspen, G5, autopilots)
  - `EBAY_SEARCH_TERMS_COMPONENTS` for high-value parts (props, cylinders, mags, vacuum pumps, alternators, interior kits)
- Create/extend sold-transactions schema to support component-level pricing:
  - keep `aircraft_sold_transactions` for whole-aircraft sold comps
  - add `aircraft_component_sales` (or equivalent) with fields:
    `component_type`, `component_subtype`, `manufacturer`, `model`, `condition`, `price_sold`,
    `quantity`, `sold_date`, `listing_url`, `source`, `confidence`
  - add indexes on `(component_type, model)` and `sold_date`
- Add parser normalization rules so noisy eBay titles map to canonical engine/avionics/component names used by intelligence scoring.
- Generate two reports:
  - `scraper/ebay_market_report.md` (aircraft sold comps by make/model)
  - `scraper/ebay_component_market_report.md` (engine/avionics/components min/median/max with sample counts)
- Update valuation pipeline:
  - keep `compute_market_comps.py` blend for whole-aircraft pricing (active 60% + sold 40%)
  - add component-pricing lookups that feed deferred-maintenance and avionics installed-value estimates when confidence is adequate
  - log source attribution per adjustment so score explanations can state when eBay component comps were used

### DS-3: FAA Ownership Change Monitor
**Priority: 🔴 HIGH**
**Agent: MISC (handoff to BACKEND)**

- Build `scraper/faa_registry_monitor.py` to detect owner/cert-date changes from FAA daily registry updates.
- Create migration for `detected_ownership_changes` table and required indexes.
- When ownership changes, link to `aircraft_listings`, mark inactive where appropriate, and log estimated sale signal.
- Feed recent transfer-derived sale signals into `compute_market_comps.py` (discounted weighting).
- Add daily runner script `scripts/run-faa-monitor.ps1` and npm script `pipeline:faa-monitor`.

### DS-4: Type Club & Owner Association Classifieds
**Priority: 🟠 MEDIUM**
**Agent: MISC**

- Research and document each target association in `scraper/type_club_research.md`.
- Respect `robots.txt`; skip sites that explicitly disallow scraping.
- Build per-site scrapers for scrapeable sources: `scraper/typeclub_{name}_scraper.py`.
- Add unified sequential runner `scripts/run-typeclubs-pipeline.ps1` + npm script `pipeline:typeclubs`.
- Publish `DATA_SOURCES_REPORT.md` with scrapeability matrix and Ryan membership recommendations.

### DS-5: ASO.com Scraper
**Priority: 🟠 MEDIUM**
**Agent: MISC (handoff to BACKEND)**

- Audit selectors/protection/pagination and document in `scraper/aso_selectors.md`.
- Verify robots policy from `https://www.aso.com/robots.txt`; proceed only if allowed.
- Build `scraper/aso_scraper.py` with canonical schema output (`source = "aso"`).
- Add category mapping to `scraper/config.py` (`ASO_CATEGORIES`) and 48-hour detail-fetch dedupe.
- Deliver `OVERLAP_ANALYSIS.md` comparing ASO inventory overlap vs Controller/Trade-A-Plane.

### DS-6: Aircraft Bluebook Integration Evaluation
**Priority: 🟡 MEDIUM (Research First)**
**Agent: MISC**

- Produce `BLUEBOOK_INTEGRATION_PLAN.md` covering pricing tiers, data access mode (API/CSV/web), and contact path.
- Define desired data fields and proposed DB integration points for listings/comps.
- Provide implementation architecture options for API vs bulk import paths.
- Include ROI recommendation and free/low-cost alternatives comparison.

### DS-7: VREF Integration Evaluation
**Priority: 🟡 MEDIUM (Research First)**
**Agent: MISC**

- Produce `VREF_INTEGRATION_PLAN.md` with valuation, supply/demand, and operating-cost data review.
- Evaluate programmatic access options and pricing.
- Map VREF data into scoring/detail-page opportunities.
- Provide a Bluebook vs VREF use-case recommendation matrix.

### DS-8: State Property Tax Records (Free Bluebook Proxy)
**Priority: 🟡 MEDIUM**
**Agent: MISC**

- Research CA/TX/FL county aircraft assessment portals; document findings in `scraper/state_tax_research.md`.
- Build `scraper/state_tax_scraper.py` for accessible portals and N-number lookups.
- Create `aircraft_tax_assessments` migration/table for normalized storage.
- Surface internal valuation delta and optionally blend as weak comp signal.
- Document caveats: lag, geographic bias, incomplete coverage, wholesale-vs-retail distinction.

### DS-9: YouTube Transcript Price Mining (Prototype)
**Priority: 🟢 LOW (Future Session)**
**Agent: MISC**

- Research channel targets in `scraper/youtube_research.md`.
- Build transcript-mining prototype for aircraft price mentions and context extraction.
- Save structured findings to `scraper/youtube_price_findings.json`.
- Generate review report `scraper/youtube_price_report.md` with confidence labels.
- Add optional loader for validated records into `aircraft_sold_transactions` with `source = "youtube"`.

### DS Completion Checklist

- [ ] DS-1: Barnstormers scraper live and integrated into pipeline
- [x] DS-2: eBay sold scraper live, `aircraft_sold_transactions` table populated
- [ ] DS-3: FAA ownership monitor running daily, `detected_ownership_changes` table live
- [ ] DS-4: Type club research complete, scrapers built for accessible sites
- [ ] DS-5: ASO scraper live, overlap analysis complete
- [ ] DS-6: Bluebook research complete, recommendation delivered
- [ ] DS-7: VREF research complete, recommendation delivered
- [ ] DS-8: State tax research complete, accessible counties being scraped
- [ ] DS-9: YouTube prototype complete, first price report delivered

---

## 🔵 Backlog (Future Sessions)

- `/listings` sorting controls (vs_median_price, days_on_market, price reduction amount)
- AeroTrader scraper (bot protection heavy; likely needs CDP approach like Task 7)
- Barnstormers.com scraper (vintage/classic aircraft, simpler site)
- Nightly digest of new EXCEPTIONAL_DEAL listings to Ryan
- User accounts (Supabase Auth) for saved searches and watchlist persistence
- Landing/marketing home page at `/`
- Pre-buy inspection checklist PDF export
- VREF API integration (if programmatic access available)
- Mobile-responsive polish pass
- `/internal/deals` sorting controls (deal_score, price drop, days listed)
- Listing comps chart follow-up: add `Price vs Value Score` mode for aircraft with sparse time data and keep a clear plotted-vs-excluded data-quality summary

---

## Frontend Style Guide Addendum (March 2026)

Use this alongside the existing dark/orange brand system:

- **Global page background (softened):** `#0D1117` (replaces pure black `#000000` for main page chrome)
- **Global depth treatment:** very subtle warm/cool radial gradients over the page background
- **Card background (unchanged):** `#1A1A1A`
- **Primary border (legacy):** `#333333`
- **Softer border tone (new preferred):** `#3A4454` for inputs, controls, and low-emphasis chrome
- **Primary accent (unchanged):** `#FF9900`
- **Burn orange accent (unchanged):** `#AF4D27`
- **Muted text (unchanged):** `#B2B2B2`

Guidance:
- Keep cards and panels on `#1A1A1A` so data modules still stand out against the softened page background.
- Preserve current score color thresholds and CTA contrast; this is a tonal softening, not a brand color rework.
- New pages should default to the global background token in `app/globals.css` rather than hardcoding black.
- Use `#3A4454` for form and control borders before defaulting back to `#333333` when you need stronger separation.
- For high-volume browsing pages, prefer an optional row/list layout mode that prioritizes essential pricing/risk/deal fields for faster comparison.

---

## Key Commands Cheat Sheet

```bash
# Start dev server
cd "D:\Documents\$$Full Hangar\2.0\CursorReposity\full-hangar"
npm run dev
# → http://localhost:3001

# Post-scrape pipeline
npm run pipeline:post-scrape
npm run pipeline:post-scrape:with-ntsb
npm run pipeline:post-scrape:with-ntsb:download
npm run pipeline:post-scrape:controller
npm run pipeline:post-scrape:controller:all-makes
npm run pipeline:daily
npm run pipeline:daily:dry
npm run pipeline:summary

# Controller scraper
.venv312\Scripts\python.exe scraper\controller_scraper.py --make Cessna --limit 10 --verbose

# Trade-a-Plane scraper
.venv312\Scripts\python.exe scraper\tradaplane_scraper.py --make Cessna --limit 5 --dry-run

# Backfill scores
.venv312\Scripts\python.exe scraper\backfill_scores.py --from-json scraper\controller_cessna.json
.venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps
.venv312\Scripts\python.exe scraper\backfill_tiers.py

# Engine enrichment audit
.venv312\Scripts\python.exe scraper\audit_engine_enrichment.py
.venv312\Scripts\python.exe scraper\audit_engine_enrichment.py --output scraper\engine_enrichment_audit_latest.json

# FAA enrichment
.venv312\Scripts\python.exe scraper\enrich_faa.py --verbose

# Intelligence tests
.venv312\Scripts\python.exe scraper\tests\test_intelligence.py
.venv312\Scripts\python.exe scraper\tests\test_avionics_intelligence.py

# Validate scores in DB
.venv312\Scripts\python.exe scraper\validate_scores.py

# Clear Next.js cache (if frontend won't start)
rmdir /s /q .next
npm run dev

# Git workflow
git add -A
git commit -m "feat: description of what you did"
git push origin main
```

---

## Environment Files

## Supabase Agent Access (Canonical)

All agents should use `lib/supabase/server.ts` as the source of truth for server-side Supabase access.

### Interfaces

- `createServerClient()`  
  Uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.  
  Use for normal read-safe server operations.

- `createPrivilegedServerClient()`  
  Uses `NEXT_PUBLIC_SUPABASE_URL` + service-role key for privileged/internal operations.

### Service-Key Resolution Order (createPrivilegedServerClient)

1. `SUPABASE_SERVICE_KEY`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `NEXT_SUPABASE_SERVICE_ROLE_KEY`
4. Local dev fallback: parse `scraper/.env` for `SUPABASE_SERVICE_KEY` (non-production only)

If no service key is found, it throws:
`Missing service-role Supabase key. Set SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY).`

### Agent Rules for Supabase Usage

- API routes and server-only internal endpoints that need unrestricted table access should use `createPrivilegedServerClient()`.
- Public-facing/listing read paths should prefer `createServerClient()` unless service-role access is required.
- Never expose service-role keys to client/browser code.
- Do not create alternate ad-hoc Supabase client factories; reuse `lib/supabase/server.ts`.
- For local agent runs, ensure `scraper/.env` contains `SUPABASE_SERVICE_KEY` if service-role operations are needed.

`.env.local` (Next.js frontend — in project root):
```
NEXT_PUBLIC_SUPABASE_URL=https://pbbqdlcmgtruhssudwek.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[get from Supabase dashboard → Settings → API]
INTERNAL_PASSWORD=hangar-internal-2026
```

`scraper/.env` (Python scraper):
```
SUPABASE_URL=https://pbbqdlcmgtruhssudwek.supabase.co
SUPABASE_SERVICE_KEY=[get from Supabase dashboard → Settings → API → service_role key]
```

---

## When You Finish a Task

1. Update the ✅ Completed section above
2. Move the task from 🟡 Next Tasks to ✅ Completed
3. Add any new tasks discovered to 🟡 or 🔵
4. Note any new migrations in the Pending Migrations section
5. Run `git add -A && git commit -m "feat/fix: what you did"` before closing
