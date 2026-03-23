# Full Hangar — UI Overhaul Agent Prompt
**Agent Lane:** FRONTEND  
**Scope:** `app/` routes, `components/`, `lib/listings/`, global styles — NO backend, scraper, or migration changes  
**Git convention:** `feat(ui): <description>` commits per phase  
**Dev target:** `http://localhost:3001`  
**Read first:** `AGENTS.md` · `.cursor/rules/fullhangar.mdc`

---

## ⚠ CRITICAL RULES BEFORE STARTING

1. **Do NOT touch** any file under `scraper/`, `core/intelligence/`, `app/api/`, `lib/db/`, or `supabase/migrations/`.
2. **Do NOT alter** existing data-fetching logic, API contracts, or Supabase query shapes. Only change how data is *displayed*.
3. **Preserve all existing URL params** (`?category=`, `?make=`, `?model=`, `?minPrice=`, `?maxPrice=`, `?dealScore=`, etc.). Add new params; never remove or rename existing ones.
4. **Maintain dark/light theme parity** on every component. Every new class must have a `[data-theme="light"]` counterpart in `app/globals.css`.
5. **Keep ISR / `revalidate` settings** already in place on `app/listings/page.tsx` and `app/listings/[id]/page.tsx`. Do not add or remove `export const revalidate`.
6. **TypeScript strict compliance** — no `any` casts without justification. All new props must be typed.
7. **Write one git commit per phase** after verifying the dev server renders without console errors.
8. If a data field referenced in these specs does not yet exist on `public_listings`, render a graceful fallback (`—` or `null` guard) rather than crashing. Never fabricate data.

---

## DESIGN SYSTEM — APPLY GLOBALLY

Add these CSS custom properties to `:root` in `app/globals.css`. Do not overwrite existing variables — extend them. If a variable already exists with the same name, keep the existing value unless the new value is explicitly listed here.

```css
/* Typography — import in app/layout.tsx <head> */
/* Families: Barlow Condensed (400,600,700,800), DM Sans (300,400,500), DM Mono (400,500) */
/* Google Fonts URL:
   https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800
   &family=DM+Sans:wght@300;400;500
   &family=DM+Mono:wght@400;500
   &display=swap
*/

:root {
  /* Brand palette */
  --fh-orange: #FF9900;
  --fh-orange-burn: #AF4D27;
  --fh-orange-dim: rgba(255,153,0,0.12);
  --fh-orange-glow: rgba(255,153,0,0.18);
  --fh-border-orange: rgba(255,153,0,0.25);

  /* Surfaces */
  --fh-bg:  #0d1117;
  --fh-bg2: #141b24;
  --fh-bg3: #1a2332;
  --fh-bg4: #1f2b3e;
  --fh-border: rgba(255,255,255,0.07);

  /* Text */
  --fh-text:       #e8edf3;
  --fh-text-dim:   #7a8a9e;
  --fh-text-muted: #4a5568;

  /* Semantic */
  --fh-green:       #22c55e;
  --fh-green-dim:   rgba(34,197,94,0.12);
  --fh-green-glow:  rgba(34,197,94,0.22);
  --fh-amber:       #f59e0b;
  --fh-amber-dim:   rgba(245,158,11,0.12);
  --fh-red:         #ef4444;
  --fh-red-dim:     rgba(239,68,68,0.12);
  --fh-blue:        #3b82f6;
  --fh-blue-dim:    rgba(59,130,246,0.12);
  --fh-purple:      #8b5cf6;
  --fh-purple-dim:  rgba(139,92,246,0.12);
  --fh-pink:        #ec4899;

  /* Score tier colors (used everywhere a deal tier is shown) */
  --fh-tier-exceptional: #22c55e;
  --fh-tier-strong:      #FF9900;
  --fh-tier-good:        #3b82f6;
  --fh-tier-fair:        #7a8a9e;
}

[data-theme="light"] {
  --fh-bg:  #f0f2f5;
  --fh-bg2: #ffffff;
  --fh-bg3: #f4f6f9;
  --fh-bg4: #e8ecf0;
  --fh-border: rgba(0,0,0,0.09);
  --fh-text:       #111827;
  --fh-text-dim:   #374151;
  --fh-text-muted: #9ca3af;
}
```

**Grain overlay** — add once to `body::before` in `globals.css` (SVG noise, opacity 0.4, `pointer-events:none`, `z-index:0`, `position:fixed`). This creates the subtle film-grain texture seen across all pages.

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  opacity: 0.4;
  pointer-events: none;
  z-index: 0;
}
```

---

## PHASE 1 — Global Nav Update

**File:** `app/layout.tsx` (or wherever the `<Header>` / `<nav>` component lives)

### What to change

The global navigation bar should match this exact structure and styling:

```
[Logo + BETA badge]  [centered search bar 360px]  [live count pill] [⚡ Deal Desk] [📊 Market Intel]
```

**Logo area:**
- Logo SVG (the existing logo asset) + wordmark `Full` (light) `Hangar` (--fh-orange) in `Barlow Condensed 800 22px`
- `BETA` badge: `background: var(--fh-orange-dim)`, `border: 1px solid var(--fh-border-orange)`, `color: var(--fh-orange)`, `font: DM Mono 9px 700`, `letter-spacing: 1px`, `padding: 2px 6px`, `border-radius: 4px`

**Nav search bar:**
- `background: var(--fh-bg3)`, `border: 1px solid var(--fh-border)`, `border-radius: 8px`, `height: 36px`, `width: 360px`, `padding: 0 14px`
- Search icon left, filter icon right, placeholder: `"Search aircraft — N-number, make, model..."`
- Font: `DM Sans 13px`

**Right side:**
- Live count pill: `font: DM Mono 11px`, text format `{count} listings live`, count in `--fh-orange 600`
- `⚡ Deal Desk` button — links to `/internal/deal-desk`
- `📊 Market Intel` button — links to `/internal/market-intel`
- Both buttons: `background: var(--fh-orange-dim)`, `border: 1px solid var(--fh-border-orange)`, `color: var(--fh-orange)`, `font: DM Sans 12px 600`, `padding: 6px 14px`, `border-radius: 7px`
- Nav `height: 56px`, `background: rgba(13,17,23,0.92)`, `backdrop-filter: blur(16px)`, `border-bottom: 1px solid var(--fh-border)`, `position: sticky`, `top: 0`, `z-index: 100`

**Commit:** `feat(ui): update global nav — search, count pill, quick-action buttons`

---

## PHASE 2 — `/listings` Page Overhaul

**Files:**
- `app/listings/page.tsx` (or decomposed components under `app/listings/`)
- `app/listings/ListingsClient.tsx` (or equivalent client component)
- `components/listings/ListingCard.tsx` (create or update)

### 2A — Category Bar

Add a horizontally-scrolling pill bar **below the nav, above the deal tier bar**. This is a new UI row, not a replacement for existing filters.

```
CATEGORY: [All Aircraft (8,319)] [✈ Single Engine (4,821)] [✈✈ Multi-Engine (1,204)]
          [⚙ Turboprop (682)] [🚀 Jets (891)] [🚁 Helicopters (421)]
          | [🔥 Under $50K] [⚡ Price Drops] [📅 New Today]
```

**Implementation:**
- Component: `components/listings/CategoryBar.tsx`
- Map click → set URL param `?category=<value>` using `router.push` with existing params preserved
- Category values must use the same mapping already in `lib/listings/categoryMap.ts` (`piston_single`, `piston_multi`, `turboprop`, `jet`, `helicopter`)
- Quick filters: `under50k` → `?maxPrice=50000`, `priceDrops` → `?priceDropOnly=true`, `newToday` → `?addedToday=true`
- Active pill: `background: var(--fh-orange-dim)`, `border-color: var(--fh-orange)`, `color: var(--fh-orange)`, `font-weight: 600`
- Inactive pill: `border: 1px solid var(--fh-border)`, `color: var(--fh-text-dim)`, `border-radius: 20px`
- `overflow-x: auto`, `scrollbar-width: none` (hidden scrollbar)
- Bar bg: `var(--fh-bg2)`, `border-bottom: 1px solid var(--fh-border)`, `padding: 10px 20px`
- Category label "CATEGORY": `Barlow Condensed 10px 700`, `letter-spacing: 1.5px`, `text-transform: uppercase`, `color: var(--fh-text-muted)`
- Vertical `1px` divider `var(--fh-border)` separates aircraft types from quick filters

### 2B — Deal Tier Bar

Add a second bar row **below the category bar**. This replaces the existing deal filter dropdown if one exists, or is added fresh.

```
DEAL SCORE: [● EXCEPTIONAL (score 78+)] [● STRONG (65–77)] [● GOOD (50–64)] [● FAIR / ALL]
                                                         [spacer]  [Hide "Call for Price" ☐]  [Sort ▾]  [⊞ ≡]
```

**Implementation:**
- Component: `components/listings/DealTierBar.tsx`
- Tier pill click → set `?dealScore=exceptional|strong|good|all` URL param
- Tier colors exactly:
  - `exceptional`: bg `rgba(34,197,94,0.1)`, border `rgba(34,197,94,0.3)`, text `#22c55e` — active: border `#22c55e`, bg `rgba(34,197,94,0.2)`
  - `strong`: bg `rgba(255,153,0,0.1)`, border `rgba(255,153,0,0.3)`, text `#FF9900`
  - `good`: bg `rgba(59,130,246,0.1)`, border `rgba(59,130,246,0.3)`, text `#3b82f6`
  - `fair`: bg `rgba(122,138,158,0.1)`, border `rgba(122,138,158,0.3)`, text `var(--fh-text-dim)`
- Each tier pill has a 6px circle dot (`background: currentColor`, `border-radius: 50%`) before the label
- "Hide Call for Price" checkbox: `accent-color: var(--fh-orange)` → sets `?hidePriceUndisclosed=true`
- Sort select: `DM Sans 12px`, `background: var(--fh-bg3)`, `border: 1px solid var(--fh-border)`, options: Best Deal / Price ↑ / Price ↓ / Engine Life ↓ / Days Listed ↑ / Recently Added
- View toggle (grid/list): two small icon buttons, active one has `background: var(--fh-bg4)`
- Bar: `background: var(--fh-bg)`, `padding: 8px 20px`, `border-bottom: 1px solid var(--fh-border)`

### 2C — Pillar Legend Bar

Add a thin info bar **below the deal tier bar**, above the main layout. This explains the 5 pillar color system.

```
SCORE PILLARS: [■ Engine Health] [■ Avionics] [■ Listing Quality] [■ Market Value] [■ STC/Mods]
               [right-aligned: ⚠ Listings without a disclosed price are not scored...]
```

- Bar: `background: var(--fh-bg2)`, `border-bottom: 1px solid var(--fh-border)`, `padding: 8px 16px`
- Color squares: `width: 8px`, `height: 8px`, `border-radius: 2px`
  - Engine: `#22c55e`, Avionics: `#3b82f6`, Quality: `#FF9900`, Value: `#f59e0b`, STC/Mods: `#ec4899`
- Warning text: right-aligned, `font-size: 10px`, `color: var(--fh-text-muted)`, `font-style: italic`
- Text: `Barlow Condensed 10px 700 uppercase letter-spacing:1px` for "SCORE PILLARS:"

### 2D — Left Sidebar Filters (220px, no-scroll on 1080p)

**Sidebar specs:**
- `width: 220px`, `flex-shrink: 0`, `border-right: 1px solid var(--fh-border)`
- `background: var(--fh-bg2)`, `position: sticky`, `top: 120px` (accounts for nav + 3 bars above)
- `height: calc(100vh - 120px)`, `overflow-y: auto` (thin scrollbar fallback if viewport short)
- `padding: 10px 0`

**Filter sections** (in order from top to bottom) — each section: `padding: 0 12px 10px`, `border-bottom: 1px solid var(--fh-border)`, `margin-bottom: 10px`. Section title: `Barlow Condensed 10px 700 uppercase letter-spacing:1.5px color:var(--fh-text-muted)`, `margin-bottom: 8px`.

**Section 1 — Score Pillars (MIN threshold sliders)**
- Label: "Score Pillars" + orange `MIN` badge (`DM Mono 9px`)
- 4 rows: Engine Health / Avionics / Quality / Mkt Value
- Each row: pillar name `11px var(--fh-text-dim) width:76px` + `3px`-tall progress track (`background: var(--fh-border)`, `border-radius: 2px`) + value label `DM Mono 9px`
- Track fill colors (gradient):
  - Engine: `linear-gradient(90deg, #f59e0b, #22c55e)`
  - Avionics: `linear-gradient(90deg, #3b82f6, #7c3aed)`
  - Quality: `linear-gradient(90deg, #AF4D27, #FF9900)`
  - Value: `linear-gradient(90deg, #22c55e, #059669)`
- Wire to URL params `?minEngine=`, `?minAvionics=`, `?minQuality=`, `?minValue=` (add these to API if not present; backend can ignore unknown params gracefully)

**Section 2 — Price**
- Two `DM Mono 10px` inputs side-by-side: `$0` — `Any`
- Preset pills below (9px, `border-radius: 10px`): Under $30K | $30–50K | $50–100K | $100K+
- Each pill sets `?minPrice=` / `?maxPrice=`

**Section 3 — Year**
- Two inputs: `1960` — `2025` → `?minYear=` / `?maxYear=`

**Section 4 — Total Time (hrs)**
- Two inputs: `0` — `Any` → `?minTTAF=` / `?maxTTAF=`

**Section 5 — Engine Life**
- 5 checkboxes (multi-select, `accent-color: var(--fh-orange)`, `12px height/width`):
  - SNEW / Fresh | 75%+ remaining | 50–75% | 25–50% | Near / over TBO
- Wire to `?engineLife=snew,high,mid,low,neartbo` (comma-separated)
- Show live count next to each: `DM Mono 9px var(--fh-text-muted)`

**Section 6 — Avionics**
- 5 checkboxes: Glass / G1000 | GTN 750/650 | ADS-B Out | Autopilot | Steam Gauge Only
- Wire to `?avionics=glass,gtn,adsb,autopilot,steam`

**Section 7 — Deal Patterns**
- 5 checkboxes: Deferred Annual | Steam Gauge Discount | Geographic Arbitrage | Price Reduced | Long DOM (60+ days)
- Wire to `?dealPattern=deferred,steam,geo,reduced,longdom`

**Section 8 — Location**
- Single text input, `10px DM Mono`, `width: 100%`, `border-radius: 5px`
- Wire to `?location=` (pass-through to existing location filter if present)

### 2E — Listing Cards Redesign

**Component:** `components/listings/ListingCard.tsx`

Replace existing card with this exact structure (top → bottom):

```
┌─────────────────────────────────────────┐
│ [DEAL RIBBON top-left]    [SCORE BADGE top-right] │
│         IMAGE (180px tall)              │
│ [📅 12 days listed]  [↓ $2,500 drop]   │  ← overlaid badges
├─────────────────────────────────────────┤
│ 1978 Cessna 172N Skyhawk        (title) │
│ 📍 Spokane, WA — Controller.com (meta)  │
│ $38,500                          (price)│
│ True cost est. ~$41,200…         (sub)  │
│ ┌──────────┬──────────┐                 │
│ │Total Time│Engine Smo│  (spec grid 2×2)│
│ │4,210 hrs │380 hrs   │                 │
│ ├──────────┼──────────┤                 │
│ │Engine Mdl│Eng Life  │                 │
│ │O-320-H2AD│83% left  │                 │
│ └──────────┴──────────┘                 │
├─────────────────────────────────────────┤
│  [E:91▌] [A:72▌] [Q:85▌] [V:88▌][S:45▌] │  ← 5 pillar bars
├─────────────────────────────────────────┤
│ [controller] [N-matched]  [+ Watch] [View Report →] │
└─────────────────────────────────────────┘
```

**Deal Ribbon** (absolute, top:10px, left:10px, z-index:2):
- `backdrop-filter: blur(8px)`, `border-radius: 20px`, `padding: 4px 10px`, `font: DM Sans 10px 700`, `letter-spacing: 0.5px`
- A 5px circle dot before the text (`background: currentColor`)
- Exceptional: `bg rgba(0,0,0,0.7)`, `border 1px solid rgba(34,197,94,0.5)`, `color #22c55e`
- Strong: `border rgba(255,153,0,0.5)`, `color #FF9900`
- Good: `border rgba(59,130,246,0.5)`, `color #3b82f6`
- No-price: `border rgba(122,138,158,0.4)`, `color var(--fh-text-dim)`, text: "PRICE UNDISCLOSED"

**Score Badge** (absolute, top:10px, right:10px, z-index:2):
- `width: 40px`, `height: 40px`, `border-radius: 50%`
- `backdrop-filter: blur(8px)`, `border: 2px solid currentColor`
- `font: Barlow Condensed 16px 800`
- Exceptional: `bg rgba(0,0,0,0.7) color #22c55e`
- Strong: `color #FF9900`
- Good: `color #3b82f6`
- No-price: `color var(--fh-text-muted)`, content: `N/A` at `font-size: 10px`
- Below badge: "OVERALL" label, `position: absolute top:54px right:10px`, `DM Mono 8px`, `color: var(--fh-text-muted)`

**Card Image:**
- `height: 180px`, `overflow: hidden`, `background: var(--fh-bg3)`
- `img` with `object-fit: cover`, `transition: transform 0.4s`
- On card hover: image `transform: scale(1.04)`
- Days-listed badge: `position: absolute bottom:10px left:10px`, `bg rgba(0,0,0,0.75)`, `backdrop-filter: blur(8px)`, `DM Mono 10px`, `color: var(--fh-text-dim)`, `padding: 3px 8px`, `border-radius: 5px`
- Price-drop badge: `position: absolute bottom:10px right:10px`, `bg rgba(239,68,68,0.8)`, `color #fff`, `9px 700`, `border-radius: 5px`

**Card Body** `padding: 12px 14px 0`:
- Title: `Barlow Condensed 19px 700`, `color: var(--fh-text)`, `padding-right: 20px`
- Location: `11px var(--fh-text-muted)`, emoji icon prefix
- Price: `Barlow Condensed 26px 800`, `color: var(--fh-orange)`
- Price sub-line: `10px var(--fh-text-muted)`
- **For no-price listings:** replace price with a gray pill "Call for Price" + warning box: `font-size: 10px`, `font-style: italic`, `border-left: 2px solid rgba(122,138,158,0.3)`, `background: rgba(122,138,158,0.08)`, text: `"⚠ Deal scoring requires a disclosed price..."`
- **Spec grid:** `display: grid`, `grid-template-columns: 1fr 1fr`, `gap: 6px 10px`, `margin-top: 10px`
  - Each cell: label `DM Mono 9px 700 uppercase letter-spacing:1px color:var(--fh-text-muted)`, value `12px 500 color:var(--fh-text)`
  - Value color overrides: `good → var(--fh-green)`, `warn → var(--fh-amber)`, `bad → var(--fh-red)`
  - 4 cells: Total Time / Engine SMOH / Engine Model / Engine Life %

**Score Pillars Section** `padding: 10px 14px 12px`, `border-top: 1px solid var(--fh-border)`:
- 5 pillar columns, each `flex: 1`, `display: flex flex-direction:column align-items:center gap:3px`
- Pillar score number: `Barlow Condensed 11px 700 color:var(--fh-text-dim)`
- Bar wrap: `width:100% height:32px background:var(--fh-bg3) border-radius:3px overflow:hidden display:flex align-items:flex-end`
- Bar fills from bottom (CSS height %), `min-height: 2px`
- Pillar bar gradients (top→bottom):
  - Engine: `linear-gradient(180deg, #22c55e, #059669)`
  - Avionics: `linear-gradient(180deg, #3b82f6, #7c3aed)`
  - Quality: `linear-gradient(180deg, #FF9900, #AF4D27)`
  - Value: `linear-gradient(180deg, #f59e0b, #d97706)`
  - STC/Mods: `linear-gradient(180deg, #ec4899, #be185d)`
  - N/A: `background: var(--fh-border) opacity:0.5`
- Pillar label below: `DM Mono 8px color:var(--fh-text-muted)`
- **Hover tooltip** on each pillar (CSS only, no JS): `position:absolute bottom:calc(100%+6px)`, fade-in on `.pillar:hover .tooltip`, show pillar name + score + brief context
- **No-price replacement:** instead of pillars show a row: `📊 Aircraft intelligence available — deal score unlocks when price is disclosed.` `font: 11px var(--fh-text-muted)`

**Card Footer** `padding: 8px 14px`, `background: var(--fh-bg3)`, `border-top: 1px solid var(--fh-border)`:
- Source tag(s): `DM Mono 10px`, `background: var(--fh-bg)`, `border: 1px solid var(--fh-border)`, `padding: 2px 7px`, `border-radius: 4px`
- `+ Watch` button: `margin-left: auto`, `border: 1px solid var(--fh-border)`, `color: var(--fh-text-muted)`, hover: `border-color: var(--fh-orange) color:var(--fh-orange) background:var(--fh-orange-dim)`
- `View Report →` button: `background: var(--fh-orange-dim)`, `border: 1px solid var(--fh-border-orange)`, `color: var(--fh-orange)`, `10px 600`

**Card hover state:** `border-color: var(--fh-border-orange)`, `transform: translateY(-2px)`, `box-shadow: 0 8px 32px rgba(0,0,0,0.5)`

**Exceptional card default border:** `border-color: rgba(34,197,94,0.25)`, hover: `rgba(34,197,94,0.5)`

**Card entrance animation:** `fadeUp` — `opacity:0 translateY(12px)` → `opacity:1 translateY(0)`, `0.3s ease`, staggered `animation-delay` per card: `nth-child(n) * 0.05s` (up to 6 cards, then stop staggering)

**Pillar bar entrance animation:** on page load, set all bar heights to `0%` then animate to their real values with `0.6s cubic-bezier(0.34, 1.56, 0.64, 1)`, triggered 300ms after page load.

### 2F — No-Price Sort Order

**RULE:** Listings with `asking_price IS NULL` or `asking_price = 0` must be sorted to the very end of results, after all priced listings, regardless of the active sort order.

**Implementation:**
- In the repository query (`lib/db/listingsRepository.ts`), wrap the ORDER BY in a CASE:
```sql
ORDER BY 
  CASE WHEN asking_price IS NULL OR asking_price = 0 THEN 1 ELSE 0 END ASC,
  <existing sort column> <existing direction>
```
- Add a visual divider in `ListingsClient.tsx` between the last priced result and the first no-price result:
```tsx
<div className="no-price-divider">
  <span>↓ {noPriceCount} listings with undisclosed price — not scored, sorted last</span>
</div>
```
- Divider style: `grid-column: 1 / -1`, centered text, lines either side, `Barlow Condensed 10px 700 uppercase letter-spacing:1.5px color:var(--fh-text-muted)`

### 2G — Results Meta Bar

Between the filter sidebar and the grid:
```
247 Exceptional Deals  across 8,319 listings  [Single Engine ×] [Under $50K ×]  Clear all
```
- Active filter chips: `background: var(--fh-bg3)`, `border: 1px solid var(--fh-border)`, `border-radius: 20px`, `11px`. Click × removes that param from URL.
- "Clear all" removes all filter params, `color: var(--fh-orange)`, no background

**Commit:** `feat(ui): listings page — category bar, deal tier bar, sidebar filters, card redesign`

---

## PHASE 3 — `/listings/[id]` Detail Page Overhaul

**Files:**
- `app/listings/[id]/page.tsx`
- `app/listings/[id]/components/` (create sub-components as needed)

### 3A — Hero Grid Layout

Two-column grid: `grid-template-columns: 1fr 380px`, `gap: 24px`, `max-width: 1280px margin:0 auto padding:24px 20px`.

**Left — Gallery Card** (`border-radius: 12px`, `overflow: hidden`, `border: 1px solid var(--fh-border)`):

1. **Main image area** — `height: 420px`, image with `object-fit: cover`. Fallback: dark gradient bg + large ✈ emoji centered. Photo counter badge: `position:absolute bottom:12px right:12px`, `bg rgba(0,0,0,0.7)`, `DM Mono 11px`, `border-radius: 6px`, `padding: 4px 10px`.
2. **Thumbnail strip** — `display: flex gap:6px padding:8px background:var(--fh-bg3)`. Each thumb: `60×50px border-radius:6px background:var(--fh-bg4) border:1px solid var(--fh-border)`. Active/hover: `border-color: var(--fh-orange)`. "+N more" text at right edge, `11px color:var(--fh-text-muted)`.
3. **Aircraft Identity Bar** (NEW — lives inside the gallery card, below thumbs, `border-top: 1px solid var(--fh-border) padding:14px 16px background:var(--fh-bg2)`):
   - Title: `Barlow Condensed 30px 800 color:var(--fh-text)`
   - Meta row: N-number badge (`DM Mono 12px color:var(--fh-orange) background:var(--fh-orange-dim) border:1px solid var(--fh-border-orange) padding:3px 9px border-radius:5px`) + location/source text `12px var(--fh-text-muted)`
   - **4-column quick-stats bar** `border-top: 1px solid var(--fh-border) margin-top:12px display:grid grid-template-columns:repeat(4,1fr)`. Each cell: `border-right: 1px solid var(--fh-border)` (last has none), `padding: 10px 12px`
     - Cell label: `DM Mono 9px 700 uppercase letter-spacing:1px color:var(--fh-text-muted)`
     - Cell value: `Barlow Condensed 18px 700 color:var(--fh-text)` (override color for good/warn)
     - Cell sub: `10px var(--fh-text-muted)`
     - 4 cells: Total Time (TTAF hrs) / Engine SMOH (hrs + "X% life left" in green if >50%) / Days Listed / Annual Status (green "Current" or amber "Check")

**Right — Score Panel** (`display:flex flex-direction:column gap:14px`):

**Card 1 — Overall Score:**
- `background: var(--fh-bg2)`, `border: 1px solid var(--fh-border)`, `border-radius: 12px`, `padding: 18px`
- Watermark text behind: `"EXCEPTIONAL DEAL"` in `Barlow Condensed 80px 800 color:rgba(34,197,94,0.04)` absolute positioned top-right, `pointer-events:none`
- Deal tier badge: green pill "● EXCEPTIONAL DEAL" (or appropriate tier)
- Score number: `Barlow Condensed 72px 800 color:var(--fh-tier-exceptional)` (color based on tier)
- `/100` in `30px 600 color:var(--fh-text-dim)`
- Sub label: `"Full Hangar Intelligence Score · v{version}"` `11px var(--fh-text-muted)`
- Percentile box: `"🏆 Top X% of {total} active listings"` — `12px var(--fh-text-dim)`, `background:var(--fh-green-dim)`, `border:1px solid rgba(34,197,94,0.2)`, `padding:5px 10px`, `border-radius:6px`

**Card 2 — Price Block:**
- Asking price: `Barlow Condensed 44px 800 color:var(--fh-orange)`
- Price reduction badge (if applicable): `color:var(--fh-red)`, small red-dim pill `"↓ $X,XXX drop"`
- Price meta rows (`justify-content:space-between 12px`):
  - Days listed | Median comparable | vs. median (color: green if below, red if above) | Comp range
  - `hr` divider `border-top:1px solid var(--fh-border)`
  - Deferred items (amber) | Engine reserve remaining (green)
- **True Cost Banner:** `background:rgba(245,158,11,0.08)`, `border:1px solid rgba(245,158,11,0.25)`, `border-radius:8px`, `padding:10px 12px`. Left: "Estimated True Cost" label + sub. Right: `Barlow Condensed 22px 700 color:var(--fh-amber)`

**Card 3 — 5-Pillar Score Breakdown:**
- Title: `Barlow Condensed 12px 700 uppercase letter-spacing:1.5px color:var(--fh-text-muted)`
- 5 pillar rows, each:
  - Top row: pillar name with colored dot + score `"X/100"` right-aligned (`Barlow Condensed 16px 700`)
  - Bar track: `height:6px background:var(--fh-bg3) border-radius:3px`
  - Bar fill: same gradient as card bar fills, animated width on load (`1.2s cubic-bezier(0.34,1.56,0.64,1)`)
  - Note text below: `10px var(--fh-text-muted)` explaining what drove the score (pull from `score_data` or score explanation fields)

### 3B — Main Body Sections

Below the hero: same 2-col grid `1fr 380px`.

**Left column sections (each as a `<section>` card with `border-radius:12px border:1px solid var(--fh-border) background:var(--fh-bg2) overflow:hidden`):**

Section card header: `padding:14px 16px`, `border-bottom:1px solid var(--fh-border)`, title `Barlow Condensed 13px 700 uppercase letter-spacing:1.5px color:var(--fh-text-dim)` + badge pills right-aligned (`10px 700 DM Mono border-radius:4px`).

Badge pill colors: green = `background:var(--fh-green-dim) color:var(--fh-green)`, amber = amber-dim/amber, blue = blue-dim/blue, red = red-dim/red.

Section body: `padding:16px`.

**Section 1 — ✈ Airframe & Identity** (badge: FAA MATCHED / UNMATCHED)
- Spec table: 2-col, `border-collapse:collapse`
- Left col (label): `11px var(--fh-text-muted) 44% width`
- Right col (value): `13px var(--fh-text) DM Mono`
- Row `border-bottom:1px solid rgba(255,255,255,0.04)`, last row no border
- Fields: Year / Make Model / Serial Number / Registration (N-number + status colored) / TTAF / FAA Owner / FAA Cert Issued / Aircraft Type / Annual Status

**Section 2 — ⚙ Engine Intelligence** (badges: `{X}% LIFE REMAINING` + `EV SCORED`/`EV UNAVAILABLE`)
- Engine life donut SVG (100×100px): outer circle `r=38 fill:none stroke:var(--fh-bg3) stroke-width:10`. Fill arc `stroke:var(--fh-green) stroke-width:10 stroke-dasharray:"{pct_of_239.9} {remainder}"`. Center: `{pct}%` in `Barlow Condensed 20px 800 color:var(--fh-green)` + `"life left"` `8px var(--fh-text-muted)`.
- Right of donut: stat rows `display:flex justify-content:space-between 12px border-bottom:1px solid rgba(255,255,255,0.04)`:
  - Engine Model / SMOH / TBO / Hours Remaining / Remaining Value / Reserve per hr
  - Values: `DM Mono color:var(--fh-text)`, SMOH colored green/amber/red by life %
- Below: colored insight box (green if >50% life, amber if 25-50%, red if <25% / over TBO)
  - Green: `"✓ Engine is fresh — X hrs on a {model}. No overhaul liability..."`
  - Amber: `"⚠ Engine approaching TBO — X hrs remaining. Budget $X,XXX overhaul reserve."`
  - Red: `"⚠ Engine past TBO — overrun liability: ~$X,XXX. Price this into your offer."`
- If engine data unavailable: show `"Engine data not available for this listing"` gray box

**Section 3 — 📡 Avionics Intelligence** (badges: `{score}/100` + `est. ${value} installed`)
- Avionics chips: `display:flex flex-wrap:wrap gap:6px`
- Each chip: `padding:5px 10px background:var(--fh-bg3) border:1px solid var(--fh-border) border-radius:7px font:11px color:var(--fh-text-dim)`
- Chips with estimated value: `border-color:rgba(59,130,246,0.3) background:var(--fh-blue-dim) color:var(--fh-blue)`, value shown in `DM Mono 10px color:var(--fh-orange)`
- Below chips: insight box (blue) with upgrade recommendation if applicable (e.g., steam gauge → GTN 650 upgrade narrative)

**Section 4 — ⚠ Life-Limited Parts** (badge: `{N} ITEMS FLAGGED` amber, or green `ALL CLEAR`)
- Row list: icon + name + status pill + estimated cost
- Status pills: `OK` (green), `CHECK DATE` (amber), `NOT DISCLOSED` (gray), `EXPIRED` (red)
- Each row `12px`, `border-bottom:1px solid rgba(255,255,255,0.04)`, `padding:8px 0`
- Bottom: amber insight box with total estimated deferred item cost
- LLP items to check (from `life_limited_parts` table or score_data): Annual / Altimeter-Pitot-Static / Transponder / ELT Battery / Seatbelts / any Cirrus CAPS if applicable

**Section 5 — 📈 Market Comparables** (badge: `{N} COMPS FOUND`)
- 3-stat summary row: This Listing / Median Comp / You Save Est. — each in a small box
  - "You Save Est." box: `background:var(--fh-green-dim) border:1px solid rgba(34,197,94,0.25) color:var(--fh-green)`
- Scatter plot SVG (`height:180px`): X = year, Y = price, dots for comps, this listing highlighted in orange with `box-shadow: 0 0 0 4px rgba(255,153,0,0.2)`, axis lines, legend
- Use existing `CompsChartPanel.tsx` component if present, reskin to match new design

**Right sidebar sections:**

**Deal Desk CTA:**
- `background: linear-gradient(135deg, rgba(175,77,39,0.2), rgba(255,153,0,0.1))`, `border: 1px solid var(--fh-border-orange)`, `border-radius: 12px`, `padding: 18px`
- Text + CTA button: `background: var(--fh-orange) color:#000 font:Barlow Condensed 14px 800`, hover: `background:var(--fh-orange-burn) color:#fff`

**FAA Registry card** (badge: VERIFIED / UNVERIFIED)
- 2-col grid of field/value pairs: N-Number / Status / Year Mfr / Cert Issued / Registered Owner (full width) / FAA Engine / MFR Model Code
- Labels: `10px var(--fh-text-muted) uppercase`, Values: `12px var(--fh-text-dim) DM Mono`

**Seller info card**
- Dealer vs private badge, seller name, location, active listing count
- CTA link: "View on {source} →" — full-width orange-dim bordered button

**Deal Signals card**
- List of signal rows (green ✓ or amber ⚠), `padding:8px`, colored bg per type
- Pull from score explanation / deal pattern flags already in the score_data

**Source footnote** (`11px var(--fh-text-muted) text-align:center line-height:1.5`):
- "Data sourced from {source} · FAA Registry · Avionics catalog v{version}"
- "Intelligence score computed by Full Hangar v{intelligence_version} · Last updated {scraped_at}"
- "Full-Hangar.com is not a broker or dealer. Always conduct a pre-buy inspection."

**Commit:** `feat(ui): listing detail page overhaul — hero identity bar, engine/avionics/LLP sections, comps`

---

## PHASE 4 — `/internal/admin` Page Redesign

**Files:** `app/internal/admin/page.tsx` + `app/internal/admin/components/`

### 4A — Tab Navigation (replaces vertical scroll)

Add a sticky tab bar at the top of the admin page (below the admin nav). **Do not keep the old scrollable single-page layout.** Each tab renders its own panel and hides all others.

Tabs (left to right):
1. `📊 Overview`
2. `✈ Listings & Sources`
3. `📡 Avionics Intelligence` (badge: `v2.1.3`)
4. `⚙ Engine Intelligence` (badge: `v1.9.3`)
5. `🎯 Scoring`
6. `👥 Users & Beta`

**Remove** the "🖥 System" tab entirely.

Tab bar styles:
- `background: var(--fh-bg2)`, `border-bottom: 2px solid var(--fh-border)`, `padding: 0 20px`
- `position: sticky`, `top: 52px` (below admin nav), `z-index: 99`
- Each tab button: `padding: 12px 18px`, `font: DM Sans 12px 600`, `border-bottom: 2px solid transparent margin-bottom:-2px`
- Active: `color: var(--fh-orange)`, `border-bottom-color: var(--fh-orange)`
- Inactive: `color: var(--fh-text-muted)`, hover: `color: var(--fh-text-dim)`
- Avionics + Engine Intelligence tabs have a small `DM Mono 9px` orange badge showing the current version

Tab panel switch: pure client-side state (`useState`), no route change. Animate panel entry with `fadeIn 0.2s ease` (`opacity:0 translateY(4px)` → `opacity:1 translateY(0)`).

Bar and progress charts within panels: animate width from `0` to target on tab open (`0.9s cubic-bezier(0.34,1.56,0.64,1)`).

### 4B — KPI Card Component

Reusable `<KpiCard>` component: `background:var(--fh-bg2) border:1px solid var(--fh-border) border-radius:12px padding:16px position:relative overflow:hidden`.

Top accent bar: `position:absolute top:0 left:0 right:0 height:2px`. Color prop: green/orange/blue/amber/purple/red/pink.

Inside: label (`Barlow Condensed 10px 700 uppercase letter-spacing:1.2px color:var(--fh-text-muted)`), value (`Barlow Condensed 38px 800`), change text (`11px`), sub text (`10px var(--fh-text-muted)`).

Hover: `transform:translateY(-1px) border-color:var(--fh-border-orange)`, `transition:all 0.2s`.

Value entrance: `@keyframes countUp` — `opacity:0 translateY(8px)` → `opacity:1 translateY(0)`, staggered per card `0.05s * n`.

### 4C — Overview Tab

**Top 4 KPIs:** Total Live Listings (green) / FAA N-Match Rate (orange) / Scored Listings (blue) / Exceptional Deals (amber)

**Second 4 KPIs:** Avionics Match Rate (purple) / Engine Value Coverage (orange) / Call-for-Price listings (red, count + `"Not scored — price required"`) / Data Sources (pink)

**Score Distribution chart** (left of 2-col): horizontal bar chart. Each tier is a labeled row with a colored bar + right-aligned count. Include a final row for "No Price / N/A" with gray bar.

**Activity Feed** (right): list of recent pipeline events with colored dot, description, and relative timestamp. Pull from any existing pipeline log or build a static placeholder. `border-bottom:1px solid var(--fh-border)` between items.

### 4D — Listings & Sources Tab

**6 KPI cards** (one per scraper source): Controller / Trade-A-Plane / ASO / Barnstormers / AvBuyer / GlobalAir+AFS+AeroTrader

**Field Coverage Heatmap table:** rows = sources, columns = key fields (Price, TTAF, SMOH, Engine Model, N-Number, Location, Images, Avionics, FAA Matched, Listings count). Each cell shows a colored pill (`green ≥ 85%`, `blue 60–84%`, `amber 40–59%`, `red <40%`). Pull from existing data quality API endpoint at `/api/internal/admin/...`.

### 4E — Avionics Intelligence Tab

**4 KPIs:** Parser Version / Matched Row Rate / Catalog Size / Extraction Coverage

**Segment Rollout Status** (left card): 5 horizontal progress bars — Piston Single / Piston Multi / Turboprop / Jets / Rotorcraft. Bar colors: green if ≥90%, amber if 60–89%, red if <60%. Animate width on tab open.

**Top Unresolved Tokens** (right card): table with columns Token / Count / Segment / Action. Token shown as `DM Mono` chip. "+ Alias" button per row: `background:var(--fh-orange-dim) border:1px solid var(--fh-border-orange) color:var(--fh-orange) 10px`. Pull from `/api/internal/admin/avionics-intelligence` endpoint.

**Priced Observations donut** (full-width): SVG donut chart showing BAS Part Sales vs GlobalAir split. Legend to the right. Pull from same admin endpoint.

### 4F — Engine Intelligence Tab

**4 KPIs:** Piston SMOH Coverage / Engine Value Scored count / TBO Reference Records / Pricing Gaps Remaining

**Engine Coverage by Manufacturer** (left): horizontal progress bars for Lycoming / Continental / Rotax / PT6A Family / Pratt & Whitney / Williams FJ44.

**Missing Engine Value Gap Table** (right): Engine Model / Listings count / Gap Type pill / Priority badge. Pull from existing internal data or build a placeholder populated from `aircraft_listings` where `engine_remaining_value IS NULL`.

**Engine Value Score Distribution** (full-width): same bar chart pattern as score distribution — SNEW/Fresh / Excellent / Good / Near TBO / Over TBO.

### 4G — Scoring Tab

**Alert banner** at top (amber):
```
⚠ "Call for Price" and null-price listings should have their deal score suppressed.
A listing cannot be "Exceptional" without a disclosed price — value scoring is impossible.
This affects ~841 listings currently showing deal tiers.
```
Style: `background:rgba(245,158,11,0.08) border:1px solid rgba(245,158,11,0.25) border-radius:8px padding:10px 14px font:12px color:var(--fh-amber)`.

**5-Pillar Matrix table** (left card): Pillar / Weight / Status / Key Inputs. Market Value row should have `amber` status badge "REQUIRES PRICE".

**Deal Tier Thresholds** (right card): 4 tier blocks stacked. Each: label + score range + subtitle. Colors per tier. Bottom block for "PRICE UNDISCLOSED" is gray.

### 4H — Users & Beta Tab

**Top Section — Site Traffic:**

4 KPIs: Visitors This Week / Page Views / Avg Session Duration / Bounce Rate

**14-day visitor trend chart** (SVG, full width of left cell): Line chart with gradient area fill below the line. `var(--fh-orange)` line/fill. Axes labeled (dates + visitor counts). Data points: use placeholder data shaped like a growing trend. Include bottom text row: "Weekends consistently highest" + "Peak today: X visitors" + "Growth: +X% WoW".

**Top Pages bar chart** (top-right card): `/listings` / `/listings/[id]` / `/` / `/beta/join` — horizontal bars, `var(--fh-orange)`, `var(--fh-blue)`, `var(--fh-green)`, `var(--fh-purple)`.

**Traffic Sources donut** (bottom-right card): Direct/bookmark (49%) / Google/SEO (31%) / Social/referral (20%).

**Bottom Section — Beta Users:**

4 KPIs: Beta Invites Sent / Active Beta Users / Admin Users / Watchlist Items

**Beta User Activity table**: User / Sessions / Listings Viewed / Watchlist / Last Seen. Pull from existing user/session data if available.

**Most Watched Aircraft table**: Aircraft / Price / Watches / Score. Include callout for watched no-price listings.

**Commit:** `feat(ui): admin page redesign — tab nav, avionics/engine intelligence tabs, visitor stats`

---

## PHASE 5 — `/internal/deal-desk` Wizard Redesign

**Files:** `app/internal/deal-desk/page.tsx` + sub-components

This is a ground-up redesign of the Deal Desk. The existing 9-section scrollable layout is replaced with a **guided 6-step wizard** with a live P&L panel. Existing `deal_desk_scenarios` persistence must be maintained — the wizard state is saved as a scenario on completion.

### 5A — Page Layout

Two-panel grid: `grid-template-columns: 1fr 360px gap:0 min-height:calc(100vh - 52px)`.

**Left: Wizard Panel** `padding: 28px 28px 60px`, `border-right: 1px solid var(--fh-border)`, `overflow-y: auto`

**Right: Live P&L Panel** `background:var(--fh-bg2) border-left:1px solid var(--fh-border) position:sticky top:52px height:calc(100vh - 52px) overflow-y:auto`

Background: subtle dot-grid or orange-tinted graph-paper pattern (`linear-gradient` lines, `48px` repeat, `rgba(255,153,0,0.025)`).

### 5B — Step Progress Track

Above the wizard cards: a horizontal step track with 6 nodes connected by lines.

Each node: circle (`32px`, `border-radius:50%`, `border:2px solid var(--fh-border) background:var(--fh-bg2) color:var(--fh-text-muted)`) + label below (`DM Mono 9px uppercase`).

States:
- **Done:** `border-color:var(--fh-green) background:var(--fh-green-dim) color:var(--fh-green)` + checkmark icon
- **Active:** `border-color:var(--fh-orange) background:var(--fh-orange-dim) color:var(--fh-orange) box-shadow:0 0 0 4px rgba(255,153,0,0.12)`
- **Locked:** default (no pointer events, cursor:default)

Lines between nodes: `flex:1 height:2px margin:0 4px margin-bottom:18px`. Done lines: `background:var(--fh-green)`.

Clicking a done node jumps back to that step. Clicking a locked node does nothing.

### 5C — Aircraft Context Banner

Below the step track, above the step cards:

```
[Score circle: 84 green]  [1978 Cessna 172N Skyhawk]         [Change aircraft]
                           [N12345 · Spokane · $38,500 asking · Score 84/100 Exceptional]
```

`background:var(--fh-bg2) border:1px solid var(--fh-border-orange) border-radius:12px padding:14px 18px`

Score circle: `48px border-radius:50% border:2px solid var(--fh-green) Barlow Condensed 20px 800 color:var(--fh-green)`.

"Change aircraft" link: `border:1px solid var(--fh-border) color:var(--fh-text-dim) padding:4px 10px border-radius:6px 11px`, hover orange.

Pre-populate from the listing if navigated from a listing detail page (pass `?listingId=` param and load listing data).

### 5D — Step Cards

Each step is a card: `background:var(--fh-bg2) border:1px solid var(--fh-border) border-radius:14px overflow:hidden margin-bottom:14px`.

**States:**
- `active`: `border-color:rgba(255,153,0,0.35) animation:pulseGlow 3s ease infinite`
- `done`: `border-color:rgba(34,197,94,0.22)`
- `locked`: `opacity:0.45 pointer-events:none`

`@keyframes pulseGlow { 0%,100%{box-shadow:0 0 0 0 rgba(255,153,0,0)} 50%{box-shadow:0 0 0 6px rgba(255,153,0,0.08)} }`

**Card header** `padding:16px 18px cursor:pointer user-select:none display:flex align-items:center gap:12px`:
- Step number: `Barlow Condensed 11px 800 letter-spacing:1px color:var(--fh-text-muted)` (active→orange, done→green)
- Icon emoji
- Text: title `Barlow Condensed 17px 700 color:var(--fh-text)` + sub `11px var(--fh-text-muted) font-style:italic`
- Status badge: `DM Mono 10px border-radius:10px padding:3px 9px` — IN PROGRESS (orange-dim/orange), DONE (green-dim/green), LOCKED (bg3/border/text-muted)
- Chevron `›` that rotates 90° when active

**Card body:** hidden by default, displayed when `active`. `padding:0 18px 20px`. Clicking done card header re-expands it (toggle).

**Step footer:** `display:flex justify-content:flex-end gap:8px margin-top:20px padding-top:16px border-top:1px solid var(--fh-border)`.
- Back button: `background:none border:1px solid var(--fh-border) color:var(--fh-text-muted) 12px 600 padding:9px 20px border-radius:8px`
- Next button: `background:var(--fh-orange) color:#000 Barlow Condensed 15px 800 padding:9px 28px border-radius:8px`, hover `background:var(--fh-orange-burn) color:#fff transform:translateY(-1px)`
- Final step: "Generate Full Analysis →" button in green

### 5E — Input Component Library (within wizard)

**Text inputs:**
```css
.wd-inp {
  background: var(--fh-bg3);
  border: 1px solid var(--fh-border);
  border-radius: 8px;
  color: var(--fh-text);
  font-family: 'DM Mono', monospace;
  font-size: 14px;
  padding: 10px 14px;
  width: 100%;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.wd-inp:focus {
  border-color: var(--fh-border-orange);
  box-shadow: 0 0 0 3px rgba(255,153,0,0.08);
}
```

**Prefix/suffix wrappers:** `position:relative`. Prefix (`$`) at `left:12px`, input `padding-left:24px`.

**Chip groups (radio/multi-select):**
- Chip: `background:var(--fh-bg3) border:1px solid var(--fh-border) border-radius:20px color:var(--fh-text-dim) font:12px 500 padding:6px 14px cursor:pointer`
- Selected: `background:var(--fh-orange-dim) border-color:var(--fh-orange) color:var(--fh-orange) font-weight:600`

**Toggle switches** (for deferred item include/exclude):
- `28px × 16px border-radius:8px background:var(--fh-bg4) border:1px solid var(--fh-border) position:relative cursor:pointer`
- On: `background:var(--fh-orange) border-color:var(--fh-orange)`. Knob: `10px circle position:absolute`. Off: left 2px. On: left 14px.

**Insight boxes:**
- `display:flex gap:10px align-items:flex-start padding:10px 12px border-radius:8px margin-top:12px font:12px line-height:1.5`
- Green: `background:var(--fh-green-dim) border:1px solid rgba(34,197,94,0.2) color:var(--fh-green)`
- Amber: amber-dim / amber
- Red: red-dim / red
- Blue: blue-dim / blue

**2/3 column question grids:** `display:grid grid-template-columns:1fr 1fr gap:12px` or 3-col.

**Line item rows** (toggleable deferred items / upgrade budget):
- Container: `border:1px solid var(--fh-border) border-radius:8px overflow:hidden`
- Each row: `display:flex align-items:center gap:10px padding:10px 12px border-bottom:1px solid var(--fh-border) background:var(--fh-bg3) transition:background 0.15s`
- Icon (14px, fixed 20px width) + name (12px `var(--fh-text-dim)` flex:1) + cost (`DM Mono 13px var(--fh-text)`) + toggle switch

**Question block:** `margin-bottom:20px`. Label: `12px 600 color:var(--fh-text-dim)` + hint `10px var(--fh-text-muted) font-style:italic`.

### 5F — The 6 Steps (Content)

**Step 1 — Aircraft** (auto-completed if navigated from listing):
- Shows listing context + "Aircraft confirmed" state
- If no listing pre-loaded: search input or link to browse listings
- On confirm: mark done, unlock step 2

**Step 2 — Acquisition:**
- "What are you planning to offer?" — 2-col: offer price input + "vs. asking" computed box (green/red `↓/↑ $X,XXX`)
- Smart nudge: if listing has prior price drop or long DOM → amber insight "Seller has shown motivation..."
- "Pre-buy inspection budget" — single input, default `$600`
- "How are you financing?" — chip group: All cash / Aviation loan / Partnership/LLC. Loan selection → update insight to warn about interest as a carrying cost in step 4
- "Annual inspection needed?" — chip group: No (current) / Yes (deferred) / Unknown. If deferred: show cost input
- "Estimated deferred maintenance" — line items list with toggles (pull from LLP flags in score_data). Show running total below list
- Step 2 "Next" advances to step 3, marks step 2 done

**Step 3 — Upgrades:**
- "Upgrade strategy?" — multi-select chips: Avionics upgrade / Paint / Interior / Engine overhaul / Prop overhaul / ADS-B upgrade / No upgrades — flip as-is
- Per-category budget inputs (line item format with $ inputs)
- Smart insight: if aircraft has steam gauge panel → blue box recommending GTN 650 upgrade path with estimated ROI
- Step 3 "Next" → step 4

**Step 4 — Carrying Costs:**
- "How long will you hold?" — chip group: 1–3 months / 3–6 months / 6–12 months / 12+ months
- Monthly cost inputs (line item format with editable $ fields): Hangar / Insurance / Engine reserve / Misc
- Live computed rows: "Monthly burn rate: $X" + "Est. total carry ({avg_months} mo avg): $X"
- Step 4 "Next" → step 5

**Step 5 — Exit Strategy:**
- "Target sale price?" — 2-col: price input + "vs. median comp" computed box (% above/below)
- If target > 10% above median: amber warning about days-on-market impact
- "Where are you selling?" — chip group: Controller / TAP / Barnstormers / Local/type club / Broker
- "Brokerage fee?" — chip group: Self-listed ($300/yr) / Broker (5%) / Dealer (8–10%). Fee percentage auto-applied to exit price computation
- Step 5 "Finish" → generate summary, mark all done, unlock step 6

**Step 6 — Summary:**
- Auto-rendered when step 5 complete
- Large ✅ icon + "Analysis Complete" in green
- Green insight box: GO / CAUTION / NO-GO verdict with plain-English explanation
- Two buttons: "📤 Export PDF Report" + "💾 Save Scenario" (saves to `deal_desk_scenarios` table)

**"Coming Up" teaser** (below the locked steps when on steps 2/3/4/5): list of what future steps will reveal (`background:var(--fh-bg2) border:1px solid var(--fh-border) border-radius:10px padding:16px`).

### 5G — Live P&L Panel (Right)

**Sticky header** `padding:18px 20px 14px border-bottom:1px solid var(--fh-border)`:
- Title: `Barlow Condensed 13px 700 uppercase letter-spacing:1.5px color:var(--fh-text-muted)`
- Verdict box (updates reactively):
  - GO: `background:var(--fh-green-dim) border:1px solid rgba(34,197,94,0.35)`; label `Barlow Condensed 26px 800 color:var(--fh-green)`
  - CAUTION: amber colors
  - NO-GO: red colors
  - TBD: `var(--fh-bg3)` neutral

**Profit Hero** `padding:14px 20px border-bottom:1px solid var(--fh-border) text-align:center`:
- Label: `DM Mono 10px 700 uppercase color:var(--fh-text-muted)`
- Profit number: `Barlow Condensed 52px 800`. Positive → `var(--fh-green)`, negative → `var(--fh-red)`, pending → `var(--fh-text-muted) 28px "—"`
- ROI line: `DM Mono 13px`, same color
- Animate: on value change, `transform:scale(1.04)` for 300ms then back

**Deal Health Checklist** `padding:12px 20px 4px border-bottom:1px solid var(--fh-border)`:
- Title: `Barlow Condensed 10px 700 uppercase color:var(--fh-text-muted)`
- Each item: icon (✅/⚠️/⏳/❌) + 11px text
  - `pass` → `var(--fh-green)`
  - `warn` → `var(--fh-amber)`
  - `fail` → `var(--fh-red)`
  - `tbd` → `var(--fh-text-muted) font-style:italic`
- Populate dynamically from score_data flags already in the listing (engine life, ADS-B, annual status, etc.)

**P&L Line Item Sections** (one per deal phase):
- Section title: `Barlow Condensed 10px 700 uppercase color:var(--fh-text-muted) padding:14px 20px 10px`
- Rows: `display:flex justify-content:space-between 12px padding:5px 0 border-bottom:1px solid rgba(255,255,255,0.03)`
- Label: `color:var(--fh-text-muted)` + 5px dot. Value: `DM Mono 12px`
- Negative values → `var(--fh-red)`, positive → `var(--fh-green)`, pending → `var(--fh-text-muted) italic "—"`
- Subtotal row: `border-top:1px solid var(--fh-border) margin-top:6px padding-top:8px font:13px 600`
- Sections: 📥 Acquisition / 🔧 Upgrades / 📅 Carrying Costs / 🎯 Exit

All values update live as the user types. Use `useCallback`/`useMemo` to avoid re-render storms.

**3×3 Sensitivity Grid** `padding:14px 20px 20px`:
- Title: `Barlow Condensed 10px 700 uppercase color:var(--fh-text-muted)` + note about unlocking at step 5
- Column labels: 3 hold-time scenarios. Row labels: 3 exit price scenarios (left gutter)
- Each cell: `border-radius:6px padding:8px text-align:center font:DM Mono 11px transition:all 0.3s`
  - Positive profit → `background:var(--fh-green-dim) color:var(--fh-green)`
  - Near zero → `background:var(--fh-bg3) color:var(--fh-text-muted)`
  - Negative → `background:var(--fh-red-dim) color:var(--fh-red)`
- **Current scenario cell** has `outline:2px solid var(--fh-orange)` highlight
- Cell shows: main profit value (`12px 700`) + ROI % below (`9px opacity:0.7`)
- Grid locked/grayed until step 5 complete

### 5H — State & Persistence

- Use `useState` for all wizard step state (current step, form values, computed P&L)
- On step 6 completion, upsert to `deal_desk_scenarios` table using existing API shape
- Load existing scenario if `?scenarioId=` param present
- `useSearchParams` to read `?listingId=` and pre-populate aircraft context

**Commit:** `feat(ui): deal desk wizard redesign — 6-step flow, live P&L panel, sensitivity grid`

---

## PHASE 6 — Score Suppression for No-Price Listings

**Files:** `core/intelligence/aircraft_intelligence.py` ← **EXCEPTION: This one backend file change is required**

**Rule:** Any listing where `asking_price IS NULL` or `asking_price = 0` must have its deal tier set to `null`/`None` and must NOT be labeled "Exceptional", "Strong", "Good", or "Fair" in the `deal_tier` column.

The `value_score` sub-component (market value pillar) should still be computed and stored internally but the **overall `value_score` (deal tier) must be suppressed to `null`** for no-price listings.

**Specifically:**
```python
# In score_listing() or equivalent, after computing pillar scores:
if not listing.get('asking_price') or listing.get('asking_price') == 0:
    result['deal_tier'] = None
    result['value_score'] = None  # suppress overall, not pillar
    result['score_explanation']['price_suppressed'] = True
    result['score_explanation']['suppression_reason'] = (
        "Deal score suppressed — no price disclosed. "
        "Price is required to compute market value pillar (30% weight)."
    )
```

**Also bump `INTELLIGENCE_VERSION`** by one patch version (e.g., `1.9.3` → `1.9.4`) when this change is deployed. Update the version constant in `aircraft_intelligence.py`.

**DO NOT run `backfill_scores.py`** — leave that for Ryan to trigger manually per `AGENTS.md` protocol.

**Frontend enforcement** (belt-and-suspenders, in case backend value is stale): in `ListingCard.tsx` and `app/listings/[id]/page.tsx`, if `asking_price` is null/0, always render the "PRICE UNDISCLOSED" state regardless of what `deal_tier` field says.

**Commit:** `feat(scoring): suppress deal tier for no-price listings, bump intelligence v1.9.4`

---

## PHASE 7 — Final Polish & QA

### 7A — Light Mode Audit

For every new CSS class added in phases 1–5, ensure a `[data-theme="light"]` rule exists in `globals.css`:
- Surfaces: bg→`#ffffff`, bg2→`#f4f6f9`, bg3→`#e8ecf0`
- Text: --fh-text→`#111827`, --fh-text-dim→`#374151`
- Borders: --fh-border→`rgba(0,0,0,0.09)`
- Orange, green, amber, red, blue remain the same in light mode

### 7B — Mobile Responsiveness

- `< 768px`: hide sidebar, show bottom-sheet filter drawer triggered by a floating filter button
  - Drawer: `position:fixed bottom:0 left:0 right:0 max-height:85dvh border-radius:16px 16px 0 0 background:var(--fh-bg2) border-top:1px solid var(--fh-border)` + drag handle
  - Active filter badge count on the filter button
- Category bar and tier bar: `overflow-x:auto scrollbar-width:none` (already specified above)
- Deal Desk: wizard and P&L panel stack vertically on mobile (`grid-template-columns:1fr`)
- Sensitivity grid: `display:none` on mobile with fallback message
- Listing detail hero: stack gallery + score panel vertically
- Touch targets: all buttons `min-height:44px min-width:44px`

### 7C — Performance Checks

- Lazy-load `CompsChartPanel` and `GeoIntelMap` with `dynamic(() => import(...), { ssr: false })`
- Listing card images: `loading="lazy"` attribute
- Pillar bar animations: use `CSS transitions` only, no JS animation libraries
- Admin charts: SVG only, no external chart library imports (use existing recharts if already in bundle)

### 7D — Accessibility

- All interactive elements: visible `:focus-visible` ring in orange (`outline:2px solid var(--fh-orange) outline-offset:2px`)
- Tooltips: `role="tooltip"` + `aria-describedby` on trigger
- Score badges: `aria-label="Deal score: {n} out of 100"`
- Color-only information: every status has an icon/label alongside the color

### 7E — Verification Checklist

After each phase commit, run:

```bash
# Dev server
npm run dev

# Type check
npx tsc --noEmit

# Smoke tests
npm run test:smoke:listings-all
npm run test:smoke:listings-options
```

Verify in browser:
- [ ] `/listings` loads with category bar, tier bar, pillar legend, 220px sidebar, cards with 5-pillar bars
- [ ] No-price cards appear after priced cards with divider label
- [ ] `/listings/[id]` shows identity bar in gallery card (no gap below thumbs)
- [ ] `/listings/[id]` engine donut renders, avionics chips render, LLP section renders
- [ ] `/internal/admin` has 6 tab buttons, System tab is gone, Users & Beta shows visitor chart
- [ ] `/internal/deal-desk` shows 6-step wizard with progress track + live P&L panel
- [ ] Dark mode and light mode both render without broken colors
- [ ] Mobile `< 768px` sidebar hidden, bottom filter drawer accessible

**Final commit:** `feat(ui): phase 7 polish — light mode, mobile, a11y, perf`

---

## FILE CREATION SUMMARY

New files to create:
```
components/listings/CategoryBar.tsx
components/listings/DealTierBar.tsx
components/listings/PillarLegendBar.tsx
components/listings/ListingCard.tsx          ← replaces/updates existing
components/listings/NoPriceDivider.tsx
components/listings/SidebarFilters.tsx
app/listings/[id]/components/AircraftIdentityBar.tsx
app/listings/[id]/components/EngineIntelSection.tsx
app/listings/[id]/components/AvionicsSection.tsx
app/listings/[id]/components/LifeLimitedPartsSection.tsx
app/listings/[id]/components/DealSignalsCard.tsx
app/internal/admin/components/TabBar.tsx
app/internal/admin/components/KpiCard.tsx
app/internal/admin/components/ScoreDistChart.tsx
app/internal/admin/components/ActivityFeed.tsx
app/internal/admin/tabs/OverviewTab.tsx
app/internal/admin/tabs/ListingsSourcesTab.tsx
app/internal/admin/tabs/AvionicsTab.tsx
app/internal/admin/tabs/EngineTab.tsx
app/internal/admin/tabs/ScoringTab.tsx
app/internal/admin/tabs/UsersTab.tsx
app/internal/deal-desk/components/StepProgressTrack.tsx
app/internal/deal-desk/components/AircraftContextBanner.tsx
app/internal/deal-desk/components/StepCard.tsx
app/internal/deal-desk/components/LivePnlPanel.tsx
app/internal/deal-desk/components/SensitivityGrid.tsx
app/internal/deal-desk/components/DealHealthChecklist.tsx
app/internal/deal-desk/steps/Step1Aircraft.tsx
app/internal/deal-desk/steps/Step2Acquisition.tsx
app/internal/deal-desk/steps/Step3Upgrades.tsx
app/internal/deal-desk/steps/Step4Carrying.tsx
app/internal/deal-desk/steps/Step5Exit.tsx
app/internal/deal-desk/steps/Step6Summary.tsx
```

Existing files to update:
```
app/globals.css                    ← design system variables + grain overlay
app/layout.tsx                     ← Google Fonts import + nav update
app/listings/page.tsx              ← wire new bars + sidebar
app/listings/[id]/page.tsx         ← hero restructure + new sections
app/internal/admin/page.tsx        ← tab system + new tabs
app/internal/deal-desk/page.tsx    ← full wizard replacement
lib/db/listingsRepository.ts       ← no-price sort-last ORDER BY change
core/intelligence/aircraft_intelligence.py  ← score suppression + version bump
```

---

## REFERENCE MOCKUPS

The following HTML mockup files contain the complete pixel-accurate visual reference for every change described in this document. The agent must match these mockups as closely as possible in the TSX/CSS implementation:

- `fh-listings-mockup.html` → phases 1, 2A–2G
- `fh-detail-mockup.html` → phase 3
- `fh-admin-mockup.html` → phase 4
- `fh-dealdesk-mockup.html` → phase 5

When in doubt about spacing, color, or layout, the mockup HTML/CSS is the source of truth. The CSS variables in the mockups use `--orange`, `--bg`, etc. — map these directly to the `--fh-*` equivalents defined in the design system above.
