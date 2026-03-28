# FRONTEND Agent — Deal Coach Public Route + Homepage CTA

## Read first
Read `AGENTS.md` fully before starting. This is a **FRONTEND** lane task.
Do not touch `scraper/`, `app/api/`, `lib/db/`, `core/intelligence/`, or `supabase/migrations/`.
Dev server: `http://localhost:3001`
Project root: `D:\Documents\$$Full Hangar\2.0\CursorReposity\full-hangar\`

---

## Objective

Build a public-facing Deal Coach wizard at `/deal-coach` and add a prominent CTA button on the homepage linking to it. No authentication required — anyone can access `/deal-coach` without logging in.

This is a net-new feature. Do not modify `/internal/deal-desk` or any existing internal routes.

---

## Phase 1 — Route scaffold and shared types

### 1A. Create the route directory and shared types

Create `app/deal-coach/types.ts`:

```ts
export type DealMode = 'buy' | 'sell' | 'research'
export type IntentType = 'flip' | 'personal' | 'training' | 'business'
export type FinanceType = 'cash' | 'finance50' | 'finance80'

export interface AircraftProfile {
  // Identity
  source: 'listing' | 'search' | 'manual'
  listingId?: string
  year?: number
  make?: string
  model?: string
  registration?: string
  serialNumber?: string

  // Airframe
  ttaf?: number
  condition?: string

  // Engine
  smoh?: number
  snew?: number
  stoh?: number
  spoh?: number
  annualStatus?: string
  lastAnnual?: string
  engineMake?: string
  engineModel?: string
  engineCount?: number
  overhaulType?: string
  propMake?: string
  propType?: string

  // Avionics
  panelType?: string
  avionicsSelected?: string[]

  // Condition
  damageHistory?: boolean
  damageDetail?: string
  squawks?: string
  paintCondition?: string
  interiorCondition?: string

  // Price / location
  askingPrice?: number
  location?: string
  notes?: string
}

export interface CoachAnswers {
  mode: DealMode
  intent?: IntentType
  aircraft?: AircraftProfile
  offerPrice?: number
  holdMonths?: number
  exitTarget?: number
  financeType?: FinanceType
}
```

### 1B. Create the page entry point

Create `app/deal-coach/page.tsx`:

```tsx
import type { Metadata } from 'next'
import DealCoachClient from './DealCoachClient'

export const metadata: Metadata = {
  title: 'Deal Coach — Full Hangar',
  description: 'Analyze any aircraft deal in minutes. Build a complete flip P&L, get upgrade ROI analysis, and access live market comps — no account required.',
}

export default function DealCoachPage() {
  return <DealCoachClient />
}
```

---

## Phase 2 — Step components

Create one file per step in `app/deal-coach/steps/`. Each is a client component that receives `answers: CoachAnswers`, `onUpdate: (patch: Partial<CoachAnswers>) => void`, and `onNext: () => void`.

### Step component interface (put in `app/deal-coach/steps/types.ts`):
```ts
import type { CoachAnswers } from '../types'
export interface StepProps {
  answers: CoachAnswers
  onUpdate: (patch: Partial<CoachAnswers>) => void
  onNext: () => void
  onBack: () => void
}
```

---

### 2A. `app/deal-coach/steps/StepEntry.tsx` — mode selection

Three large block chips: "I'm buying / flipping an aircraft", "I'm selling an aircraft", "Just researching the market". Tapping any chip calls `onUpdate({ mode })` then `onNext()` immediately (no separate Next button needed).

Design: full-width block chips with an emoji icon, bold title line, muted subtitle line. Use the FH design tokens: `#FF9900` selected border, `#161b22` surface background. Match the style from the prototype — large, tap-friendly, 14px border-radius.

---

### 2B. `app/deal-coach/steps/StepAircraftId.tsx` — aircraft identification

This is the most complex step. It has four internal sub-views managed by local `useState`:

**Sub-view A: `prepop`** — shown when `answers.aircraft?.source === 'listing'` and a `listingId` is in the URL params. Shows the pre-populated listing card (name, registration, pills for flip score, ask price, SMOH, ADS-B, panel type). Below the card show a "Not this aircraft, or aircraft not in our database →" row that switches to sub-view B.

**Sub-view B: `change`** — search input with type-ahead (calls `GET /api/listings?q={query}&pageSize=8` and renders results as dropdown rows), plus a divider, plus a "Build aircraft profile from scratch" block chip that switches to sub-view C (step 1 of 5).

- When the search returns no results, show inline: `No listing found — build aircraft profile from scratch →` as a clickable link.
- When user selects a search result, show a mini confirmation card and a "Use this aircraft →" button that saves to `answers.aircraft` and calls `onNext()`.

**Sub-views C1–C5: manual entry form** — a 5-step sub-wizard within this step. Track sub-step with local state. Show a progress bar of 5 dots at the top of each sub-step.

**Sub-step C1 — Identity:**
- Fields: Year (number, 1940–2025, required), Make (select, required), Model (cascading select based on make, required), N-Number / Registration (text, optional — triggers live FAA hint: calls `GET /api/listings?registration={val}&pageSize=1` to check for a match), Serial number (text, optional).
- Make options: Cessna, Piper, Beechcraft, Mooney, Grumman, Cirrus, Diamond, American Champion, Kitfox, Other.
- Model options cascade from make. Store the full model map as a constant in `lib/dealCoach/modelMap.ts`. Include at minimum: all Cessna 150/152/172/182/210/310 variants, Piper PA-28 family, Beechcraft Bonanza/Musketeer family, Mooney M20 family, Grumman AA-1/AA-5 family, Cirrus SR20/SR22.
- Next button only enabled when year + make + model are filled.

**Sub-step C2 — Airframe & hours:**
- Fields: TTAF (number, required), Condition (select: Excellent/Good/Fair/Project), SMOH (number), SNEW (number), STOH (number), SPOH (number), Last annual (text), Annual status (select).
- When SMOH is entered: show a live engine life nudge card. Calculate `pct = smoh / 2000`. If pct < 40% show green "Healthy engine" nudge. If 40–80% show neutral info nudge. If > 80% show amber warning nudge. Use 2000 hrs as the default TBO until the engine model is known from C3.

**Sub-step C3 — Engine:**
- Fields: Engine manufacturer (select), Engine model (cascading select), Number of engines (chip: Single / Twin), Overhaul type (select), Prop manufacturer (select), Prop type (select: Fixed pitch / Constant speed).
- Engine manufacturer options: Lycoming, Continental, Rotax, Pratt & Whitney Canada, Honeywell (Garrett), Rolls-Royce (Allison), Other.
- Store engine model lists as a constant in `lib/dealCoach/engineModelMap.ts`. Include at minimum: Lycoming O-235/O-320/O-360/IO-360/O-540/IO-540/TIO-540 variants, Continental O-200/IO-240/IO-360/IO-470/IO-520/IO-550/TSIO-520/GTSIO-520 variants, Rotax 912/914/915/916 family, PT6A family (key variants), TPE331 family.
- When an engine model is selected, look it up in `lib/dealCoach/tboReference.ts` (a constant map of engine model prefix → TBO hours) and show a TBO reference nudge card: "TBO reference: {model} — {tbo} hours manufacturer TBO."

**Sub-step C4 — Avionics:**
- Multi-select chip groups (tap to toggle, tap again to deselect): Panel type (single-select chips: Steam gauges / Glass panel / Hybrid), Navigation/GPS, Primary flight display, Transponder/ADS-B, Autopilot, Other equipment.
- Each group has 6–9 chips matching the prototype. Store chip groups as a constant in `lib/dealCoach/avionicsOptions.ts`.
- Live selection counter nudge: "X items selected: [first 4 items]…"

**Sub-step C5 — Maintenance & condition:**
- Damage history chips (single-select: NDH / Has damage history / Unknown) — selecting "Has damage history" reveals a textarea.
- Known squawks textarea.
- Paint condition select, Interior condition select.
- Asking price text input with live market context hint (fires on blur, not on input):
  - < $20K: "Below $20K — likely high hours or project aircraft"
  - $20–40K: "Typical for high-time trainers"
  - $40–65K: "Most common flip target segment"
  - $65–100K: "Well-equipped or low-time examples"
  - $100K+: "Complex aircraft or turboprop category"
- Location text input.
- Additional notes textarea.
- "Build aircraft profile →" button assembles the full `AircraftProfile` object, saves to `answers.aircraft`, and calls `onNext()`.

**After all 5 sub-steps complete:** show a summary card identical in style to the pre-populated listing card, displaying the assembled profile with all entered data as pills and stat boxes. Show engine life nudge (green or amber based on SMOH). Two buttons: "Edit profile" (back to C1) and "Use this aircraft →" (`onNext()`).

---

### 2C. `app/deal-coach/steps/StepIntent.tsx` — intent

Four chips: "Buy and flip", "Personal flying", "Flight training / rental", "Business travel". Selecting a chip saves `intent` to answers and shows a contextual nudge card below:

- flip: "Flip mode activated. Deal Desk will include carrying costs, upgrade ROI, and a sensitivity grid showing break-even scenarios."
- personal: "Personal use. Deal Desk will cover acquisition + ongoing operating costs."
- training: "Training ops. Deal Desk will factor 150-hr maintenance intervals and engine reserve."
- business: "Business travel. Avionics specification and IFR capability drive most of the value model."

A "Next →" button appears after chip selection.

---

### 2D. `app/deal-coach/steps/StepParameters.tsx` — deal numbers

Responsive input: detect `window.matchMedia('(hover: none) and (pointer: coarse)')` — if true (mobile/touch) render drum wheels; if false (desktop) render labeled text inputs.

**Drum wheel component** — create `app/deal-coach/components/DrumWheel.tsx`:
- Props: `items: string[]`, `defaultIndex: number`, `label: string`, `onChange: (value: string) => void`
- Renders a 176px-tall scrollable drum with top/bottom gradient fade, a center selector highlight, and momentum physics on drag/mouse-wheel.
- The active item is larger (17px, bold) than surrounding items (14px, muted).
- Supports mouse drag, touch drag, and mouse wheel scroll.
- On value change, calls `onChange` with the selected string.

**Desktop text inputs** — show labeled inputs with `font-family: DM Mono` for price fields. On blur (not on input), fire the market context feedback:
- Offer price: compare to `answers.aircraft?.askingPrice`. Show "X% below ask — good negotiating room" if lower, warn if higher.
- Exit target: no live feedback needed.

**Three wheel/input groups:** Offer price (range $25K–$75K in $500 steps on wheel; text on desktop), Hold period (1 mo through 24 mo on wheel; text on desktop), Exit target (range $28K–$80K in $500 steps on wheel; text on desktop).

**Financing chips** below the wheels: "All cash", "Finance 50%", "Finance 80%". Single-select.

**"Build my Deal Desk →"** button triggers the transition screen then advances to the final step.

---

### 2E. `app/deal-coach/steps/StepTransition.tsx` — building animation

Full-screen centered layout. Animated plane emoji (CSS pulse keyframe). Title "Building your Deal Desk". Subtitle "Pre-filling all sections with your answers and Full Hangar market data."

Six fill rows animate in sequentially (350ms apart, starting after 400ms):
1. Aircraft & asking price → value from answers
2. Offer price → value from answers
3. Upgrades (avionics ROI) → calculated estimate
4. Carrying costs → calculated from hold × monthly burn estimate
5. Financing type → from answers
6. Exit target → value from answers

After all six rows have animated in, wait 600ms then call `onNext()` automatically.

---

### 2F. `app/deal-coach/steps/StepDeepDesk.tsx` — the full P&L desk

This is the payoff screen. It renders the complete 6-section accordion Deal Desk, pre-filled from `answers`.

**Pre-fill logic** — create `lib/dealCoach/prefill.ts` that exports `buildPrefill(answers: CoachAnswers): DeskState`. This function:
- Sets offer price from `answers.offerPrice`
- Sets pre-buy inspection to $500 (standard default)
- Sets title/escrow to $250
- Sets avionics upgrade cost based on avionics chips selected in the aircraft profile (if "Steam gauges" panel + no ADS-B selected → default $6,200 Garmin G5 + GTX345 recommendation)
- Sets squawk contingency to max($600, 5% of offer)
- Sets hold months from `answers.holdMonths`
- Sets monthly hangar to $250 (national average — note this in a comment)
- Sets monthly insurance to $150
- Sets monthly maintenance reserve to $80
- Sets exit title/escrow to $350
- Sets selling costs (photos, ads) to $240
- Sets exit price from `answers.exitTarget`

**DeskState type** — define in `app/deal-coach/steps/StepDeepDesk.tsx` or a shared file:
```ts
interface DeskState {
  offer: number; prebuy: number; title: number; ferry: number; annualReserve: number
  avionics: number; detail: number; squawks: number; contingency: number
  holdMonths: number; hangar: number; insurance: number; maintReserve: number; demoFlight: number
  oppCost: number; brokerage: number; exitTitle: number; sellCosts: number
  exitPrice: number
}
```

**Live P&L calculation** — `calcPL(state: DeskState)` returns:
```ts
{ acq, upgrades, carrying, exitCosts, basis, profit, roi }
```
Where:
- `acq = offer + prebuy + title + ferry + annualReserve`
- `upgrades = avionics + detail + squawks + contingency`
- `carrying = (hangar + insurance + maintReserve + demoFlight) * holdMonths`
- `exitCosts = oppCost + brokerage + exitTitle + sellCosts`
- `basis = acq + upgrades + carrying + exitCosts`
- `profit = exitPrice - basis`
- `roi = profit / basis * 100`

**Layout** — two-column on desktop (lg+): main accordion on left, sticky P&L sidebar on right. Single column on mobile with a sticky P&L bar pinned to the top of the content area (not fixed — use `position: sticky; top: 0; z-index: 10`).

**Six accordion sections** — each has:
- A header row: icon, section title, "PRE-FILLED" green badge (shown when source is coach), section cost badge (e.g. "−$41,750"), chevron toggle.
- A collapsible body with individual line item rows. Each row: label, optional source tag ("from coach" in green, "estimate" in gray, "standard" in gray), and a number input.
- A section total row at the bottom of the body.
- All inputs call `setDesk(prev => ({...prev, [field]: parseFloat(e.target.value)||0}))` and trigger `recalc()`.

Sections:
1. Aircraft acquisition (icon: 🛬) — offer, pre-buy, title, ferry, annual reserve
2. Upgrades & contingency (icon: 🔧) — avionics, detail, squawks, contingency. Include the upgrade ROI info nudge card.
3. Carrying costs (icon: 📅) — hold months, hangar/mo, insurance/mo, maintenance reserve/mo, demo flight/mo
4. Financing & exit costs (icon: 🏁) — opportunity cost, brokerage, exit title, selling costs
5. Exit target (icon: 🎯) — single exit price field + market context nudge
6. Sensitivity grid (icon: 📉) — auto-calculated 4×4 grid (4 hold periods × 4 exit prices). Color cells: green if profit > 0, amber if −$2K to $0, red if < −$2K.

**Sidebar P&L card** (desktop, `lg:block hidden`):
- "Live P&L" heading
- Net profit in large DM Mono font, color: green if positive, red if negative
- ROI pill badge (green/red)
- Breakdown rows: Acquisition, Upgrades, Carrying, Exit costs, separator, All-in basis, Exit
- "Save scenario" button (shows toast "Scenario saved — sign up to access it later →")
- "Export PDF report →" button (shows toast for now)

**Mobile sticky P&L bar** (`lg:hidden`):
- Single row: "Net profit" label + large number + ROI % + basis + exit
- Sits at top of content, sticky

Section 1 and Section 5 open by default. Others collapsed. User can expand any section.

---

## Phase 3 — Main orchestrator component

Create `app/deal-coach/DealCoachClient.tsx`:

```tsx
'use client'
// Manages wizard state, step progression, progress bar, and renders the active step.
```

State:
```ts
const [step, setStep] = useState<DealCoachStep>('entry')
const [answers, setAnswers] = useState<CoachAnswers>({ mode: 'buy' })
```

Step enum: `'entry' | 'aircraft' | 'intent' | 'parameters' | 'transition' | 'desk'`

Progress map (step → percent, label):
```ts
const progressMap: Record<DealCoachStep, [number, string]> = {
  entry:      [4,   'Start'],
  aircraft:   [28,  'Step 1 of 4'],
  intent:     [50,  'Step 2 of 4'],
  parameters: [72,  'Step 3 of 4'],
  transition: [88,  'Building…'],
  desk:       [100, 'Deal Desk'],
}
```

**URL param handling** — on mount, read `?listing_id=` from `useSearchParams()`. If present, pre-populate `answers.aircraft` with `{ source: 'listing', listingId }` and attempt to fetch listing data from `GET /api/listings/{listing_id}/full`. Map the response to `AircraftProfile`. This is how the "Open Deal Coach" button on listing detail pages will work.

**`onUpdate`** — merges patch into answers: `setAnswers(prev => ({...prev, ...patch}))`

**`onNext`** — advances step according to mode:
- entry → aircraft (always)
- aircraft → intent (if mode === 'buy')
- aircraft → desk (if mode === 'sell' — skip to sell report, future scope)
- intent → parameters (if intent === 'flip' or 'personal' or 'training' or 'business')
- parameters → transition
- transition → desk

**Header** — render the Full Hangar logo (use existing `HeaderBrand` component or inline the Barlow Condensed wordmark), progress bar, and step label. This header is standalone — do NOT use `SiteHeader` here since this is a focused wizard flow. Keep it clean and minimal.

**Styling** — use the existing `--fh-*` design tokens from `globals.css`. Background: `#0d1117`. Surface cards: `#161b22`. Orange: `var(--fh-orange, #FF9900)`. Font stack: `DM Sans` for body, `Barlow Condensed` for headings, `DM Mono` for numbers. All from `next/font` already loaded in the root layout.

---

## Phase 4 — Helper constants

Create these files in `lib/dealCoach/`:

**`lib/dealCoach/modelMap.ts`** — `Record<string, string[]>` mapping make → model array. Include all makes from the aircraft form (Cessna, Piper, Beechcraft, Mooney, Grumman, Cirrus, Diamond, American Champion, Kitfox, Other).

**`lib/dealCoach/engineModelMap.ts`** — `Record<string, string[]>` mapping engine manufacturer → engine model array.

**`lib/dealCoach/tboReference.ts`** — `Record<string, number>` mapping engine model prefix → TBO hours. Example:
```ts
export const tboReference: Record<string, number> = {
  'O-200': 1800, 'IO-240': 2000, 'O-320': 2000, 'O-360': 2000, 'IO-360': 2000,
  'O-540': 2000, 'IO-540': 2000, 'TIO-540': 1800, 'IO-470': 1500, 'IO-520': 1700,
  'IO-550': 2000, 'TSIO-520': 1400, 'O-235': 2000, '912 ULS': 2000, '915 iS': 2000,
  'PT6A': 3600,
}
// lookup: find first key that the engine model string starts with
export function lookupTBO(engineModel: string): number | null { ... }
```

**`lib/dealCoach/avionicsOptions.ts`** — `AvionicsGroup[]` type with `{ groupLabel: string; items: string[] }`. Groups: Navigation/GPS, Primary flight display, Transponder/ADS-B, Autopilot, Other equipment.

**`lib/dealCoach/prefill.ts`** — `buildPrefill(answers: CoachAnswers): DeskState` as described in Phase 2F.

---

## Phase 5 — Homepage CTA button

Edit `app/page.tsx`.

Find the existing "Browse Deals" CTA button (it links to `/listings`). This is likely inside the hero section. Add a second button immediately next to it — "Deal Coach →" linking to `/deal-coach`.

**Button styling rules:**
- "Browse Deals" remains the primary CTA — keep its existing style (solid orange background, black text).
- "Deal Coach →" is the secondary CTA — use a ghost/outline style: transparent background, `#FF9900` border, `#FF9900` text, hover fills with subtle orange tint.
- Both buttons sit in a flex row with `gap: 12px`. On mobile they stack vertically (`flex-col sm:flex-row`).
- The "Deal Coach →" button copy: **"Try Deal Coach"** with a small airplane emoji before the text: `✈ Try Deal Coach`.

If the homepage has a deals section or listing cards section, also add a small text link or chip beneath the section heading: `"Analyze any deal → Deal Coach"` linking to `/deal-coach`.

---

## Phase 6 — "Open in Deal Coach" on listing detail

Edit `app/listings/[id]/page.tsx` (or the relevant client component).

Find the section where the Deal Desk card or flip analysis CTA is rendered. Add a secondary button or link:
```
"✈ Analyze in Deal Coach"  →  /deal-coach?listing_id={id}
```

Style: ghost button, same as above. Place it near the existing "Open Deal Desk" button if one exists, or in the score/action area of the listing detail.

---

## Phase 7 — Sell path stub

For the seller path (when `answers.mode === 'sell'`), the full wizard is out of scope for this agent. Implement a minimal stub:

After aircraft identification in sell mode, show a single screen `StepSellStub.tsx`:
- Heading: "Sell intelligence — coming soon"
- Body: "We're building a full market positioning report for sellers. In the meantime, here's what we know about the market for your aircraft:" followed by a market summary card (make/model median, active listings count, avg days on market — pulled from `GET /api/listings?make=X&model=Y&pageSize=1` response metadata or hardcoded stub values).
- A "Browse comparable listings →" button linking to `/listings?make={make}&model={model}`.

---

## Phase 8 — No-auth guard

Ensure `/deal-coach` has NO auth middleware, no session check, no redirect to login.

Check `middleware.ts` in the project root. If it has a matcher that would catch `/deal-coach`, add `/deal-coach` to the public routes exclusion list alongside any existing public paths like `/`, `/listings`, `/beta`.

---

## Verification checklist

Run each item and confirm before marking complete:

- [ ] `http://localhost:3001/deal-coach` loads without auth prompt, shows entry screen
- [ ] Tapping "I'm buying / flipping" advances to aircraft screen
- [ ] "Not this aircraft" row is visible and tapping it goes to change/search screen
- [ ] Searching "N1" shows type-ahead results from the listings API
- [ ] Searching a term with no results shows "build from scratch" link
- [ ] "Build aircraft profile from scratch" opens 5-step manual form
- [ ] Step 1: Year + Make → Model dropdown populates correctly
- [ ] Step 1: Entering a valid N-number triggers registration hint
- [ ] Step 1: Next button hidden until year/make/model filled
- [ ] Step 2: Entering SMOH shows engine life nudge card
- [ ] Step 3: Selecting engine make populates engine model dropdown
- [ ] Step 3: Selecting a known engine model shows TBO reference nudge
- [ ] Step 4: Avionics chips toggle on/off, selection counter updates
- [ ] Step 5: "Has damage history" reveals detail textarea
- [ ] Step 5: Asking price blur shows market context hint
- [ ] Step 5: "Build aircraft profile →" assembles summary card
- [ ] Summary card shows name, pills, stats, and engine nudge
- [ ] Intent chips show contextual nudge and reveal Next button
- [ ] Drum wheels scroll on desktop mouse wheel
- [ ] Drum wheels drag on touch (test in browser device emulation)
- [ ] Financing chip selects correctly
- [ ] "Build my Deal Desk →" triggers transition animation
- [ ] Transition: 6 fill rows animate in sequentially
- [ ] Transition: auto-advances to Deep Desk after animation
- [ ] Deep Desk: all 6 sections visible, sections 1 and 5 open by default
- [ ] Deep Desk: "PRE-FILLED" badge visible on pre-filled sections
- [ ] Deep Desk: editing any input field updates the P&L sidebar in real time
- [ ] Deep Desk: sensitivity grid updates when inputs change
- [ ] Deep Desk: P&L sidebar hidden on mobile, replaced by sticky top bar
- [ ] Homepage: "✈ Try Deal Coach" button visible next to "Browse Deals"
- [ ] Homepage: "✈ Try Deal Coach" links to `/deal-coach`
- [ ] Listing detail: "Analyze in Deal Coach" button/link visible
- [ ] `http://localhost:3001/deal-coach?listing_id=SOME_ID` pre-populates the aircraft
- [ ] Both dark and light themes render correctly throughout all screens
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] No console errors in browser

---

## AGENTS.md update (do this last)

Append to the **Completed Recently → Frontend Product and UX** section:
```
- Deal Coach shipped at `/deal-coach` (public, no auth): 4-step conversational wizard (entry → aircraft ID → intent → parameters) feeding a pre-filled 6-section Deep Desk P&L with live sidebar. Aircraft identification supports: listing pre-pop (via `?listing_id=`), N-number type-ahead search, and a 5-step manual entry form (identity → airframe/hours → engine → avionics → maintenance). Drum wheels on mobile, text inputs on desktop. Homepage CTA added: "✈ Try Deal Coach" ghost button next to "Browse Deals". Listing detail gets "Analyze in Deal Coach" link. Helper constants in `lib/dealCoach/` (modelMap, engineModelMap, tboReference, avionicsOptions, prefill).
```

Append to the **Open Work → Medium Priority** section:
```
- **Deal Coach seller path:** `StepSellStub` is a placeholder — full market positioning report, upgrade ROI for sellers, and listing strategy screen to be built as a follow-on FRONTEND task.
- **Deal Coach scenario persistence:** "Save scenario" currently shows a toast. Wire to `deal_desk_scenarios` table via `POST /api/deal-desk/scenarios` with a prompt to create an account if not logged in.
- **Deal Coach listing detail pre-pop:** validate that `GET /api/listings/{id}/full` response fields map cleanly to `AircraftProfile` — patch any missing fields.
```
