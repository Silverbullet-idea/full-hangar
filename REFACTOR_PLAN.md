# Full Hangar Refactor Plan

Last refreshed: March 5, 2026 (file-by-file pass aligned to `AGENTS.md`)

## 1) Goal of This Plan

This document tracks refactor progress file-by-file so future work is about convergence, not rework. Foundations are mostly complete; remaining work is consistency: remove duplicate pathways, keep contracts stable, and simplify long files without changing product behavior.

Status legend used below:
- `COMPLETED` = refactor goal achieved and in active use
- `PARTIAL` = meaningful progress but duplicate/mixed patterns remain
- `REMAINING` = still largely in original pre-refactor shape

## 2) Current Architecture Snapshot

```text
scraper provider scripts
  -> shared scraper modules (schema/config/env/scraper_base/adaptive_rate)
  -> Supabase tables/views/RPCs
  -> repository-backed API routes
  -> Next.js routes (public + internal)
```

## 3) File-by-File Audit

### A) Scraper Foundation and Pipelines

| File | Current state | Status | Next action |
|---|---|---|---|
| `scraper/scraper_base.py` | Shared utilities (delta-safe write paths, stale-detail skip, interleaving helpers) are implemented and used across multiple providers | `COMPLETED` | Continue adopting in any new provider before adding custom helpers |
| `scraper/schema.py` | Canonical listing schema + validation is in place and integrated in modernized scrapers/parsers | `COMPLETED` | Add/maintain schema-change notes whenever DB columns evolve |
| `scraper/config.py` | Centralized manufacturer tiers/aliases and site config expanded heavily | `COMPLETED` | Continue moving hardcoded parser/scoring constants here when practical |
| `scraper/env_check.py` | Startup env validation exists and is wired in shared scraper flow | `COMPLETED` | Keep required-var list in sync with new pipeline features |
| `scraper/adaptive_rate.py` | History-driven delay/batch tuning shipped for TAP | `COMPLETED` | Extend telemetry feedback where other sources hit anti-bot pressure |
| `scraper/tradaplane_scraper.py` | Migrated to shared foundation, adaptive controls, retry-failed flow, and stable upsert behavior | `COMPLETED` | Maintenance only; prioritize incremental parser quality improvements |
| `scraper/controller_scraper.py` | Shared patterns and CDP/CAPTCHA-safe operational modes implemented | `COMPLETED` | Keep anti-bot controls isolated and avoid reintroducing duplicated helpers |
| `scraper/backfill_scores.py` | Strong operationally; enriched with parser refresh, comp computation, and compatibility guards | `PARTIAL` | Continue reducing any residual dependency on provider-specific normalization paths |
| `scraper/enrich_faa.py` | FAA + accident-history integration delivered; fallback candidate matching improved | `PARTIAL` | Consider optional batched lookup path to reduce query fanout cost |
| `scraper/compute_market_comps.py` | Live and integrated with sold + transfer signals and scoring metadata | `PARTIAL` | Continue extracting repeated utility patterns into shared modules |
| Controller alert-ingestion parser | Deprecated and removed by policy | `REMOVED` | No inbox/OAuth dependency in current pipeline |
| `scraper/barnstormers_scraper.py` | Implemented and hardened through multiple quality passes (title/model/make/image cleanup) | `COMPLETED` | Scale-run monitoring; reduce remaining sparse field rates over time |
| `scraper/ebay_sold_scraper.py` | Implemented with aircraft/component modes, reports, and DB-backed output | `COMPLETED` | Keep taxonomy normalization aligned with scoring identifiers |
| `scraper/faa_registry_monitor.py` | Ownership-change monitor implemented and integrated with internal feed | `PARTIAL` | Promote from functional to routine/validated daily operations tracking |

### B) Intelligence Engine

| File | Current state | Status | Next action |
|---|---|---|---|
| `core/intelligence/aircraft_intelligence.py` | Expanded materially (risk caps, comp waterfall, investment scoring) with good output richness | `PARTIAL` | Keep extracting config-heavy constants where possible; preserve version discipline |
| `core/intelligence/listing_quality.py` | Actively used in scoring stack and stable | `PARTIAL` | Re-check alias assumptions against current canonical listing schema |
| `core/intelligence/model_normalizer.py` | Focused utility and low-risk | `COMPLETED` | Maintenance only |
| `core/intelligence/reference_service.py` | Still a mixed concern area (data access + scoring support) | `PARTIAL` | Continue toward cleaner provider/repository boundary |
| `core/intelligence/reference.py` | Valuable fallback data source, but still partly hardcoded | `PARTIAL` | Keep as fallback-only and reduce duplicate constants in callers |
| `core/intelligence/avionics_intelligence.py` | Major upgrades shipped (DB-backed valuation scaffolding, alias coverage expansion, unresolved-token loop) | `PARTIAL` | Complete Phase 3/4 cutover and confidence-source explanation polish |
| `core/intelligence/stc_intelligence.py` | Stable and integrated with v1.5+ scoring | `PARTIAL` | Continue migration toward data-driven references where feasible |

### C) Repository and API Layer

| File | Current state | Status | Next action |
|---|---|---|---|
| `lib/db/listingsRepository.ts` | Core repository abstraction exists and now backs key listings APIs | `COMPLETED` | Continue migrating remaining route-side ad hoc query logic |
| `lib/supabase/server.ts` | Canonical factory path is documented and in active use, including privileged fallback resolution | `COMPLETED` | Enforce as sole server-side Supabase creation path |
| `app/api/deal-alerts/route.ts` | Refactored to repository path and performance headers/timing | `COMPLETED` | Maintenance only |
| `app/api/listings/[id]/full` | Added and actively used to consolidate detail retrieval | `COMPLETED` | Keep payload contract stable for UI consumers |
| `app/api/listings/[id]/comps` | Implemented and enriched with fallback + metadata behavior | `COMPLETED` | Monitor query cost and comp quality at scale |
| `app/api/listings/options` | Added with count metadata for filter UX | `COMPLETED` | Maintenance only |
| `app/api/internal/recent-sales` | Added, now uses privileged server client for reliability | `COMPLETED` | Maintenance only |
| `app/api/internal/deal-signals` | Added and connected to internal dashboard | `COMPLETED` | Maintenance only |

### D) Frontend Routes and Components

| File | Current state | Status | Next action |
|---|---|---|---|
| `app/listings/page.tsx` | Significant UX/perf gains (server seeding, pagination/filter controls, multiple layouts, timeout hardening) | `PARTIAL` | Continue decomposition into smaller modules with shared view-model helpers |
| `app/listings/[id]/page.tsx` | Rich detail experience shipped (FAA, avionics, comps/cost panel, diagnostics/fallbacks) | `PARTIAL` | Continue extracting section-level components and formatter helpers |
| `app/internal/deals/page.tsx` | Strong domain value, now includes presets/signals/recent sales; still dense business UI logic | `PARTIAL` | Move more ranking/presentation prep into typed helper modules |
| `app/internal/login/page.tsx` | Functionally stable | `PARTIAL` | Verify redirect/session UX consistency with current internal route policy |
| `app/layout.tsx` | Header/global nav improved with search + live count integration | `PARTIAL` | Keep route-level composition thin; avoid embedding domain logic |
| `app/components/CompsChart.tsx` | Implemented with mode toggles and diagnostics improvements | `COMPLETED` | Maintenance only; keep dynamic-loading/perf budget compliance |
| `app/listings/[id]/CompsChartPanel.tsx` | Integrated and actively used | `COMPLETED` | Maintenance only |
| `components/listings/*` | Older and newer patterns coexist | `PARTIAL` | Reconcile stale components and remove dead UI pathways |

### E) Legacy Helper Modules and Types

| File | Current state | Status | Next action |
|---|---|---|---|
| `lib/listings/queries.js` | Still present while repository pattern has become primary | `PARTIAL` | Continue shrinking usage and move canonical paths to repository layer |
| `lib/listings/normalize.js` | Useful adapter behavior but overlaps with route-side mapping | `PARTIAL` | Consolidate normalization ownership in one place |
| `lib/listings/format.js` | Helpful formatting utility | `PARTIAL` | Expand usage to remove duplicate inline formatters in route files |
| `lib/types.ts` | Useful but not yet complete single source of truth for all payloads | `PARTIAL` | Align with repository DTO contracts and scraper schema notes |

### F) Database and Migrations

| Area | Current state | Status | Next action |
|---|---|---|---|
| `supabase/migrations/*` | Additive migration cadence is strong and active through latest avionics/intelligence changes | `COMPLETED` | Keep sequential numbering and explicit view update discipline |
| `public_listings` view lifecycle | Functional but updated frequently via manual migration edits | `PARTIAL` | Add canonical current view SQL reference/checklist to reduce omission risk |
| Avionics migration set (`20260305000045`..`20260305000048`) | Phase 1/2 schema foundation and value-source extensions are in place | `PARTIAL` | Complete valuation cutover and explanation-source fields end-to-end |

## 4) Highest-Value Remaining Refactor Work

1. Finish repository convergence for any remaining mixed query paths.
2. Decompose oversized listing route files without changing user-facing behavior.
3. Consolidate formatting/normalization ownership to avoid parallel implementations.
4. Formalize a canonical `public_listings` view reference to reduce migration drift.
5. Complete avionics valuation cutover with explicit value-source/confidence provenance in scoring explanations.

## 5) Execution Sequence (Updated)

1. Repository convergence sweep (`lib/db/listingsRepository.ts` first, then route consumers).
2. Frontend decomposition of `app/listings/page.tsx` and `app/listings/[id]/page.tsx`.
3. Legacy helper reconciliation (`lib/listings/*` normalization/format split cleanup).
4. DB-view maintenance hardening (`public_listings` canonical reference workflow).
5. Intelligence map/config extraction and avionics cutover completion.

## 6) Operating Guardrails

- Use `.venv312\Scripts\python.exe` for Python execution.
- Use `lib/supabase/server.ts` factories for all server-side Supabase access.
- Keep schema validation in scraper write paths.
- Keep migrations additive and sequential under `supabase/migrations/`.
- Preserve intelligence versioning discipline whenever scoring behavior changes.

## 7) Notes

- This file is now a living file-by-file refactor tracker.
- `AGENTS.md` remains the primary project status board; update this plan when architecture-level status materially changes.
