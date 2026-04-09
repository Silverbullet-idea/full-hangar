# Seller Intelligence — Two-Lane Build (BACKEND + FRONTEND parallel)

> Run these two agents simultaneously. FRONTEND stubs the API with mock data
> during development, then connects to the real BACKEND endpoint once it ships.
> Both agents read AGENTS.md first and update it when done.

---

# ═══════════════════════════════════════════════════════
# LANE 1 — BACKEND Agent
# ═══════════════════════════════════════════════════════

## Scope
Build `GET /api/sell-intel` — a single endpoint that aggregates all intelligence
needed to power the seller report. Queries existing tables only. No new migrations.

**BACKEND owns:** `app/api/sell-intel/route.ts`, `lib/sellIntel/compute.ts`,
`lib/sellIntel/types.ts`

**Do NOT touch:** `app/deal-coach/`, `app/page.tsx`, any scraper files.

---

## The endpoint

### Route
```
GET /api/sell-intel?make=Cessna&model=172N&yearMin=1975&yearMax=1983&smoh=312&askingPrice=42500&panelType=steam&avionics=ADS-B+out,Garmin+GNS+430W
```

All params are optional except `make`. Degrade gracefully when params are missing —
return whatever intelligence is computable from what's provided.

### Response shape — define in `lib/sellIntel/types.ts`

```ts
export interface SellIntelPayload {
  aircraft: {
    make: string
    model?: string
    yearMin?: number
    yearMax?: number
    smoh?: number
    askingPrice?: number
    panelType?: string
    avionicsSelected?: string[]
  }
  marketPosition: MarketPositionData
  upgradeROI: UpgradeROIData
  listingStrategy: ListingStrategyData
  computedAt: string
  dataQuality: 'strong' | 'moderate' | 'limited' // based on comp count
}

export interface MarketPositionData {
  medianAskPrice: number | null
  p25AskPrice: number | null
  p75AskPrice: number | null
  activeListingCount: number
  avgDaysOnMarket: number | null
  priceVsMedianPercent: number | null  // seller's asking price vs median
  demandTier: 'HIGH' | 'MODERATE' | 'LOW' | null
  topStates: Array<{ state: string; count: number }>
  recentOwnershipChanges: number  // FAA transfer count last 12 months
  comps: CompListing[]  // top 6 most similar active listings
  priceHistory: PriceHistoryPoint[]  // monthly median last 6 months
}

export interface CompListing {
  id: string
  year: number | null
  make: string
  model: string
  askingPrice: number
  ttaf: number | null
  smoh: number | null
  location: string | null
  daysOnMarket: number | null
  flipScore: number | null
  flipTier: string | null
  url: string | null
}

export interface PriceHistoryPoint {
  month: string  // 'YYYY-MM'
  medianPrice: number
  listingCount: number
}

export interface UpgradeROIData {
  avionicsItems: UpgradeItem[]
  engineNarrative: EngineNarrative
  annualAdvice: AnnualAdvice
  damageHistoryImpact: string | null
  bestSpendSummary: string
  mustSkipItems: string[]
}

export interface UpgradeItem {
  name: string
  installCost: number
  valueAdd: number
  netROI: number
  recommendation: 'DO' | 'SKIP' | 'OPTIONAL'
  rationale: string
}

export interface EngineNarrative {
  smoh: number | null
  tbo: number | null
  pctRemaining: number | null
  framing: string  // the sentence to put in the listing
  buyerRiskLevel: 'LOW' | 'MODERATE' | 'HIGH'
  overhaulCostEstimate: number | null
}

export interface AnnualAdvice {
  status: 'fresh' | 'current' | 'expiring_soon' | 'expired' | 'unknown'
  recommendation: string
  estimatedCost: number | null
}

export interface ListingStrategyData {
  suggestedListPrice: number | null
  negotiationFloor: number | null
  priceReductionSchedule: PriceStep[]
  platforms: PlatformRecommendation[]
  keywords: string[]
  photoGuide: string[]
  brokerVsSelf: BrokerCalc
}

export interface PriceStep {
  dayThreshold: number   // e.g. 30, 60, 90
  action: string         // e.g. "Reduce 5% if no offers"
  targetPrice: number | null
}

export interface PlatformRecommendation {
  name: string
  url: string
  priority: 'PRIMARY' | 'SECONDARY'
  rationale: string
}

export interface BrokerCalc {
  selfSellNetEstimate: number | null
  brokerNetEstimate: number | null  // assumes 5% commission
  breakEvenDaysOnMarket: number | null
  recommendation: string
}
```

---

## Computation logic — `lib/sellIntel/compute.ts`

Create a `computeSellIntel(params)` function. It runs the following queries against
Supabase using `createPrivilegedServerClient()`.

### A) Market position queries

**Comp query** — `public_listings` filtered by:
- `make` ILIKE `%{make}%`
- `model` ILIKE `%{model}%` (if provided)
- `year` BETWEEN `yearMin` AND `yearMax` (if provided, otherwise ±7 year window from
  midpoint, or no year filter if no year given)
- `asking_price` > 0 AND `asking_price` IS NOT NULL
- ORDER BY `flip_score` DESC NULLS LAST
- LIMIT 50 for aggregation, LIMIT 6 for the comps display array

From these 50 rows compute:
- `medianAskPrice` — sort by price, take middle value
- `p25AskPrice`, `p75AskPrice` — 25th and 75th percentile
- `activeListingCount` — count of rows
- `avgDaysOnMarket` — average of `days_on_market` where not null
- `topStates` — group by state, count, top 5

**Price history** — group the same comp set by month (`DATE_TRUNC('month', scraped_at)`)
and compute median price per month. Use last 6 months only.
Run as a raw RPC call or a simple Supabase query with `scraped_at` filter.

**Demand tier** — derive from `activeListingCount` and `avgDaysOnMarket`:
- HIGH: count > 50 AND avg DOM < 45 days
- LOW: count < 15 OR avg DOM > 90 days
- MODERATE: everything else
- null: insufficient data (count < 5)

**FAA ownership changes** — query `detected_ownership_changes` WHERE
`make` matches (join via `listing_id` → `aircraft_listings.make`) AND
`new_cert_date` >= NOW() - INTERVAL '12 months'. Count the rows.
This is the "real transaction velocity" signal.

**priceVsMedianPercent** — only if `askingPrice` param provided:
`((askingPrice - medianAskPrice) / medianAskPrice) * 100`
Positive = priced above median. Negative = priced below.

### B) Upgrade ROI computation

**Avionics items** — for each avionics item in `avionics_market_values` where
`aircraft_segment = 'piston_single'` (or the appropriate segment for the make):
- Retrieve `price_p25` as the conservative install-value basis
- Cross-reference against `avionicsSelected` param to determine if already installed
- For items NOT installed: compute `valueAdd = price_p25`, `installCost` from a
  hardcoded install-cost map (store in `lib/sellIntel/installCostMap.ts`):

```ts
// lib/sellIntel/installCostMap.ts
// Maps canonical avionics unit names to estimated installed cost
export const installCostMap: Record<string, number> = {
  'Garmin G5': 2800,
  'Garmin GTX 345': 3400,
  'Garmin G5 + GTX 345 bundle': 6200,  // combined
  'Garmin GFC 500': 14500,
  'Garmin GTN 750': 18500,
  'Garmin GTN 650': 14000,
  'Garmin GNS 530W': 9500,
  'Garmin GNS 430W': 7500,
  'Aspen EFD 1000': 7200,
  'uAvionix skyBeacon': 2200,
  // add more as needed
}
```

- `netROI = valueAdd - installCost`
- `recommendation`:
  - 'DO' if netROI > 500
  - 'SKIP' if netROI < -2000
  - 'OPTIONAL' otherwise

- Flag engine overhaul as `mustSkipItems` if `smoh` is provided and < 1200:
  "Engine overhaul at {smoh} SMOH: ~$18K–$22K cost, adds ~$10K–$12K value. Net loss ~$8K–$10K. Skip unless required for airworthiness."

**Engine narrative** — query `engine_overhaul_pricing` for the engine model if known,
otherwise use Lycoming O-320 as the default for a C172.
- Get `median_price` as overhaul cost estimate
- Compute `pctRemaining = ((tbo - smoh) / tbo) * 100`
- Generate `framing` string:
  - If pctRemaining > 60: `"{smoh} SMOH — {tbo - smoh} hours of engine life remaining (Lycoming O-320, {tbo}-hr TBO). Low buyer scrutiny."`
  - If pctRemaining 30–60: `"{smoh} SMOH. Engine is mid-life with {tbo - smoh} hours to TBO. Disclose and price accordingly."`
  - If pctRemaining < 30: `"{smoh} SMOH — engine approaching TBO at {tbo} hours. Budget ${overhaulCost.toLocaleString()} overhaul cost into your floor price."`

**Annual advice** — from `annualStatus` param:
- fresh / current → "Your fresh annual is a top-3 selling point. Lead with it in the listing headline. Buyers pay a $1,500–$2,500 premium for aircraft with a recent annual."
- expiring_soon → "Consider completing the annual before listing (~$1,200–$1,800). Buyers will request a price reduction equal to annual cost anyway."
- expired / unknown → "Aircraft with expired annuals typically receive $2,500–$4,000 lower offers. Complete the annual before listing."

### C) Listing strategy computation

**Suggested list price** — if `medianAskPrice` is available:
- Base: `medianAskPrice`
- Adjust UP by:
  - +$2,500 if fresh annual
  - +$1,500 per ROI-positive avionics item already installed (capped at +$8,000)
  - +$1,500 if `smoh` provided and pctRemaining > 70%
- Adjust DOWN by:
  - -$2,000 if `smoh` provided and pctRemaining < 25%
  - -$1,500 if damage history (pass through from params if `damageHistory=true`)
- Round to nearest $500

**Negotiation floor** = `suggestedListPrice * 0.93` (standard 7% negotiation room),
rounded to nearest $500.

**Price reduction schedule**:
```ts
[
  { dayThreshold: 0, action: 'List at suggested price. Hold firm for 30 days.', targetPrice: suggestedListPrice },
  { dayThreshold: 30, action: 'If no serious inquiries, reduce 5%.', targetPrice: Math.round(suggestedListPrice * 0.95 / 500) * 500 },
  { dayThreshold: 60, action: 'Reduce another 3% and add "pre-buy inspection contributed".', targetPrice: Math.round(suggestedListPrice * 0.92 / 500) * 500 },
  { dayThreshold: 90, action: 'Reassess: is this the right market? Consider broker.', targetPrice: null },
]
```

**Platforms** — hardcoded but make-aware:
```ts
const platforms = [
  { name: 'Controller.com', url: 'https://www.controller.com', priority: 'PRIMARY',
    rationale: 'Largest GA inventory. Best for serious buyers with financing.' },
  { name: 'Trade-A-Plane', url: 'https://www.trade-a-plane.com', priority: 'PRIMARY',
    rationale: 'Second largest. Strong broker presence. Include here always.' },
  { name: 'Barnstormers', url: 'https://www.barnstormers.com', priority: 'PRIMARY',
    rationale: 'Largest community of cash buyers. Especially strong for sub-$60K aircraft.' },
  { name: 'ASO.com', url: 'https://www.aso.com', priority: 'SECONDARY',
    rationale: 'Additional exposure. Different buyer pool from the top three.' },
  { name: 'AOPA Pilot Marketplace', url: 'https://www.aopa.org', priority: 'SECONDARY',
    rationale: 'Reaches AOPA members — typically serious, financially qualified buyers.' },
]
// For experimental/homebuilt, add Vansairforce.net as PRIMARY
// For vintage/warbird, add warbirdsonly.com as PRIMARY
```

**Keywords** — generate from make/model/avionics:
Base: `["fresh annual", "ready to fly", "logs complete"]`
Add if applicable: `"WAAS GPS"`, `"ADS-B compliant"`, `"glass panel"`, `"no damage history"`,
`"low time engine"`, `"one owner"`, `"always hangared"`

**Photo guide** — hardcoded best practice list:
```ts
[
  "3/4 front view in morning light (the hero shot — lead with this)",
  "Full panel, engine running, all gauges visible",
  "Logbook stack — airframe, engine, prop covers spread open",
  "Engine bay — clean and accessible",
  "Interior front seats and rear",
  "Left and right profile, gear and fairings",
  "Wingtip, tail, and any distinctive features",
  "Any recent work: annual signoff page, 337s, STCs",
]
```

**Broker vs self calc**:
- `selfSellNetEstimate = suggestedListPrice * 0.95` (typical negotiation)
- `brokerNetEstimate = suggestedListPrice * 0.95 * 0.95` (5% commission on sale price)
- `breakEvenDaysOnMarket`: if broker gets it sold in 30 days vs your 60 days avg DOM,
  carrying cost savings partially offset the commission.
  `breakEvenDays = Math.round((brokerFee) / (monthlyCarryingCost / 30))`
  Use $490/mo as default carrying cost (hangar + insurance estimate).
- `recommendation`: if `activeListingCount` > 30 AND `avgDaysOnMarket` < 60:
  "Market is active — self-sell is viable. Save the commission."
  Else: "Market is slower — a broker's buyer network may be worth the 5% fee."

### D) Data quality assessment
```ts
dataQuality =
  activeListingCount >= 10 ? 'strong' :
  activeListingCount >= 4  ? 'moderate' :
  'limited'
```
When `limited`, include a note in the response: "Fewer than 4 comparable listings
found. Intelligence is directional — treat price estimates as ranges, not targets."

---

## Route handler — `app/api/sell-intel/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
import { computeSellIntel } from '@/lib/sellIntel/compute'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const params = {
      make: searchParams.get('make') || '',
      model: searchParams.get('model') || undefined,
      yearMin: searchParams.get('yearMin') ? parseInt(searchParams.get('yearMin')!) : undefined,
      yearMax: searchParams.get('yearMax') ? parseInt(searchParams.get('yearMax')!) : undefined,
      smoh: searchParams.get('smoh') ? parseInt(searchParams.get('smoh')!) : undefined,
      askingPrice: searchParams.get('askingPrice') ? parseInt(searchParams.get('askingPrice')!) : undefined,
      panelType: searchParams.get('panelType') || undefined,
      avionicsSelected: searchParams.get('avionics')?.split(',').filter(Boolean) || [],
      annualStatus: searchParams.get('annualStatus') || undefined,
      damageHistory: searchParams.get('damageHistory') === 'true',
    }

    if (!params.make) {
      return NextResponse.json({ error: 'make is required' }, { status: 400 })
    }

    const payload = await computeSellIntel(params)
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
    })
  } catch (err) {
    console.error('[sell-intel]', err)
    return NextResponse.json({ error: 'Failed to compute sell intelligence' }, { status: 500 })
  }
}
```

---

## Verification (BACKEND)
- [ ] `GET /api/sell-intel?make=Cessna&model=172N&yearMin=1975&yearMax=1983` returns 200 with valid JSON
- [ ] `medianAskPrice` is a number, not null, for a common make/model
- [ ] `comps` array has up to 6 items with correct fields
- [ ] `priceHistory` has 1–6 monthly data points
- [ ] `suggestedListPrice` is within 20% of `medianAskPrice`
- [ ] `avionicsItems` array is non-empty for piston_single segment
- [ ] `platforms` has exactly 5 items
- [ ] `keywords` array has at least 3 items
- [ ] `GET /api/sell-intel?make=Unknown9999` returns `dataQuality: 'limited'`
- [ ] `npx tsc --noEmit` clean
- [ ] No Supabase service key exposed in client-facing code

---

---

# ═══════════════════════════════════════════════════════
# LANE 2 — FRONTEND Agent
# ═══════════════════════════════════════════════════════

## Scope
Replace `StepSellStub.tsx` with a full seller path: goals step + interactive
intelligence report. Consume `GET /api/sell-intel`. During development, use the
mock data defined below — swap to real API once BACKEND confirms the endpoint is live.

**FRONTEND owns:** `app/deal-coach/steps/StepSellGoals.tsx`,
`app/deal-coach/steps/StepSellReport.tsx`,
`app/deal-coach/components/SellReport/` (sub-components),
`lib/sellIntel/types.ts` (shared with BACKEND — define it here, BACKEND aligns to it),
`lib/sellIntel/mock.ts`

**Do NOT touch:** `app/api/`, `lib/db/`, `scraper/`, `supabase/migrations/`

---

## Phase 1 — Shared types and mock data

### `lib/sellIntel/types.ts`
Copy the full type definitions from the BACKEND spec above. This is the shared
contract. FRONTEND defines it, BACKEND aligns to it.

### `lib/sellIntel/mock.ts`
Create realistic mock data that covers all fields, including edge cases:

```ts
export const mockSellIntelPayload: SellIntelPayload = {
  aircraft: { make: 'Piper', model: 'PA-28-181 Archer', yearMin: 1980, yearMax: 1984,
    smoh: 890, askingPrice: 54000, panelType: 'steam',
    avionicsSelected: ['Garmin GNS 430W', 'ADS-B out'] },
  marketPosition: {
    medianAskPrice: 52000, p25AskPrice: 46500, p75AskPrice: 58500,
    activeListingCount: 14, avgDaysOnMarket: 67,
    priceVsMedianPercent: 3.8,
    demandTier: 'MODERATE',
    topStates: [
      { state: 'TX', count: 3 }, { state: 'FL', count: 2 }, { state: 'CA', count: 2 },
      { state: 'AZ', count: 2 }, { state: 'CO', count: 1 }
    ],
    recentOwnershipChanges: 8,
    comps: [
      { id: 'c1', year: 1982, make: 'Piper', model: 'PA-28-181', askingPrice: 49500,
        ttaf: 3800, smoh: 1100, location: 'Dallas TX', daysOnMarket: 42,
        flipScore: 68, flipTier: 'GOOD', url: null },
      { id: 'c2', year: 1981, make: 'Piper', model: 'PA-28-181', askingPrice: 53000,
        ttaf: 4100, smoh: 620, location: 'Phoenix AZ', daysOnMarket: 28,
        flipScore: 72, flipTier: 'GOOD', url: null },
      { id: 'c3', year: 1983, make: 'Piper', model: 'PA-28-181', askingPrice: 57500,
        ttaf: 2900, smoh: 310, location: 'Tampa FL', daysOnMarket: 14,
        flipScore: 79, flipTier: 'GOOD', url: null },
    ],
    priceHistory: [
      { month: '2025-10', medianPrice: 50500, listingCount: 11 },
      { month: '2025-11', medianPrice: 51000, listingCount: 12 },
      { month: '2025-12', medianPrice: 50000, listingCount: 9 },
      { month: '2026-01', medianPrice: 52500, listingCount: 14 },
      { month: '2026-02', medianPrice: 53000, listingCount: 13 },
      { month: '2026-03', medianPrice: 52000, listingCount: 14 },
    ],
  },
  upgradeROI: {
    avionicsItems: [
      { name: 'Garmin GTX 345 ADS-B', installCost: 3400, valueAdd: 4800,
        netROI: 1400, recommendation: 'DO',
        rationale: 'ADS-B In+Out adds $4,800 buyer premium. $1,400 net positive.' },
      { name: 'Garmin G5 (HSI replacement)', installCost: 2800, valueAdd: 3200,
        netROI: 400, recommendation: 'OPTIONAL',
        rationale: 'Modest positive ROI. Improves appeal but not essential.' },
      { name: 'Full paint', installCost: 12000, valueAdd: 5000,
        netROI: -7000, recommendation: 'SKIP',
        rationale: 'Full repaint rarely recovers cost. Detail clean instead (~$400).' },
      { name: 'Engine overhaul (890 SMOH)', installCost: 20000, valueAdd: 11000,
        netROI: -9000, recommendation: 'SKIP',
        rationale: '890 SMOH is mid-life. Overhaul at this stage loses ~$9,000.' },
    ],
    engineNarrative: {
      smoh: 890, tbo: 2000, pctRemaining: 55.5,
      framing: '890 SMOH — 1,110 hours of certified engine life remaining (Lycoming O-360, 2,000-hr TBO). Mid-life engine with no overhaul pressure.',
      buyerRiskLevel: 'LOW',
      overhaulCostEstimate: 20000,
    },
    annualAdvice: {
      status: 'fresh',
      recommendation: 'Your fresh annual is a top-3 selling point. Lead with it in the listing headline. Buyers pay a $1,500–$2,500 premium.',
      estimatedCost: null,
    },
    damageHistoryImpact: null,
    bestSpendSummary: 'Best spend before listing: GTX 345 ADS-B upgrade ($3,400 installed, +$1,400 net) + detail clean ($400). Skip paint and engine work entirely.',
    mustSkipItems: [
      'Engine overhaul — 890 SMOH is mid-life. Net loss ~$9,000.',
      'Full repaint — rarely recovers cost at this price point. Detail clean instead.',
    ],
  },
  listingStrategy: {
    suggestedListPrice: 54000,
    negotiationFloor: 50000,
    priceReductionSchedule: [
      { dayThreshold: 0, action: 'List at $54,000. Hold firm for 30 days.', targetPrice: 54000 },
      { dayThreshold: 30, action: 'Reduce to $51,500 if no serious inquiries.', targetPrice: 51500 },
      { dayThreshold: 60, action: 'Reduce to $50,000 and offer to contribute to pre-buy.', targetPrice: 50000 },
      { dayThreshold: 90, action: 'Reassess: consider broker or price at floor.', targetPrice: null },
    ],
    platforms: [
      { name: 'Controller.com', url: 'https://www.controller.com', priority: 'PRIMARY',
        rationale: 'Largest GA inventory. Best for serious buyers with financing.' },
      { name: 'Trade-A-Plane', url: 'https://www.trade-a-plane.com', priority: 'PRIMARY',
        rationale: 'Second largest. Strong broker presence.' },
      { name: 'Barnstormers', url: 'https://www.barnstormers.com', priority: 'PRIMARY',
        rationale: 'Best for cash buyers under $60K.' },
      { name: 'ASO.com', url: 'https://www.aso.com', priority: 'SECONDARY',
        rationale: 'Additional exposure, different buyer pool.' },
      { name: 'AOPA Pilot Marketplace', url: 'https://www.aopa.org', priority: 'SECONDARY',
        rationale: 'Reaches financially qualified AOPA members.' },
    ],
    keywords: ['fresh annual', 'WAAS GPS', 'ADS-B compliant', 'ready to fly',
      'logs complete', 'always hangared', 'IFR equipped'],
    photoGuide: [
      '3/4 front view in morning light — lead with this',
      'Full panel, engine running, all gauges visible',
      'Logbook stack — airframe, engine, prop spread open',
      'Engine bay — clean and accessible',
      'Interior: front seats and rear',
      'Left and right profiles',
      'Any recent work: annual signoff page, 337s',
    ],
    brokerVsSelf: {
      selfSellNetEstimate: 51300,
      brokerNetEstimate: 48735,
      breakEvenDaysOnMarket: 45,
      recommendation: 'Market is moderately active — self-sell is viable. Save the ~$2,700 commission.',
    },
  },
  computedAt: new Date().toISOString(),
  dataQuality: 'strong',
}
```

---

## Phase 2 — StepSellGoals.tsx (replaces StepSellStub)

Create `app/deal-coach/steps/StepSellGoals.tsx`.

This step collects seller goals and triggers the intelligence fetch.

### Layout
```
← Back

What matters most to you?

[Get top dollar]  [Sell in 30 days]  [Balance speed + price]

[contextual nudge appears after chip selection]

── Drum/input row (mobile: drums, desktop: inputs) ──

  Target price      Timeline
  [drum/input]      [drum/input]

── Finance context ──

Do you have a loan on this aircraft?
[No — owned free and clear]  [Yes — have a loan balance]

[Loan balance input — appears if Yes selected]

[Build my sell strategy →]  (disabled until goal chip selected)
```

### Goal nudges (show immediately on chip tap, before Next):
- "Get top dollar": Green nudge — "Premium strategy: list 8% above median, hold firm 30 days. Budget 60–90 days. Strong photos and pre-buy-ready logbooks justify the premium."
- "Sell in 30 days": Amber nudge — "Fast-sale strategy: price at or 3% below median. Offer to contribute $300–500 toward buyer's pre-buy inspection — removes the #1 buyer hesitation."
- "Balance speed + price": Neutral nudge — "Balanced approach: list at median, 'firm for 30 days.' Reduce 5% if no offers. Highest expected value for most sellers."

### Target price drum/input
- Mobile (touch): drum wheel, range $20K–$180K in $500 steps, default to
  `answers.aircraft?.askingPrice` if set
- Desktop: text input in DM Mono, blur fires no feedback (BACKEND will handle context)

### Timeline drum/input
- Mobile: drum wheel items: ['ASAP', '2 weeks', '30 days', '45 days', '60 days',
  '90 days', '6 months', 'No rush']
- Desktop: select dropdown with same options

### onNext behavior
Call `onUpdate({ sellGoal, sellTargetPrice, sellTimeline, sellHasLoan, sellLoanBalance })`
then call `onNext()`. The orchestrator (`DealCoachClient`) will advance to `StepSellReport`.

---

## Phase 3 — Update DealCoachClient.tsx

Add `'sell-goals'` and `'sell-report'` to the `DealCoachStep` type.

Update the step progression:
```
sell mode: entry → aircraft → sell-goals → sell-report
```

Update `progressMap`:
```ts
'sell-goals':  [60, 'Step 3 of 4'],
'sell-report': [100, 'Sell Strategy'],
```

Update `onNext` routing:
```ts
case 'aircraft':
  if (answers.mode === 'sell') return setStep('sell-goals')
  return setStep('intent')
case 'sell-goals':
  return setStep('sell-report')
```

The `StepSellStub` can remain in the file but will no longer be reachable via
the normal step flow. Keep it as a dead code stub — do not delete it — in case
we need to revert.

---

## Phase 4 — StepSellReport.tsx

This is the payoff screen. Three-tab layout. On mount it fetches from
`/api/sell-intel` (or uses mock during development). Shows a loading state
while fetching.

### `app/deal-coach/steps/StepSellReport.tsx` structure

```tsx
'use client'
// On mount: build query params from answers.aircraft + answers.sellGoal etc.
// Fetch /api/sell-intel (or mockSellIntelPayload during dev)
// Render loading skeleton → then three-tab report
```

**Feature flag for mock vs real** — add at top of file:
```ts
const USE_MOCK = process.env.NODE_ENV === 'development' &&
  process.env.NEXT_PUBLIC_SELL_INTEL_MOCK === 'true'
```
Default to real API. Agents can set `NEXT_PUBLIC_SELL_INTEL_MOCK=true` in `.env.local`
during development.

### Loading state
While fetching, show a full-height skeleton with:
- Animated pulse on three placeholder card blocks
- Text: "Analyzing market data for {make} {model}…" (use aircraft from answers)
- Subtext: "Scanning 10,500+ active listings · Computing upgrade ROI · Building pricing strategy"

### Header (always visible above tabs)
```
← Rerun coach

1979 Piper PA-28-181 Archer   [data quality badge: STRONG DATA / MODERATE / LIMITED]
Sell intelligence report       Computed just now from {activeListingCount} active listings

[data quality nudge if 'limited': "Fewer than 4 comparable listings found. Treat
 price estimates as directional ranges."]
```

### Tab strip
Three tabs: `Market position` | `Upgrade ROI` | `Listing strategy`

Default open tab: `Market position`

### Print / Save button (top right, always visible)
`🖨 Print report` — calls `window.print()`. Add `@media print` CSS that:
- Shows all three tab panels (not just the active one)
- Hides the tab strip
- Hides Back/navigation buttons
- Adds a "Full Hangar — full-hangar.com" footer
- Uses white background with black text

---

## Phase 4A — Tab 1: Market Position

### Sub-components — create in `app/deal-coach/components/SellReport/`

**`MarketSnapshot.tsx`** — the top stat bar:
4 metric cards in a row (2×2 on mobile):
- Median ask: `$XX,XXX` in DM Mono orange
- Active listings: `{count}` with "aircraft for sale"
- Avg days on market: `{n} days` muted if > 60
- Your price vs market: `+X% above median` (orange if positive, green if negative/below)

**`PriceHistoryChart.tsx`** — 6-month price trend.
Use Chart.js (already in your stack) — line chart, median price per month.
Dark surface card, orange line, minimal axes. Show listing count as a secondary
area behind the line (light opacity fill). Mark "Your target" as a horizontal
dashed line in green.

**`CompsTable.tsx`** — the 6 comparable listings.
Table columns: Year/Model | Ask Price | TT | SMOH | Location | DOM | Score
- Price column: highlight if lower than suggested list price (green tint)
- Sort by asking price ascending by default
- "View listing →" link on each row (if `url` is not null)
- Mobile: collapse to cards, show just name + price + score badge

**`DemandSignalCard.tsx`** — demand tier + geography:
- Large `MODERATE DEMAND` badge (color-coded: green/amber/red)
- Top 5 states as horizontal bar chart (simple CSS bars, no library needed)
- "8 ownership changes in the last 12 months" — the FAA transfer signal.
  Explain: "This means roughly 8 aircraft of this type exchanged hands recently.
  Active transaction history = real buyer demand."

**`SeasonalHint.tsx`** — hardcoded seasonal intelligence based on current month.
Use `new Date().getMonth()` to determine current season:
- Spring (Mar–May): "Spring is peak buying season for GA aircraft. List now."
- Summer (Jun–Aug): "Strong buyer activity. Good time to list."
- Fall (Sep–Nov): "Activity slows heading into winter. Price competitively."
- Winter (Dec–Feb): "Slower season. Serious buyers still active but fewer of them.
  Consider waiting until March if not urgent."

---

## Phase 4B — Tab 2: Upgrade ROI

**`UpgradeROITable.tsx`** — the main component.

Full-width table/card list. Each row:
```
[DO/SKIP/OPTIONAL badge] | Item name | Cost | Value add | Net ROI | Rationale
```
Badge colors:
- DO: green background
- SKIP: red background with ✗
- OPTIONAL: amber background

Sort order: DO items first, OPTIONAL second, SKIP last.

Must-skip items shown in a separate red-bordered card below the table:
"Items to skip — negative ROI" with each item as a bullet.

**`EngineNarrativeCard.tsx`**
Visual: a progress bar showing engine life used (orange fill) with the remaining
life in green. Style matches the existing engine panel on listing detail pages.
Below the bar: the `framing` string in a quote-style block — this is the exact
language to copy-paste into a listing.
```
"Copy this to your listing:"
┌─────────────────────────────────────────────┐
│ 890 SMOH — 1,110 hours of certified engine  │
│ life remaining (Lycoming O-360, 2,000-hr    │
│ TBO). Mid-life engine, no overhaul pressure.│
└─────────────────────────────────────────────┘
[Copy to clipboard button]
```

**`AnnualAdviceCard.tsx`**
Simple card: annual status badge + recommendation text + estimated cost if applicable.

**`BestSpendSummary.tsx`**
Green-bordered card at the bottom of the tab:
"Best spend before listing" — the `bestSpendSummary` string in large readable text.
Below it: "Expected value: +$X,XXX net after spend" (computed from sum of DO items' netROI).

---

## Phase 4C — Tab 3: Listing Strategy

**`PricingBand.tsx`** — the price recommendation visual.
A horizontal range bar showing:
- Floor price (left, muted)
- Suggested list price (center, orange, larger)
- P75 market price (right, green — "top of market")
Three labeled points on the bar. Below: "Your target of $X,XXX is [X% above/below]
the suggested list price."

**`PriceReductionTimeline.tsx`**
Vertical timeline of 4 steps. Each step:
- Day badge: "Day 0", "Day 30", "Day 60", "Day 90"
- Action text
- Target price (if not null) in DM Mono
Style: connected vertical line, circle at each step. Active/first step highlighted.

**`PlatformList.tsx`**
Three PRIMARY platforms as full-width cards with a green "PRIMARY" badge.
Two SECONDARY platforms below, smaller, muted border.
Each card: platform name, rationale text, "List here →" external link button.

**`KeywordChips.tsx`**
Header: "Keywords buyers search for — include these in your listing"
Each keyword as a chip. A "Copy all" button that copies the comma-joined list
to clipboard.

**`PhotoGuide.tsx`**
Numbered list, 1–8 shots. Each row: number badge + shot description.
Below: "Pro tip: 12+ photos sell aircraft 2× faster than listings with fewer than 6."

**`BrokerVsSelfCard.tsx`**
Side-by-side comparison:
```
Self-sell                    vs    Broker
Net: $51,300                       Net: $48,735
Timeline: ~67 days avg             Timeline: varies
Commission: $0                     Commission: ~$2,700
```
Recommendation text below in the appropriate nudge card style.

---

## Phase 5 — CTA at report bottom

Below the three tabs, always visible:

```
─────────────────────────────────────────────

Want to list your aircraft on Full Hangar?

Full Hangar is building a marketplace for serious buyers.
Be first when we launch — add your aircraft to the waitlist.

[ Add to listing waitlist → ]     [ 🖨 Print report ]
```

**Waitlist button** — for now, links to a simple `mailto:` with a pre-filled
subject: `"Listing Waitlist: {year} {make} {model}"`. This is a placeholder
until the marketplace build begins.

**Print button** — `window.print()`.

This CTA section is the monetization/growth hook. When the marketplace launches,
"Add to listing waitlist" becomes "Create your listing" and connects to the
seller account flow.

---

## Phase 6 — Navigation wiring

Update `DealCoachClient.tsx`:
- Import `StepSellGoals` and `StepSellReport`
- Add them to the render switch
- Remove the import of `StepSellStub` from the active render path
  (keep the import commented out for easy revert)

---

## Verification (FRONTEND)

- [ ] `http://localhost:3001/deal-coach` → "I'm selling" → aircraft entry → StepSellGoals renders
- [ ] Goal chips show correct nudge cards on tap
- [ ] Target price drum works on mobile emulation; text input shows on desktop
- [ ] Timeline drum/select works
- [ ] Loan balance field appears when "Yes — have a loan" is selected
- [ ] "Build my sell strategy →" disabled until a goal chip is selected
- [ ] Loading skeleton shows while fetching (or mock loads instantly)
- [ ] Market Position tab: all 4 stat cards render with real values
- [ ] Price history chart renders with 6 data points
- [ ] Comps table shows up to 6 rows, sortable by price
- [ ] Demand signal badge shows with color coding
- [ ] Seasonal hint shows correct season for current month
- [ ] Upgrade ROI tab: DO items first, SKIP items last
- [ ] Engine narrative card shows progress bar and copyable framing text
- [ ] Copy to clipboard button works on framing text
- [ ] "Copy all" keywords button works
- [ ] Listing strategy tab: price band renders with 3 labeled points
- [ ] Price reduction timeline shows 4 steps
- [ ] Platforms show PRIMARY/SECONDARY with external links
- [ ] Broker vs self card shows both net amounts
- [ ] Print styles: all 3 tabs visible in print preview
- [ ] Waitlist CTA is visible below tabs
- [ ] `window.print()` fires from both print buttons
- [ ] `← Rerun coach` returns to sell-goals step
- [ ] Full flow from entry → aircraft → goals → report works end-to-end
- [ ] Both dark and light themes correct throughout
- [ ] `npx tsc --noEmit` clean

---

## AGENTS.md update (both agents do this on completion)

**BACKEND** appends to Completed Recently → Backend, Pipeline, and Data Sources:
```
- Sell intelligence API shipped at `GET /api/sell-intel`: aggregates market position
  (median/P25/P75/comps/price history/demand tier/geo/FAA transfers), upgrade ROI
  (avionics items with DO/SKIP/OPTIONAL, engine narrative with copyable framing text,
  annual advice, must-skip list), and listing strategy (suggested price band,
  negotiation floor, price reduction schedule, platform mix, keywords, broker calc)
  from existing tables (`public_listings`, `avionics_market_values`,
  `engine_overhaul_pricing`, `detected_ownership_changes`). No new migrations.
  Response cached 5 min (`s-maxage=300`). Types in `lib/sellIntel/types.ts`.
```

**FRONTEND** appends to Completed Recently → Frontend Product and UX:
```
- Seller path fully built in Deal Coach (replaces StepSellStub): StepSellGoals
  (goal chips + price/timeline inputs + loan flag) and StepSellReport (3-tab
  interactive report: Market Position with price history chart + comps table +
  demand signal + seasonal hint; Upgrade ROI with ROI table + engine narrative
  with copyable framing + annual advice + best-spend summary; Listing Strategy
  with price band visual + reduction timeline + platform list + keywords +
  photo guide + broker-vs-self calc). Print-ready with @media print styles.
  Listing waitlist CTA at report bottom. Mock data in `lib/sellIntel/mock.ts`
  for offline development.
```

**Both** add to Open Work → Medium Priority:
```
- **Seller marketplace (future):** Listing waitlist CTA currently uses mailto.
  When account system ships, replace with real listing creation flow at
  `/account/listings/new` feeding into `aircraft_listings` with
  `source='seller_submitted'` flag.
- **Sell intel data quality:** Price history query runs on `scraped_at` which
  reflects when we scraped, not when the listing was posted. Consider adding
  a `listed_at` column for more accurate DOM and price history signals.
```
