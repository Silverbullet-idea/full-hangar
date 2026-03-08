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

### Frontend Product and UX

- Theme system shipped with persistent dark/light mode, dual logos, and tokenized styling parity.
- Global header/search improvements shipped, including listings search entry and inventory-aware UX updates.
- Listings browsing UX significantly improved (banner controls, layout modes, row/compact density, filtering polish, return-state persistence).
- Listing detail page upgraded with richer FAA snapshot, comps/cost visualization, score summary clarity, and avionics rendering quality.
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
- Description parser expanded with richer normalization and maintenance context extraction.
- Comps selection/waterfall logic improved and reflected in listing detail score explanations.
- Canonical completeness scoring map added in `lib/admin/completeness.ts` for parser-focused data quality recommendations.

---

## Open Work (Lean Backlog)

Each item should stay one-line actionable with clear completion criteria.

### High Priority

- **Board hygiene:** keep this file concise and current after each substantial session.

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
