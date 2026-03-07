# Full Hangar — Tier 1 Agent Prompts
# Generated: March 6, 2026
# Paste each section into a fresh Cursor agent. Run all three simultaneously.

---

## ╔══════════════════════════════════════╗
## ║  BACKEND AGENT — Avionics Backfill  ║
## ╚══════════════════════════════════════╝

### Context

You are a BACKEND agent on the Full Hangar project. Read `AGENTS.md` in the project root
before doing anything else. This file is your source of truth for current project state,
conventions, and guardrails.

**Your Python runtime is always:** `.venv312\Scripts\python.exe`
**Project root:** `D:\Documents\$$Full Hangar\2.0\CursorReposity\full-hangar\`
**Dev server runs on:** `localhost:3001`

### Your Task

The avionics intelligence system (Task 11) is complete through Phase 5, but a database-wide
attribution audit shows a large population of listings with NULL or unscored avionics data:

- `null` avionics attribution: ~2,890 listings
- `none` attribution: ~540 listings
- `fallback_static`: ~121 listings (scored, but low-quality)

These gaps mean users on the public platform will see inconsistent scoring — some listings
with rich avionics breakdowns, others with nothing. Fix this before commercialization.

### Step-by-Step Instructions

**STEP 1 — Confirm current attribution baseline**

Run the following and capture the output:

```
.venv312\Scripts\python.exe -c "
from scraper.backfill_scores import get_supabase
sb = get_supabase()
res = sb.table('aircraft_listings').select('avionics_value_source_primary', count='exact').execute()
from collections import Counter
counts = Counter(r['avionics_value_source_primary'] for r in res.data)
print(dict(counts))
"
```

If that query pattern doesn't work, use the Supabase MCP or run a SQL query instead:

```sql
SELECT avionics_value_source_primary, COUNT(*) as cnt
FROM aircraft_listings
GROUP BY avionics_value_source_primary
ORDER BY cnt DESC;
```

Save this output. You will compare against it at the end to confirm improvement.

---

**STEP 2 — Diagnose why nulls exist**

Before running a blind backfill, understand why the nulls are there. Run:

```
.venv312\Scripts\python.exe scraper\audit_avionics_coverage.py
```

Then inspect a sample of null-attribution listings to determine the pattern. Run:

```sql
SELECT id, make, model, year, description, avionics_value_source_primary,
       avionics_installed_value, avionics_detected
FROM aircraft_listings
WHERE avionics_value_source_primary IS NULL
  AND description IS NOT NULL
LIMIT 20;
```

Determine: do these listings have descriptions? If yes, the parser hasn't run on them.
If descriptions are blank/null, that's a separate data quality issue — flag it but don't
block the backfill on it.

---

**STEP 3 — Run the full database backfill**

This is the primary fix. Run backfill against ALL listings with comps recomputation:

```
.venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps
```

This will take a while on a large DB. If the process is too slow or times out, use
the `--limit` flag in batches of 500 and loop:

```
.venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps --limit 500
```

Run in batches until no more rows are updated (the script reports `updated=0`).

Monitor for failures. If you see consistent `failed > 0`, inspect the error and fix
the root cause before continuing — don't just retry blindly.

---

**STEP 4 — Run the avionics coverage audit post-backfill**

```
.venv312\Scripts\python.exe scraper\audit_avionics_coverage.py
```

Check `matched_rate_pct` and `unresolved_rows`. If unresolved tokens appear frequently,
run the alias expansion loop:

```sql
SELECT raw_token, COUNT(*) as frequency
FROM avionics_listing_observations
WHERE match_type = 'unresolved'
GROUP BY raw_token
ORDER BY frequency DESC
LIMIT 20;
```

For any token appearing 5+ times: add it to the parser alias map in
`scraper/description_parser.py` and the catalog in `scraper/avionics_catalog_builder.py`,
then rerun the observation backfill:

```
.venv312\Scripts\python.exe scraper\avionics_market_ingest.py --segment piston_single --apply
.venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps --limit 200
```

---

**STEP 5 — Validate the intelligence test suite is still green**

```
.venv312\Scripts\python.exe -m pytest scraper\tests\test_avionics_intelligence.py -v
.venv312\Scripts\python.exe -m pytest scraper\tests\test_intelligence.py -v
```

All tests must pass before you mark this task done. If any test fails, fix it.

---

**STEP 6 — Capture the post-backfill attribution snapshot**

Rerun the attribution count query from Step 1 and compare. Document both snapshots
(before/after) in a new file: `logs\avionics_backfill_tier1_YYYYMMDD.md`

Format:
```
## Avionics Attribution — Tier 1 Backfill
Date: [date]

### Before
oem_msrp: X
market_p25: X
fallback_static: X
none: X
null: X
total: X

### After
oem_msrp: X
market_p25: X
fallback_static: X
none: X
null: X
total: X

### Notes
[Any alias expansions made, errors encountered, or follow-up items]
```

---

**STEP 7 — Validate scores in DB**

```
.venv312\Scripts\python.exe scraper\validate_scores.py
```

If the validator reports anomalies, investigate and resolve before closing this task.

---

### When You Finish

1. Update `AGENTS.md` — move this task to ✅ Completed with a one-line summary and
   the attribution delta (e.g., "null: 2890 → 47, oem_msrp: 364 → 891")
2. Commit: `git add -A && git commit -m "feat: tier1 avionics full-db backfill, attribution delta [before→after]"`
3. Note any remaining null listings that could not be scored (e.g., missing descriptions)
   as a follow-up item in AGENTS.md

---
---

## ╔══════════════════════════════════════════╗
## ║  FRONTEND AGENT — Component Decomposition ║
## ╚══════════════════════════════════════════╝

### Context

You are a FRONTEND agent on the Full Hangar project. Read `AGENTS.md` in the project root
before doing anything else.

**Dev server:** `localhost:3001`  
**Project root:** `D:\Documents\$$Full Hangar\2.0\CursorReposity\full-hangar\`  
**Framework:** Next.js 16 with Turbopack, TypeScript, Tailwind CSS  
**DO NOT change any user-facing behavior, layout, or styling.**  
**DO NOT change any API calls, data fetching logic, or Supabase queries.**  
This is a pure structural refactor — move code into components, no behavior changes.

### Your Task

Three frontend files have grown too large to maintain safely:

1. `app/listings/page.tsx` — the main browse/search page
2. `app/listings/[id]/page.tsx` — the listing detail page
3. `app/internal/deals/page.tsx` — the internal deal-finder dashboard

Decompose each into well-named section-level components. The goal is that each page
file becomes a thin composition shell — it fetches data and renders named components,
with almost no inline JSX logic of its own.

### Ground Rules

- **Read each file fully before touching it.** These files are large. Understand every
  section before extracting anything.
- **One component at a time.** Extract, verify the page still works, then extract the next.
- **Check `localhost:3001` after every extraction** to confirm nothing visually changed.
- **Do not change prop names, data shapes, or API endpoints.**
- **Do not upgrade or change any npm packages.**
- **Do not modify files owned by BACKEND or MISC agents.**

### Step-by-Step Instructions

---

**PHASE 1 — `app/listings/page.tsx`**

Read the file. Identify the major visual sections. Typical candidates will be:

- Filter sidebar (make/model/price/risk/deal-rating controls)
- Top category/deals banner bar
- Results toolbar (layout switcher, sort, page size, count readout)
- Listing card grid (the tile/row/compact layout container)
- Pagination controls

For each section:

1. Create a new file under `app/listings/components/[SectionName].tsx`
2. Move the JSX for that section into the new component
3. Define clean TypeScript props — use existing types from `lib/types.ts` or `src/types/`
   wherever possible, do not create redundant type definitions
4. Import and use the component in `app/listings/page.tsx`
5. Check `localhost:3001/listings` — must look identical to before

Target end state for `app/listings/page.tsx`: under 150 lines, primarily imports +
data-fetching logic + component composition.

---

**PHASE 2 — `app/listings/[id]/page.tsx`**

Read the file. Identify the major panels. Typical candidates will be:

- Score summary panel (investment score, pricing confidence, comp tier)
- FAA snapshot & verification panel
- Airframe & engine panel
- Avionics & equipment panel
- Comp & cost chart panel (already partially extracted to `CompsChartPanel.tsx`)
- Price history panel
- Accident history row (within FAA panel or standalone)
- Image gallery
- Seller description block

For each panel:

1. Create a new file under `app/listings/[id]/components/[PanelName].tsx`
2. Move the JSX for that panel into the new component
3. Props should accept the listing data object (or a typed slice of it) — do not
   re-fetch data inside individual panel components
4. Import and use in `app/listings/[id]/page.tsx`
5. Check `localhost:3001/listings/[any valid id]` — must look identical to before

Target end state for `app/listings/[id]/page.tsx`: under 200 lines.

---

**PHASE 3 — `app/internal/deals/page.tsx`**

Read the file. This page has tabs (Priority Deals, Watchlist, Recently Sold, etc.)
and dense deal cards. Extract:

- Tab navigation bar
- Each tab's content panel as its own component
- Deal card (the individual card rendered in lists) — this is the highest-value
  extraction since the same card pattern likely repeats
- Filter/preset controls bar
- Deal explanation panel (the expandable breakdown when a deal is clicked)

For each:

1. Create under `app/internal/deals/components/[ComponentName].tsx`
2. Same rules as above — move JSX, define props, import back, verify at
   `localhost:3001/internal/deals` (use password `hangar-internal-2026`)

Target end state for `app/internal/deals/page.tsx`: under 150 lines.

---

**PHASE 4 — Shared formatter utilities (if time permits)**

During Phases 1-3 you will likely find the same formatting logic duplicated inline
across multiple files — things like:

- Formatting prices as `$XX,XXX`
- Formatting hours as `X,XXX hrs`
- Rendering deal tier labels and colors
- Rendering risk level badges

If you find 3+ instances of the same inline formatter: extract it into
`lib/listings/format.ts` (note: `.ts`, not `.js` — create this file if it doesn't
exist as TypeScript). Import from there instead of duplicating.

Do NOT rewrite existing `lib/listings/format.js` — just create the `.ts` companion
and add new utilities there. Existing callers of the `.js` file are untouched.

---

### Verification Checklist (Run Before Closing)

- [ ] `localhost:3001/listings` renders correctly with all filter/layout modes
- [ ] `localhost:3001/listings/[id]` renders a full detail page with no missing panels
- [ ] `localhost:3001/internal/deals` renders with all tabs and deal cards
- [ ] `npm run build` completes with no TypeScript errors
- [ ] No `console.error` output in the browser dev tools on any of the three pages

---

### When You Finish

1. Update `AGENTS.md` — add each new component file to ✅ Completed
2. Commit: `git add -A && git commit -m "refactor: decompose listings/detail/deals pages into section components"`
3. Note in AGENTS.md if any section was intentionally left inline (and why)

---
---

## ╔══════════════════════════════════════════════╗
## ║  MISC AGENT — Public Listings View Reference ║
## ╚══════════════════════════════════════════════╝

### Context

You are a MISC agent on the Full Hangar project. Read `AGENTS.md` in the project root
before doing anything else.

**Project root:** `D:\Documents\$$Full Hangar\2.0\CursorReposity\full-hangar\`  
**You own:** `*.md` docs, reference files, one-off scripts that don't touch active code.  
**Do not modify** any scraper, API route, or frontend file.  
**Do not run migrations** — document only, no DB changes.

### Your Task

The `public_listings` view in Supabase is updated frequently via one-off migrations.
There is no single source of truth for what the current view looks like. This causes
recurring bugs: agents edit it without knowing the full current column set, columns
get added to the table but not the view, and frontend devs discover missing fields
only at runtime.

Fix this permanently by creating two reference documents.

---

### Step-by-Step Instructions

**STEP 1 — Extract the current view definition**

Use the Supabase MCP to get the current view SQL. Run this query:

```sql
SELECT view_definition
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'public_listings';
```

Copy the full output. This is your source material for the next step.

If the MCP is unavailable, check `supabase/migrations/` for the most recent migration
that creates or replaces `public_listings`. Read all view-touching migrations in order
to reconstruct the current state.

---

**STEP 2 — Create `PUBLIC_LISTINGS_VIEW.md`**

Create this file in the project root. It must contain:

**Section 1 — Purpose**
One paragraph describing what `public_listings` is, who reads it (frontend API routes
via `listingsRepository.ts`), and what it should NOT contain (raw internal scoring
intermediates, service-role-only columns).

**Section 2 — Current Column Inventory**
A table with every column in the view:

| Column | Source Table | Type | Notes |
|--------|-------------|------|-------|
| id | aircraft_listings | uuid | Primary key |
| ... | ... | ... | ... |

Include every column. Group them logically:
- Identity & source (id, source, source_id, source_url, n_number)
- Aircraft specs (make, model, year, total_time_airframe, engine_time_since_overhaul, etc.)
- Pricing (asking_price, price_reduced, price_reduction_amount, vs_median_price, etc.)
- Scoring (value_score, risk_level, deal_rating, deal_tier, investment_score, etc.)
- Avionics (avionics_detected, avionics_installed_value, avionics_value_source_primary, etc.)
- Intelligence metadata (description_intelligence, manufacturer_tier, comp_tier, etc.)
- FAA & accident (faa_registration_status, has_accident_history, accident_count, etc.)
- Lifecycle (is_active, first_seen_date, last_seen_date, days_on_market, inactive_date)
- Media (primary_image_url, image_urls)

**Section 3 — Canonical View SQL**
The full current `CREATE OR REPLACE VIEW public_listings AS ...` SQL, formatted for
readability (one column alias per line). Add a comment at the top:

```sql
-- CANONICAL REFERENCE — Last verified: [date]
-- To update this view, follow the checklist in Section 4 of this document.
-- Do not edit this SQL directly — create a new migration and update this file.
```

**Section 4 — "Before You Touch This View" Checklist**

Every agent or developer who needs to add or change a column in `public_listings` must
follow this checklist:

```
[ ] 1. Read this file from top to bottom first.
[ ] 2. Check supabase/migrations/ — confirm the column already exists on aircraft_listings
        before adding it to the view. If the column doesn't exist, write the table migration
        first (new migration file), then a separate view migration.
[ ] 3. Create a new migration file using the next sequential timestamp:
        supabase/migrations/YYYYMMDDHHMMSS_update_public_listings_[description].sql
        Use CREATE OR REPLACE VIEW — never DROP VIEW.
[ ] 4. Copy the FULL current view SQL from Section 3 of this file into your migration,
        then add your column(s). Do not write a partial view.
[ ] 5. After applying the migration in Supabase, update Section 2 (column inventory)
        and Section 3 (canonical SQL) in this file.
[ ] 6. Run: npm run build — confirm no TypeScript errors from missing fields.
[ ] 7. Check localhost:3001/listings and localhost:3001/listings/[id] — confirm the
        new column appears where expected.
[ ] 8. Commit both the migration file AND the updated PUBLIC_LISTINGS_VIEW.md together.
```

**Section 5 — Known Gaps / Follow-up Items**

Note any columns that exist on `aircraft_listings` but are NOT in the view that
probably should be (based on what the frontend detail page tries to render).
Check `app/listings/[id]/page.tsx` and `lib/db/listingsRepository.ts` for any
field references that might be missing from the view.

Format as:
```
| Column | Why It Might Be Needed | Risk If Missing |
```

---

**STEP 3 — Audit the migration sequence**

Scan `supabase/migrations/` and list every migration that touches `public_listings`
(creates, replaces, or alters). Add to PUBLIC_LISTINGS_VIEW.md as:

**Section 6 — Migration History**

```
| Migration File | What Changed |
|----------------|-------------|
| 20260302000025_add_media_fields... | Added primary_image_url, image_urls |
| ...            | ...          |
```

This gives future agents a quick way to trace why a column exists.

---

**STEP 4 — Check AGENTS.md Pending Migrations section**

Look at the `🟡 Pending — Migrations to Apply in Supabase` section in `AGENTS.md`.
For any pending migration that touches `public_listings`, add a note next to it:
`⚠️ VIEW CHANGE — update PUBLIC_LISTINGS_VIEW.md after applying`

You are not applying any migrations. Just flagging them.

---

### When You Finish

1. Verify `PUBLIC_LISTINGS_VIEW.md` exists in the project root and is complete
2. Update `AGENTS.md` — add to ✅ Completed:
   `[x] Created PUBLIC_LISTINGS_VIEW.md with canonical view SQL, column inventory, migration checklist, and gap analysis`
3. Commit: `git add -A && git commit -m "docs: add PUBLIC_LISTINGS_VIEW.md canonical reference and migration checklist"`

---
---

## Quick Reference — Running All 3 Agents

Open three separate Cursor agent windows. Paste one prompt per window. They are
safe to run simultaneously:

| Agent | Owns | Risk Level |
|-------|------|-----------|
| BACKEND | `scraper/backfill_scores.py`, `scraper/avionics_*` | Medium — writes to DB |
| FRONTEND | `app/listings/`, `app/internal/deals/`, `lib/listings/format.ts` | Low — no behavior changes |
| MISC | `PUBLIC_LISTINGS_VIEW.md`, `AGENTS.md` (docs section only) | Very low — docs only |

**BACKEND** will take the longest (full DB backfill). Start it first.  
**MISC** will finish first — probably 30–60 minutes.  
**FRONTEND** is the most iterative — check the browser after each extraction.

When all three report done, run:
```
git log --oneline -5
```
to confirm three clean commits, then check `localhost:3001/listings` one final time
to verify nothing regressed.
