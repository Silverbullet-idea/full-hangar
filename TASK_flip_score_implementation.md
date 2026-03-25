# TASK: Implement `flip_score` — Replace All Old Scoring Site-Wide

**Agent lane:** BACKEND then FRONTEND (run sequentially, not in parallel)
**Scope:** `core/intelligence/`, `scraper/`, `supabase/migrations/`, `lib/db/`, `app/`
**Intelligence version bump:** `1.9.4` → `2.0.0`

Read `AGENTS.md` before starting. Write progress to AGENTS.md after each phase.

---

## What This Task Does

Replaces the dual `value_score` / `deal_rating` (EXCEPTIONAL/GOOD/FAIR/WEAK/POOR) scoring
system with a single `flip_score` (0–100) oriented around flip profitability, displayed
everywhere the old scores appeared.

### What changes
- `flip_score` + `flip_tier` (HOT/GOOD/FAIR/PASS) become the only scores shown in the UI
- `deal_rating` label (EXCEPTIONAL/GOOD/FAIR/WEAK/POOR) is removed from all UI surfaces
- Old sub-score pillar bars (`investment_score`, `execution_score`, `market_opportunity_score`)
  are removed from the detail page; replaced by the four flip pillars
- Filters using EXCEPTIONAL/GOOD buckets are remapped to HOT/GOOD/FAIR/PASS
- Deal Desk health checklist and score drill-down are updated to reference `flip_score`
- Admin scoring tab, market intel flip section, beta dashboard, and deal-signals API updated

### What does NOT change
- `value_score` DB column — keep computing it internally (feeds P1 fallback), just hide it
- `deal_rating` DB column — keep in DB, just remove from UI
- Deal Desk P&L wizard (9-step cash flow calculator) — untouched, it has its own math
- Engine / avionics / condition filter sliders — keep, just rename labels if needed
- Deal Desk step 3 "steam gauge" upgrade nudge — this is deal advice, not a score display
- Deal Desk PDF export — no scores rendered there currently
- Any migration below `20260324200075`

---

## Do NOT Touch

- `browser-extension/`
- `scraper/` provider files (controller, tap, aso, avbuyer, etc.)
- `scraper/backfill_scores.py` except the write-path additions in Phase 3
- `core/intelligence/avionics_intelligence.py`, `stc_intelligence.py`, `listing_quality.py`
- Any avionics catalog or observation tables
- Deal Desk P&L arithmetic (`DealDeskPageClient.tsx` financial sections)

---

## Phase 1 — New Scoring Module

### 1A. Create `core/intelligence/flip_score.py`

Create this file from scratch:

```python
"""
flip_score: 0–100 flip-opportunity composite score.

Replaces value_score as the primary displayed score site-wide.
value_score continues to be computed internally as an input signal.

Four pillars:
  P1  Pricing Edge          0–35 pts  (true cost vs comp median)
  P2  Airworthiness Base    0–20 pts  (engine life + risk level)
  P3  Improvement Headroom  0–30 pts  (avionics gap + condition gap)
  P4  Exit Liquidity        0–15 pts  (model demand + days on market)

Hard caps:
  risk_level == CRITICAL  ->  flip_score capped at 35
  asking_price missing/0  ->  flip_score = None, flip_tier = None

Tier labels:
  80+  HOT
  65+  GOOD
  50+  FAIR
  <50  PASS
"""

from __future__ import annotations
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Liquidity tier classification
# ---------------------------------------------------------------------------

_HIGH_LIQUIDITY = [
    "cessna 172", "cessna 182", "cessna 150", "cessna 152",
    "piper cherokee", "piper warrior", "piper archer", "piper arrow",
    "beechcraft musketeer", "beechcraft sundowner",
    "grumman aa5", "grumman cheetah", "grumman tiger",
    "mooney m20",
]
_MED_LIQUIDITY = [
    "cessna 210", "cessna 206", "cessna 205",
    "piper comanche", "piper lance", "piper seneca",
    "beechcraft bonanza", "beechcraft debonair",
    "cirrus sr20", "cirrus sr22",
    "diamond da40", "diamond da42",
    "robinson r22", "robinson r44",
]

_GLASS_PANEL_INDICATORS = {
    "g1000", "g2000", "g3000", "g5000",
    "avidyne entegra", "avidyne ifd",
    "g500 txi", "g600 txi", "g500", "g600",
    "g3x touch", "g3x",
    "aspen evo 1000",
}


def _has_glass_panel(listing: dict, score_data: dict) -> bool:
    avionics_score = score_data.get("avionics_score") or 0
    if avionics_score >= 75:
        return True
    di = listing.get("description_intelligence") or {}
    if isinstance(di, str):
        import json
        try:
            di = json.loads(di)
        except Exception:
            di = {}
    for unit in (di.get("avionics_detailed") or []):
        canonical = (unit.get("canonical_name") or "").lower()
        if any(ind in canonical for ind in _GLASS_PANEL_INDICATORS):
            return True
    notes = (listing.get("avionics_notes") or listing.get("avionics_description") or "").lower()
    if any(ind in notes for ind in _GLASS_PANEL_INDICATORS):
        return True
    return False


def _get_liquidity_tier(listing: dict) -> str:
    make  = (listing.get("make")  or "").lower().strip()
    model = (listing.get("model") or "").lower().strip()
    key   = f"{make} {model}".strip()
    for h in _HIGH_LIQUIDITY:
        if h in key:
            return "high"
    for m in _MED_LIQUIDITY:
        if m in key:
            return "medium"
    return "low"


def _p1_pricing_edge(listing: dict, score_data: dict) -> tuple[int, str]:
    ask = listing.get("asking_price") or 0
    if ask <= 0:
        return 0, "no_price"
    deferred    = score_data.get("deferred_maintenance_total") or 0
    true_cost   = ask + deferred
    comp_median = (
        score_data.get("comp_median_price")
        or score_data.get("market_median_price")
        or score_data.get("comp_price_median")
    )
    if comp_median and comp_median > 0:
        ratio = true_cost / comp_median
        if   ratio <= 0.72: pts = 35
        elif ratio <= 0.80: pts = 30
        elif ratio <= 0.87: pts = 24
        elif ratio <= 0.93: pts = 18
        elif ratio <= 0.98: pts = 12
        elif ratio <= 1.03: pts = 7
        elif ratio <= 1.10: pts = 3
        else:               pts = 0
        basis = f"true_cost_vs_comps:{ratio:.2f}"
    else:
        fallback_map = {
            "EXCEPTIONAL": 28, "GOOD": 20, "FAIR": 12,
            "WEAK": 5, "POOR": 2, "UNKNOWN": 10,
        }
        deal_rating = score_data.get("deal_rating") or "UNKNOWN"
        pts   = fallback_map.get(deal_rating, 10)
        basis = f"deal_rating_fallback:{deal_rating}"
    return pts, basis


def _p2_airworthiness(listing: dict, score_data: dict) -> tuple[int, str]:
    risk   = (score_data.get("risk_level") or "MODERATE").upper()
    ev_pct = score_data.get("ev_pct_life_remaining")
    if ev_pct is None:
        smoh = listing.get("engine_hours_smoh") or listing.get("time_since_engine_overhaul")
        tbo  = listing.get("engine_tbo_hours")
        if smoh is not None and tbo and tbo > 0:
            ev_pct = max(0.0, (1 - smoh / tbo) * 100)
    engine_pts = round(max(0, min(ev_pct, 100)) / 100 * 12) if ev_pct is not None else 5
    cond_score = score_data.get("condition_score") or 50
    risk_pts_map = {
        "LOW":      8,
        "MODERATE": min(6, round(cond_score / 100 * 8)),
        "HIGH":     3,
        "CRITICAL": 0,
    }
    cond_pts = risk_pts_map.get(risk, 4)
    return engine_pts + cond_pts, f"engine:{engine_pts}+risk:{cond_pts}({risk})"


def _p3_improvement_headroom(listing: dict, score_data: dict) -> tuple[int, str]:
    risk = (score_data.get("risk_level") or "MODERATE").upper()
    if risk == "CRITICAL":
        return 0, "critical_risk_no_headroom"
    glass = _has_glass_panel(listing, score_data)
    if glass:
        avionics_pts = 0
        av_basis     = "glass_panel_neutral"
    else:
        avionics_score = score_data.get("avionics_score") or 50
        avionics_pts   = round((1 - min(avionics_score / 100, 1.0)) * 15)
        av_basis       = f"steam_gauge:{avionics_score:.0f}"
    cond_score = score_data.get("condition_score") or 50
    if risk in ("CRITICAL", "HIGH"):
        cond_pts   = 2
        cond_basis = f"risk_{risk}_limited"
    else:
        cond_pts   = round((1 - min(cond_score / 100, 1.0)) * 15)
        cond_basis = f"condition:{cond_score:.0f}"
    return avionics_pts + cond_pts, f"avionics:{avionics_pts}({av_basis})+condition:{cond_pts}({cond_basis})"


def _p4_exit_liquidity(listing: dict, score_data: dict) -> tuple[int, str]:
    tier     = _get_liquidity_tier(listing)
    base_map = {"high": 12, "medium": 8, "low": 4}
    base     = base_map[tier]
    dom      = listing.get("days_on_market") or 0
    if   dom > 270: dom_penalty = 5
    elif dom > 180: dom_penalty = 4
    elif dom > 90:  dom_penalty = 2
    elif dom > 45:  dom_penalty = 1
    else:           dom_penalty = 0
    fresh_bonus = 2 if dom <= 7 else 0
    p4 = max(0, min(15, base - dom_penalty + fresh_bonus))
    return p4, f"tier:{tier}(base:{base})-dom:{dom_penalty}+fresh:{fresh_bonus}"


def compute_flip_score(listing: dict, score_data: dict) -> dict:
    """
    Returns dict with keys:
        flip_score       int | None
        flip_tier        str | None   ('HOT', 'GOOD', 'FAIR', 'PASS')
        flip_explanation dict
    """
    ask = listing.get("asking_price") or 0
    if ask <= 0:
        return {"flip_score": None, "flip_tier": None,
                "flip_explanation": {"suppressed": "no_disclosed_price"}}
    try:
        p1, p1b = _p1_pricing_edge(listing, score_data)
        p2, p2b = _p2_airworthiness(listing, score_data)
        p3, p3b = _p3_improvement_headroom(listing, score_data)
        p4, p4b = _p4_exit_liquidity(listing, score_data)
    except Exception as exc:
        logger.warning("flip_score pillar error: %s", exc, exc_info=True)
        return {"flip_score": None, "flip_tier": None,
                "flip_explanation": {"error": str(exc)}}
    raw  = p1 + p2 + p3 + p4
    risk = (score_data.get("risk_level") or "MODERATE").upper()
    if risk == "CRITICAL":
        raw = min(raw, 35)
    flip_score = max(0, min(100, raw))
    tier = "HOT" if flip_score >= 80 else "GOOD" if flip_score >= 65 else "FAIR" if flip_score >= 50 else "PASS"
    return {
        "flip_score": flip_score,
        "flip_tier":  tier,
        "flip_explanation": {
            "p1_pricing_edge":     {"pts": p1, "max": 35, "basis": p1b},
            "p2_airworthiness":    {"pts": p2, "max": 20, "basis": p2b},
            "p3_improvement_room": {"pts": p3, "max": 30, "basis": p3b},
            "p4_exit_liquidity":   {"pts": p4, "max": 15, "basis": p4b},
            "raw_total":           raw,
            "risk_cap_applied":    risk == "CRITICAL",
        },
    }
```

### 1B. Edit `core/intelligence/aircraft_intelligence.py`

Three targeted edits only. Do not restructure any other logic.

**Edit 1 — Add import** (after existing intelligence imports):
```python
from core.intelligence.flip_score import compute_flip_score
```

**Edit 2 — Bump version:**
```python
INTELLIGENCE_VERSION = "2.0.0"
```

**Edit 3 — Call compute_flip_score** at the very end of the main scoring function,
after all existing `score_data` fields are assembled, before return:
```python
_flip = compute_flip_score(listing_dict, score_data)
score_data["flip_score"]       = _flip["flip_score"]
score_data["flip_tier"]        = _flip["flip_tier"]
score_data["flip_explanation"] = _flip["flip_explanation"]
```

If the function receives keyword args rather than a dict, build `listing_dict` from
available locals (asking_price, make, model, days_on_market, engine_hours_smoh,
description_intelligence, avionics_notes) before calling.

---

## Phase 2 — Database Migration

File: `supabase/migrations/20260324200075_add_flip_score_columns.sql`

```sql
ALTER TABLE aircraft_listings
  ADD COLUMN IF NOT EXISTS flip_score       INTEGER,
  ADD COLUMN IF NOT EXISTS flip_tier        TEXT,
  ADD COLUMN IF NOT EXISTS flip_explanation JSONB;

CREATE INDEX IF NOT EXISTS idx_aircraft_listings_flip_score
  ON aircraft_listings (flip_score DESC NULLS LAST)
  WHERE flip_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_aircraft_listings_flip_tier
  ON aircraft_listings (flip_tier)
  WHERE flip_tier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_aircraft_listings_flip_score_active
  ON aircraft_listings (flip_score DESC NULLS LAST)
  WHERE flip_score IS NOT NULL AND is_active = TRUE;
```

After creating this file, update the `public_listings` view (find with
`grep -r "CREATE OR REPLACE VIEW public_listings" supabase/`) to add
`al.flip_score, al.flip_tier` to the SELECT list. Apply via `npx supabase db push`.
Update `PUBLIC_LISTINGS_VIEW.md` if it exists.

---

## Phase 3 — Backfill

### 3A. Update `scraper/backfill_scores.py`

In the `update_payload` build block, add:
```python
update_payload["flip_score"] = score_data.get("flip_score")
update_payload["flip_tier"]  = score_data.get("flip_tier")
```
Also add both to any `SCORE_COLUMNS` list used by resume logic.

### 3B. Run

```powershell
.venv312\Scripts\python.exe scraper\backfill_scores.py --limit 5 --dry-run
# Confirm flip_score + flip_tier in payload log

.venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps
```

---

## Phase 4 — Repository and API Layer

### 4A. `lib/db/listingsRepository.ts`

Add `flip_score` and `flip_tier` to every column selection constant. Search for
`value_score` and add `flip_score` beside each occurrence.

### 4B. `/api/listings` route — sort options

Add and set as default:
```typescript
{ value: 'flip_desc', label: 'Best flip opportunity', column: 'flip_score', direction: 'desc' },
{ value: 'flip_asc',  label: 'Flip score (low first)', column: 'flip_score', direction: 'asc'  },
```
Map legacy sort key `deal_desc` -> `flip_desc` as alias. Remove `value_score_desc`.

### 4C. `/api/listings/[id]/full`

Ensure `flip_score`, `flip_tier`, `flip_explanation` are in the response payload.

### 4D. `/api/internal/deal-signals` route

Remove `deal_rating` from the response payload. Replace with `flip_score` and `flip_tier`.
Update any TypeScript interfaces that reference `deal_rating` in this route.

---

## Phase 5 — Listing Cards (Browse)

### 5A. Replace score references

Search `ListingCard` component files for `value_score`, `deal_tier`, `deal_rating`.
Replace with `flip_score` / `flip_tier`.

### 5B. Tier chip color config (define once, import everywhere)

```typescript
// lib/scoring/flipTierConfig.ts  (create this file)
export const FLIP_TIER_CONFIG: Record<string, {
  label: string; bg: string; text: string; ring: string
}> = {
  HOT:  { label: 'HOT',  bg: 'bg-orange-500',  text: 'text-white',     ring: 'ring-orange-400' },
  GOOD: { label: 'GOOD', bg: 'bg-emerald-500', text: 'text-white',     ring: 'ring-emerald-400' },
  FAIR: { label: 'FAIR', bg: 'bg-amber-400',   text: 'text-amber-900', ring: 'ring-amber-300'  },
  PASS: { label: 'PASS', bg: 'bg-slate-300',   text: 'text-slate-700', ring: 'ring-slate-200'  },
};
```

Import `FLIP_TIER_CONFIG` in every component that renders a tier chip.
Do not duplicate the color definitions — import from this single source file.

### 5C. Null / undisclosed handling

Where `flip_score === null`, render no score badge at all. Same pattern already
in place for undisclosed-price listings (v1.9.4) — just swap the field reference.

### 5D. aria-labels
```typescript
aria-label={`Flip opportunity score: ${flip_score} out of 100, tier: ${flip_tier}`}
```

---

## Phase 6 — Browse Page Filters and Sort

Files: `app/listings/page.tsx`, `ListingsClient`, sidebar filter component.

### 6A. Deal type filter

Replace the EXCEPTIONAL/GOOD/FAIR/WEAK/POOR options with:
```typescript
const dealTypeOptions = [
  { value: 'HOT',  label: 'HOT — top flip opportunities' },
  { value: 'GOOD', label: 'GOOD — solid deals'            },
  { value: 'FAIR', label: 'FAIR — worth a look'           },
  { value: 'PASS', label: 'PASS — not competitive'        },
];
```
Wire to `flip_tier` column in API query params and `getListingsPage`.

### 6B. Sort dropdown default

Change default from `deal_desc` to `flip_desc`.

### 6C. Engine / avionics / condition pillar sliders

Keep these — they filter on data fields, not score labels. Verify no label text
says "deal score" or references old tier names. Rename any label that says
"Deal tier" or "Value score" to "Flip score" and bind to `flip_score`.

### 6D. URL backward compatibility

Silently ignore `?dealRating=EXCEPTIONAL` or `?tier=GOOD` old params rather than
returning an error or zero results.

---

## Phase 7 — Listing Detail Page

File: `app/listings/[id]/page.tsx` and its section-level components.

### 7A. Score hero badge

Replace `value_score` + `deal_tier` with `flip_score` + `flip_tier`.
Use `FLIP_TIER_CONFIG` from Phase 5B. Add contextual sentence:
```
"flip_score measures how well-positioned this aircraft is for a profitable resale."
```

### 7B. Remove old pillar bar section; add flip pillars

Remove the existing bars for `investment_score`, `execution_score`,
`market_opportunity_score`. Replace entirely with:

```typescript
const explanation = listing.score_data?.flip_explanation ?? listing.flip_explanation;
const pillars = [
  { label: 'Pricing edge',     pts: explanation?.p1_pricing_edge?.pts,     max: 35, color: 'orange' },
  { label: 'Airworthiness',    pts: explanation?.p2_airworthiness?.pts,     max: 20, color: 'blue'   },
  { label: 'Improvement room', pts: explanation?.p3_improvement_room?.pts,  max: 30, color: 'teal'   },
  { label: 'Exit liquidity',   pts: explanation?.p4_exit_liquidity?.pts,    max: 15, color: 'purple' },
];
```
Render each as a labeled progress bar showing `pts / max` (e.g. "28 / 35").

### 7C. Remove deal_rating text blocks

Remove any rendered text showing "EXCEPTIONAL deal", "GOOD deal", "FAIR deal",
"WEAK deal", "POOR deal". Do not replace with flip tier text — the hero badge
already conveys this.

### 7D. score_explanation field

If `score_explanation` contains old tier keywords (EXCEPTIONAL, GOOD deal, FAIR deal,
WEAK, POOR), suppress the field entirely in the UI. The four flip pillar bars now
carry the explanation load. Do not rename the DB column.

### 7E. Pricing section deal_rating label

If the pricing/comps section shows "Deal rating: GOOD" or similar, remove that label.
The hero badge already conveys deal quality.

---

## Phase 8 — Deal Desk

Files: `app/internal/deal-desk/[listingId]/page.tsx`, `DealDeskPageClient.tsx`,
`DealDeskHealthScoreDrilldown` component.

### 8A. DO NOT TOUCH

The 9-step P&L wizard, all financial inputs, sensitivity grid, acquisition capex,
financing, exit costs, carrying cost calculations, PDF/print export, and the step 3
"steam gauge" avionics upgrade nudge chip.

### 8B. Health checklist

- Replace `value_score` with `flip_score`
- Replace `deal_rating` badge (EXCEPTIONAL/GOOD/etc.) with `flip_tier` badge
  using `FLIP_TIER_CONFIG`
- Keep `avionics_score`, `risk_level`, `ev_pct_life_remaining`, `faaMatched` as-is

### 8C. Score drill-down panel (`DealDeskHealthScoreDrilldown`)

Remove: `investment_score`, `execution_score`, `market_opportunity_score`,
`mispricing_zscore`, `pricing_confidence` as standalone displayed fields.

Replace with the four flip pillar breakdown using the same `<details>` group pattern:
```
P1 Pricing edge       pts / 35
P2 Airworthiness      pts / 20
P3 Improvement room   pts / 30
P4 Exit liquidity     pts / 15
```
Keep: engine `score_data` section (ev_explanation, SMOH/TBO — useful P&L context).
Keep: accident/NTSB signals section.

---

## Phase 9 — Internal Deals Page

File: `app/internal/deals/page.tsx`

- Replace `value_score` column with `flip_score`
- Replace `deal_tier` chip with `flip_tier` chip using `FLIP_TIER_CONFIG`
- Replace default sort with `flip_score DESC`
- Remove `deal_rating` text labels (EXCEPTIONAL/GOOD/FAIR/WEAK/POOR) from deal-signal
  cards and row annotations; replace with `flip_tier` chip only
- Remap any deal quality filter on this page to HOT/GOOD/FAIR/PASS buckets

---

## Phase 10 — Market Intel Room

File: `app/internal/market-intel/page.tsx` and section components.

### 10A. Flip analysis section (Section 7)

- Replace EXCEPTIONAL/GOOD/FAIR/WEAK/POOR distribution chart with HOT/GOOD/FAIR/PASS
- Replace `deal_rating` axis/filter labels with `flip_tier`
- Replace any "score" metric shown with `flip_score`

### 10B. Price driver analysis

Replace `deal_rating` filter or axis labels with `flip_tier`.

### 10C. Grep and clean

`grep -r "deal_rating\|value_score\|deal_tier" app/internal/market-intel/`
Replace all UI-visible references. DB query strings referencing the columns are fine.

---

## Phase 11 — Admin Portal Scoring Tab

Files: `app/internal/admin/page.tsx`, `/api/internal/admin/` scoring routes.

### 11A. Scoring tab UI

Replace:
- Old tier integrity banner -> flip score integrity: `flip_score IS NULL WHERE asking_price > 0`
- Old tier distribution cards (EXCEPTIONAL/GOOD/FAIR/WEAK/POOR counts) -> HOT/GOOD/FAIR/PASS counts
- Old pillar matrix (investment/execution/mkt scores) -> remove entirely

Keep untouched: engine intelligence section, avionics section, data quality section.

### 11B. Admin API routes

In scoring-distribution queries, replace `deal_rating` and `value_score` groupings
with `flip_tier` and `flip_score` in the SQL.

---

## Phase 12 — Beta Dashboard

File: `app/beta/dashboard/page.tsx` and related components.

Grep for `value_score`, `deal_rating`, `deal_tier`. Replace all display references:
- Aircraft preview panel score -> `flip_score`
- Tier chip -> `flip_tier` using `FLIP_TIER_CONFIG`
- "Deal rating" label -> remove or replace with flip tier chip

---

## Phase 13 — Homepage Score Card

File: `app/page.tsx` — hero section hardcoded score card.

- Score label: "Value score" / "Deal score" -> "Flip score"
- Tier badge: if showing "EXCEPTIONAL" or old tier -> use "HOT"
- Any descriptive copy referencing old scoring language -> update

---

## Phase 14 — Validation

Run in order. Do not proceed past a failing check.

```powershell
# 1. Module imports cleanly
.venv312\Scripts\python.exe -c "from core.intelligence.flip_score import compute_flip_score; print('OK')"

# 2. Version confirmed
.venv312\Scripts\python.exe -c "from core.intelligence.aircraft_intelligence import INTELLIGENCE_VERSION; print(INTELLIGENCE_VERSION)"
# Expected: 2.0.0

# 3. Dry-run single listing — confirm flip_score + flip_tier in payload
.venv312\Scripts\python.exe scraper\backfill_scores.py --limit 1 --dry-run

# 4. Full backfill
.venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps

# 5. Score validation
.venv312\Scripts\python.exe scraper\validate_scores.py

# 6. Distribution check (run in Supabase SQL editor):
#    SELECT flip_tier, COUNT(*) FROM aircraft_listings
#    WHERE flip_score IS NOT NULL GROUP BY flip_tier ORDER BY COUNT(*) DESC;
#    Target: HOT 5–15%, GOOD 20–25%, FAIR 30–40%, PASS remainder

# 7. Grep check — no old labels in UI render paths:
#    grep -r "EXCEPTIONAL\|deal_rating\|deal_tier" app/ --include="*.tsx" --include="*.ts"
#    Hits should only be in DB query strings or comments, not in JSX render output.
#    grep -r "value_score" app/ --include="*.tsx" --include="*.ts"
#    Should return zero results.

# 8. Dev server smoke
npm run dev
# Verify each surface:
#   /listings               flip_score on cards, default sort = "Best flip opportunity"
#                           deal type filter shows HOT/GOOD/FAIR/PASS
#   /listings/[any-id]      score hero = flip_score, four flip pillar bars visible
#                           zero "EXCEPTIONAL"/"GOOD deal"/"FAIR deal" text on page
#   /internal/deals         flip_score column, flip_tier chips, no old tier labels
#   /internal/market-intel  flip analysis shows HOT/GOOD/FAIR/PASS
#   /internal/deal-desk/[id] health checklist = flip_score + flip_tier
#                            P&L wizard numbers unchanged
#   /internal/admin         scoring tab shows flip tier counts
#   /beta/dashboard         flip_score in aircraft preview panel
#   / (homepage)            hero score card says "Flip score"
```

**Expected distribution:**
- HOT (80+):  5–15%
- GOOD (65+): 20–25%
- FAIR (50+): 30–40%
- PASS (<50): 20–35%

If HOT > 20%: tighten P1 ratio thresholds.
If PASS > 60%: comp data may be sparse — check P1 fallback path.

---

## Completion Checklist

**Backend**
- [x] `core/intelligence/flip_score.py` created, imports cleanly
- [x] `INTELLIGENCE_VERSION` = `"2.0.0"`
- [x] `flip_score` + `flip_tier` in scoring output dict
- [x] Migration `20260324200075` applied, `public_listings` view rebuilt (plus `20260324200076` filter-options RPC)
- [x] `backfill_scores.py` writes `flip_score` + `flip_tier`
- [x] Full backfill completed (`--all`, plus `--all --compute-comps` for comps bands)
- [x] `validate_scores.py` passes

**API / Repository**
- [x] `listingsRepository.ts` — `flip_score`, `flip_tier` in all column lists
- [x] Default sort = `flip_desc`
- [x] `deal-signals` API no longer returns `deal_rating` (flip fields instead)
- [x] `/api/listings/[id]/full` returns `flip_score`, `flip_tier`, `flip_explanation`
- [x] `/api/listings/[id]/comps` + `CompsChart`: `flip_score` / `flip_tier` for sizing + tooltips (legacy columns as fallback only)

**Frontend**
- [x] `lib/scoring/flipTierConfig.ts` created — single source for tier colors
- [x] `ListingCard` (tile/row/compact): `flip_score` + HOT/GOOD/FAIR/PASS chip
- [x] Browse deal-type filter: HOT/GOOD/FAIR/PASS, wired to `flip_tier`
- [x] Browse default sort: "Best flip opportunity"
- [x] Listing detail: `flip_score` hero, four flip pillar bars
- [x] Listing detail: no legacy deal-rating *copy* on hero/pillars (URL/preset tokens like `EXCEPTIONAL_DEAL` may remain for backward compatibility per Phase 6D)
- [x] Listing detail: old sub-score bars (investment/execution/mkt) removed
- [x] Deal Desk health checklist: `flip_score` + `flip_tier`
- [x] Deal Desk score drill-down: four flip pillars only
- [x] `/internal/deals`: `flip_score` col, `flip_tier` chips
- [x] Market Intel: HOT/GOOD/FAIR/PASS in flip analysis section; summary route uses `flip_score` for submodel avg score
- [x] Admin overview + scoring tab: flip distribution, tier mix, integrity metrics; old five-pillar / EXCEPTIONAL tier cards removed; buyer-intel highlights use `flip_score` / `flip_tier`
- [x] Beta dashboard: top deals ordered by `flip_score`, tier chip + label
- [x] Homepage: "Flip score" label, "HOT" tier badge (prior pass)
- [x] `PUBLIC_LISTINGS_VIEW.md` documents `flip_*` view columns

**Final**
- [ ] Grep check: **not strict-zero** — `value_score` / `deal_rating` / `EXCEPTIONAL` still appear in some `app/**/*.ts(x)` files (internal APIs, source-quality CSV columns, URL preset keys, completeness metadata). Product surfaces called out in this task are on flip.
- [ ] Dev server smoke: all 9 pages verified (manual — run when convenient)
- [ ] Git commit: `feat(scoring): implement flip_score v2.0.0 — single score site-wide` (optional; do when you bundle the release)
- [x] `AGENTS.md` updated (flip rollout + backfill/comps note, Mar 25, 2026)

---

## AGENTS.md additions (paste after completion)

**Completed Recently:**
```
- flip_score v2.0.0: single flip-oriented score (0–100) replaces value_score + deal_rating
  site-wide. Four pillars: pricing edge (35), airworthiness (20), improvement headroom (30),
  exit liquidity (15). Tiers: HOT/GOOD/FAIR/PASS. DB columns added, full backfill complete.
  Intelligence version 2.0.0. All old labels (EXCEPTIONAL/GOOD/FAIR/WEAK/POOR) removed
  from all UI surfaces. flip_tier config centralized at lib/scoring/flipTierConfig.ts.
```

**Current Focus:**
```
- flip_score distribution tuning: review HOT/GOOD/FAIR/PASS split post-backfill and
  adjust P1 ratio thresholds if HOT > 15%. Target: HOT 5–15%, PASS < 40%.
```
