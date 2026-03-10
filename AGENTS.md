# Full Hangar — Agent Workflow Helper

> Every agent reads this first and updates it when done.
> Last updated: March 9, 2026

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

### Frontend Product and UX

- Theme system shipped with persistent dark/light mode, dual logos, and tokenized styling parity.
- Global header/search improvements shipped, including listings search entry and inventory-aware UX updates.
- Listings browsing UX significantly improved (banner controls, layout modes, row/compact density, filtering polish, return-state persistence).
- Listing detail page upgraded with richer FAA snapshot, comps/cost visualization, score summary clarity, and avionics rendering quality.
- Comps panel supports multiple comparison modes and dynamic chart loading behavior.
- `/beta/join` and `/beta/dashboard` beta-facing intelligence preview shipped with token-session access.
- `/beta/join` now supports Google Sign-In for authorized users listed in `admin_users`.
- `/internal/admin` now includes source-level inventory detail view (table, completeness tiers, unknown-domain disambiguation, and 15-field coverage heatmap).
- Source-quality tier chart in `/internal/admin` was switched to a tier-first horizontal comparison view (sources compared per tier).
- Tier-row source order in the source-quality chart was stabilized across tiers (ordered by active listings, then source).

### Backend, Pipeline, and Data Sources

- Shared scraper foundations landed (`env_check`, `schema`, `scraper_base`, config/tier normalization, retry/upsert safety).
- Trade-A-Plane and Controller pipelines hardened with adaptive controls, retries, and safer fallbacks.
- Additional sources integrated and iterated (AeroTrader, AFS, ASO, GlobalAir, AvBuyer, Barnstormers).
- Non-aircraft detection/hide workflow implemented and operationalized.
- FAA enrichment + ownership-transfer feed + internal recent-sales wiring completed.
- Avionics Wave 1 source audit + local seed assets shipped (`scraper/avionics_source_research.md`, `scraper/AVIONICS_DATA_SOURCES_REPORT.md`, `scraper/avionics_catalog_seed.py`, and `scraper/data/avionics/avionics_master_catalog.json` with 165 units).
- Internal admin APIs added for data quality, platform stats, buyer intelligence, and invite management.
- Listing media resilience hardened (URL validation, gallery failover, proxy-safe placeholders, integrity audit tooling).
- Completeness audit tooling added (`scraper/audit_field_coverage.py`) with per-source/field fill report output and low-fill diagnostics.
- Unknown-source active rows were soft-hidden pending provenance review; root cause traced to legacy `source`-only writes not setting `source_site`.
- Parser-targeted completeness fixes started from audit output: canonical `state` wiring updates in AvBuyer/Trade-A-Plane/Controller/GlobalAir and ASO engine `TSO|TSN` extraction improvements with per-engine capture in `engines_raw`.
- TAP detail parsing now captures multi-engine/prop payloads (`engines_raw`, `props_raw`) and writes canonical second-engine/prop fields (`engine_count`, `second_engine_time_since_overhaul`, `second_time_since_prop_overhaul`) when detail tables expose them.
- TAP scraper now includes single-listing probe CLI flags (`--probe-url`, `--probe-source-id`, `--probe-write`) for low-pressure detail validation and targeted multi-engine field updates.
- TAP scraper now supports optional account login + humanized warmup (`--tap-login`, `--tap-username/--tap-password` or `TAP_USERNAME/TAP_PASSWORD`) with mouse/scroll pauses before scraping.
- TAP probe mode now supports saved HTML fallback (`--probe-html`) and parses `#general_specs` label rows (`Engine 1/2 Time`, `Prop 1/2 Time`) into canonical multi-engine fields; verified persisted write on `tap_2451580`.
- TAP probe mode now supports batch HTML ingestion (`--probe-html-dir`, `--probe-html-glob`, `--probe-batch-limit`) for manual micro-batches when live detail requests are blocked.
- TAP probe batch mode now deduplicates by `listing_id`/`source_id` so duplicate saved pages do not trigger repeated writes in the same run.
- Single-file TAP handoff wrapper added at `scraper/TAP_SCRAPER_SINGLE_FILE.py` with executable entrypoint plus consolidated TAP playbook via `--playbook`.
- Controller live refresh was re-run (CDP-attached) and `scraper/FIELD_COVERAGE_REPORT.md` was regenerated (`4308` active rows, unknown bucket `0` active).
- ASO scraper discovery was adapted to current site structure (category-page fallback when `mg_id/m_id` links are absent) and now captures stronger card/detail completeness (`title/year/make/model`, `seller_type`, `location_raw/state` fallback from detail `Location:`).
- ASO controlled live pass completed after schema/constraint-safe upsert fallback wiring; post-run audit shows major ASO lift (`location_raw` `0.0%→97.4%`, `state` `0.0%→82.5%`, `time_since_overhaul` `0.0%→67.5%`, `time_since_prop_overhaul` `0.0%→22.1%`, `seller_type` `0.0%→33.8%`).
- ASO listings image rendering was fixed in frontend proxy allowlist by adding `.aso.com` to `app/api/image-proxy/route.ts`.
- ASO pagination was fixed for current ASP.NET controls by dynamically resolving pager targets and parsing current pager text; category fallback now crawls full pages instead of first-page-only (`150` cap removed).
- ASO hidden segment discovery was added for linked special feeds (`pl=true`, `ll=true`, `rva=true`) with run-level source-id dedupe and duplicate-only category short-circuiting.
- ASO live reconciliation reached `601` discoverable rows (from prior `154` active baseline), with stale-row cleanup completed by soft-deactivating 4 non-discoverable IDs (`aso_198337`, `aso_201193`, `aso_201651`, `aso_201672`), leaving `601` active / `605` total ASO rows.
- Trade-A-Plane scraper was rebuilt with Playwright-first anti-bot handling, category config wiring, selector audit notes (`scraper/tap_selectors.md`), and daily pipeline integration (`pipeline:tradaplane` + daily sequence placement after Controller).
- Trade-A-Plane anti-bot resilience was further tightened: cookie-export normalization, optional cookie bypass (`--no-cookies`), card-first block detection, true TAP advanced categories (`Jets`, `LSA | Ultralight`, `Gliders | Sailplanes`, `Rotary Wing`, `Balloons | Airships`), and chunk controls (`--start-page`, `--max-pages`) for resumable deep crawls.
- Controller CDP dry-run revalidated parser capture (`seller_name`, `seller_type`, `location_raw`, `state`, `total_time_airframe`, `primary_image_url`) under current challenge posture.
- Controller DB-write fallback was fixed for this environment by preferring `on_conflict=source_site,source_listing_id` with row-level fallback when batch saves zero; controlled live validation (`limit 30`) succeeded with `Upserted 30/30`, lifting controller coverage (`location_raw/state/seller_name/seller_type` each `0.0%→4.3%`).
- Controller `asking_price` mapping was fixed (write both `price_asking` and canonical `asking_price`); controlled live pass (`limit 30`) confirmed writes and lifted controller `asking_price` from `0.0%` to `2.6%` (`0→18`).
- Controller overhaul extraction was wired into canonical completeness fields (`time_since_overhaul`, `time_since_prop_overhaul`) and force-refresh mode (`--force-details`) was added for stale fingerprint rows; controlled CDP live pass (`limit 30`) succeeded with `Upserted 30/30` and post-run audit now shows controller `time_since_overhaul=4.1%` (`29`) and `time_since_prop_overhaul=1.8%` (`13`).
- Controller broader CDP forced-refresh pass (`single_piston`, no manufacturer filter, `--force-details --limit 80`) completed with `Upserted 80/80`; post-run audit lifted controller low-fill fields to `asking_price=10.4%` (`73`), `time_since_overhaul=12.1%` (`85`), `time_since_prop_overhaul=3.1%` (`22`), and `location_raw/state/seller_name/seller_type=12.2%` (`86` each).
- Controller second broader forced-refresh pass (`twin_piston`, `--force-details --limit 80`) completed with `Upserted 80/80`; follow-up audit lifted controller to `asking_price=14.3%` (`105`), `time_since_overhaul=21.5%` (`158`), `time_since_prop_overhaul=7.2%` (`53`), and `location_raw/state/seller_name/seller_type=22.6%` (`166` each).
- Controller third broader forced-refresh pass (`jet`, `--force-details --limit 80`) completed with `Upserted 80/80`; follow-up audit lifted controller to `asking_price=17.5%` (`131`), `time_since_overhaul=30.7%` (`230`), and `location_raw/state/seller_name/seller_type=32.9%` (`246` each); `time_since_prop_overhaul` held roughly flat at `7.1%` (`53`).
- Multi-engine persistence foundation landed: migration `20260309000052_add_multi_engine_capture_columns.sql` adds `engine_count`, secondary engine/prop timing columns, and `engines_raw/props_raw` JSONB; shared `validate_listing` now normalizes these fields and scoring gates only apply second-engine penalties for twin/multi-engine aircraft.
- Post-migration smoke verification completed: DB columns exist and controller twin live smoke (`limit 5`) now persists `engine_count=2` rows; remaining rollout is source-specific parser wiring to populate `second_engine_time_since_overhaul`, `second_time_since_prop_overhaul`, and `engines_raw/props_raw` where source detail supports it.
- Controller per-engine parser wiring landed for detail specs: twin-engine dry/live smoke (`twin_piston`, `limit 10`) now persists `engines_raw` rows and secondary engine timing when labeled per-engine (`engine_count` non-null `10`, `engines_raw` non-null `8`, `second_engine_time_since_overhaul` non-null `2`).
- Shared fallback for multi-engine extraction added in parser/schema layer: `description_parser.extract_times` now recognizes `Engine 1/2` + `Prop 1/2` overhaul patterns, and `schema.validate_listing` promotes these into secondary engine/prop DB columns (with `engine_count=2` inference) when source detail tables are unavailable.
- TAP/ASO smoke status: TAP multi-engine category and probe modes still hit anti-bot blocks; ASO direct category micro-run is too large under current fallback shape, so single-listing ASO probe-upsert was used for verification and confirmed `props_raw` persistence (`aso_146991`) while engine-array coverage remains pending broader ASO write passes.
- GlobalAir parser expansion landed for detail pages: canonical `state` fallback hardening, broader spec extraction (`engine_tbo_hours`, `time_since_new_engine`), richer section capture, and structured `engines_raw/props_raw` extraction with per-engine/prop timing mapping into `engine_count`, `time_since_overhaul`, `second_engine_time_since_overhaul`, `time_since_prop_overhaul`, and `second_time_since_prop_overhaul` when present.
- Shared schema normalization now prefers overhaul-typed rows in `engines_raw/props_raw` before fallback hour inference, preventing non-overhaul engine metrics from being mis-mapped into canonical overhaul completeness fields.
- Browser extension harvester built for Controller.com anti-bot bypass (`browser-extension/` + `scraper/bridge_server.py`). Bypasses Distil Networks by running inside user's real browser session with toolbar popup controls. Start bridge with: `npm run extension:bridge`.
- TAP self-healing scraper v2 built (`scraper/tap_auto_scraper.py`). DataDome bypass via cookie injection. Confirmed selectors from live HTML. Self-healing at 4 levels. All categories. Completeness score reporting. Commands: `npm run tap:auto | tap:auto:resume | tap:cookie:status | tap:score:report`.

### Intelligence and Scoring

- Hybrid scoring v`1.8.0` deployed with improved calibration and distribution outcomes.
- Avionics parser/catalog/valuation expansion completed through rollout + attribution persistence.
- Description parser expanded with richer normalization and maintenance context extraction.
- Comps selection/waterfall logic improved and reflected in listing detail score explanations.
- Canonical completeness scoring map added in `lib/admin/completeness.ts` for parser-focused data quality recommendations.
- Backfill runtime compatibility hardening landed in `scraper/backfill_scores.py` and `core/intelligence/` (`stc_intelligence.py`, `lookup_engine_tbo_from_model`), restoring Phase 4 execution in this workspace snapshot.

---

## Open Work (Lean Backlog)

Each item should stay one-line actionable with clear completion criteria.

### High Priority

- **Board hygiene:** keep this file concise and current after each substantial session.
- **Restart handoff (all lanes):** all local Full Hangar scraper/runtime processes are intentionally paused for machine reboot; verify zero active jobs before restarting pipelines.
- **Controller completeness lift (active):** continue controlled/focused Controller CDP runs (use `--force-details` as needed) to push `asking_price/time_since_overhaul/time_since_prop_overhaul/location_raw/state/seller_name/seller_type` beyond current pilot-level percentages before broadening beyond Cessna single-piston.
- **Restart handoff (TAP):** resume with chunked TAP passes (`--category "All Aircraft" --no-detail --no-cookies --start-page <n> --max-pages <k>`) and re-check `trade_a_plane` row deltas after each chunk.
- **Multi-engine rollout verification (active):** run post-migration source smoke runs + DB spot checks to confirm all active scrapers persist `engine_count` and per-engine fields where available; then execute backfill and verify twin-engine scoring behavior in admin/detail views.
- **GlobalAir anti-bot unblock (active):** current session remains Cloudflare-blocked for GlobalAir listing and detail fetches (`403` / `__cf_chl`); use manual checkpoint/CDP-attached browser session, then run `globalair_scraper.py --refresh-existing-details --refresh-multi-engine-only --refresh-limit <n> --force-details` to persist new multi-engine fields to existing rows.
- **ASO steady-state monitoring (active):** keep ASO active inventory near current discovered ceiling (`~601`) via periodic runs + stale reconciliation so pipeline focus can shift to detecting net-new listings.

### Medium Priority

- **Completeness lift (active):** continue Phase 2/3 source-specific selector fixes from `scraper/FIELD_COVERAGE_REPORT.md` until low-fill target fields are remediated.
- **TAP deep-crawl continuation:** `All Aircraft` card-level rescrape now reached `3347` total (`3344` active) and crossed the 3k target; deep anti-bot wall still appears around `s-page=126+`.
- **TAP anti-bot pacing:** result-page pacing controls in `tradaplane_scraper.py` (`--page-delay-min/--page-delay-max`) remain in place for safer chunking/cooldown retries.
- **TAP list-enrichment backfill:** card selectors were strengthened (`txt-price`, `txt-total-time`, seller name blocks, stricter `Reg#` parsing), enabling high lift for list-derived fields without detail-page fetches.
- **TAP multi-engine verification:** direct detail fetch remains anti-bot blocked in this session, but saved-detail HTML probe path is now validated end-to-end (extract + DB persist); continue with manual detail-save micro-batches until direct detail access stabilizes.
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
npm run pipeline:media:coverage:active
npm run pipeline:media:integrity
npm run tap:auto
npm run tap:auto:resume
npm run tap:cookie:status
npm run tap:score:report
npm run tap:auto:singleengine
.venv312\Scripts\python.exe scraper\tap_auto_scraper.py --score-report
.venv312\Scripts\python.exe scraper\validate_scores.py

# Extension bridge (start before opening extension popup)
npm run extension:bridge
npm run extension:bridge:dryrun
.venv312\Scripts\python.exe scraper\test_bridge_server.py
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
