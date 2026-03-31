import { createPrivilegedServerClient } from "@/lib/supabase/server"
import { installCostMap } from "@/lib/sellIntel/installCostMap"
import { getModelUpgradeProfile } from "@/lib/sellIntel/modelUpgradeIntel"
import type {
  AnnualAdvice,
  AvionicsFrequency,
  BrokerCalc,
  CompListing,
  EngineNarrative,
  ListingStrategyData,
  MarketPositionData,
  PlatformRecommendation,
  PriceHistoryPoint,
  SellIntelParams,
  SellIntelPayload,
  UpgradeItem,
  UpgradeROIData,
} from "@/lib/sellIntel/types"

const MONTHLY_CARRYING_USD = 490

type ListingRow = {
  id: string
  year: number | null
  make: string | null
  model: string | null
  asking_price: number | string | null
  total_time_airframe: number | string | null
  engine_hours_smoh: number | string | null
  location_city: string | null
  location_state: string | null
  location_label: string | null
  days_on_market: number | string | null
  flip_score: number | string | null
  flip_tier: string | null
  listing_url: string | null
  url: string | null
  last_seen_date: string | null
  first_seen_date: string | null
  description_full?: string | null
  has_glass_cockpit?: boolean | null
  is_steam_gauge?: boolean | null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function sanitizeIlikeToken(raw: string): string {
  return raw.replace(/[%_]/g, "").trim()
}

function yearFilterBounds(yearMin?: number, yearMax?: number): { low: number; high: number } | null {
  if (yearMin != null && yearMax != null) {
    return { low: Math.min(yearMin, yearMax), high: Math.max(yearMin, yearMax) }
  }
  if (yearMin != null) return { low: yearMin - 4, high: yearMin + 4 }
  if (yearMax != null) return { low: yearMax - 4, high: yearMax + 4 }
  return null
}

function inferSegment(make: string, model: string | undefined, engineCount?: number): string {
  const m = `${make} ${model ?? ""}`.toLowerCase()
  if (/\b(r22|r44|helicopter|rotor|bell 206|robinson)\b/.test(m)) return "rotorcraft"
  if (/\b(citation|phenom|learjet|challenger|gulfstream|global express|mustang)\b/.test(m)) return "jet"
  if (/\b(king air|tbm|pc-12|caravan|turboprop|pt6)\b/.test(m)) return "turboprop"
  if (engineCount != null && engineCount >= 2) return "piston_multi"
  return "piston_single"
}

const AVIONICS_SIGNALS: { token: string; re: RegExp }[] = [
  { token: "ADS-B", re: /ads-?b|gtx\s*3[2345]|uavionix|echo\s*uat/i },
  { token: "WAAS GPS", re: /waas|gns\s*43|gns\s*53|gtn\s*650|gtn\s*750|ifp|gps\s*175/i },
  { token: "glass panel", re: /g1000|g500|g600|g3x|perspective|glass\s*cockpit|entegra|g5000|g3000|txi/i },
  { token: "G1000", re: /g1000/i },
  { token: "GTN 750", re: /gtn\s*750/i },
  { token: "GTN 650", re: /gtn\s*650/i },
  { token: "GNS 430W/530W", re: /gns\s*43|gns\s*53|430w|530w/i },
  { token: "GFC 500/700", re: /gfc\s*(500|600|700)/i },
  { token: "autopilot", re: /autopilot|kap\s*|kfc\s*|s-tec|trutrak|genesis/i },
]

function rowAvionicsHaystack(row: ListingRow): string {
  const parts: string[] = []
  if (row.description_full) parts.push(row.description_full)
  if (row.has_glass_cockpit === true) parts.push("glass cockpit g1000 g500 perspective")
  if (row.is_steam_gauge === true) parts.push("steam gauge six pack")
  return parts.join(" ").toLowerCase()
}

function compsAvionicsFrequencyFromRows(rows: ListingRow[]): AvionicsFrequency[] {
  const n = rows.length
  if (n === 0) return []
  const counts = new Map<string, number>()
  for (const row of rows) {
    const blob = rowAvionicsHaystack(row)
    for (const { token, re } of AVIONICS_SIGNALS) {
      if (re.test(blob)) counts.set(token, (counts.get(token) ?? 0) + 1)
    }
  }
  const out: AvionicsFrequency[] = []
  for (const [token, count] of counts.entries()) {
    out.push({ token, count, pctOfComps: Math.round((count / n) * 1000) / 10 })
  }
  out.sort((a, b) => b.count - a.count)
  return out.slice(0, 12)
}

function defaultEngineModel(make: string, model?: string): string {
  const mk = make.toLowerCase()
  const mo = (model ?? "").toUpperCase()
  if (mk.includes("cessna") && /172|150|152/.test(mo)) return "O-320"
  if (mk.includes("cessna") && /182/.test(mo)) return "O-470"
  if (mk.includes("piper") && /28|ARCHER|WARRIOR|CHEROKEE|PA-28/i.test(model ?? "")) return "O-360"
  return "O-320"
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo]! * (hi - idx) + sorted[hi]! * (idx - lo)
}

function medianFromSorted(sorted: number[]): number | null {
  return percentile(sorted, 0.5)
}

function round500(n: number): number {
  return Math.round(n / 500) * 500
}

function monthKeyFromDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${mo}`
}

function demandTierFrom(count: number, avgDom: number | null): "HIGH" | "MODERATE" | "LOW" | null {
  if (count < 5) return null
  if (count > 50 && avgDom != null && avgDom < 45) return "HIGH"
  if (count < 15 || (avgDom != null && avgDom > 90)) return "LOW"
  return "MODERATE"
}

function resolveInstallCost(canonicalName: string): number | null {
  const n = canonicalName.toLowerCase().trim()
  let best: { len: number; cost: number } | null = null
  for (const [label, cost] of Object.entries(installCostMap)) {
    const k = label.toLowerCase()
    if (n.includes(k) || k.includes(n)) {
      if (!best || k.length > best.len) best = { len: k.length, cost }
    }
  }
  return best?.cost ?? null
}

function avionicsInstalled(selected: string[], canonicalName: string): boolean {
  const c = canonicalName.toLowerCase()
  for (const s of selected) {
    const t = s.toLowerCase().trim()
    if (!t) continue
    if (c.includes(t) || t.includes(c)) return true
  }
  return false
}

function buildAnnualAdvice(annualStatus?: string): AnnualAdvice {
  const raw = (annualStatus ?? "").toLowerCase()
  let status: AnnualAdvice["status"] = "unknown"
  if (raw.includes("fresh")) status = "fresh"
  else if (raw.includes("current")) status = "current"
  else if (raw.includes("expir") && raw.includes("soon")) status = "expiring_soon"
  else if (raw.includes("expir")) status = "expired"

  const copy: Record<AnnualAdvice["status"], { text: string; cost: number | null }> = {
    fresh: {
      text: "Your fresh annual is a top-3 selling point. Lead with it in the listing headline. Buyers often pay a $1,500–$2,500 premium for a recent annual.",
      cost: null,
    },
    current: {
      text: "A current annual is a strong trust signal. Mention month/year of the last annual and whether it was a sign-off or full inspection.",
      cost: null,
    },
    expiring_soon: {
      text: "Consider completing the annual before listing (~$1,200–$1,800). Buyers will often ask for a price reduction equal to annual cost anyway.",
      cost: 1500,
    },
    expired: {
      text: "Aircraft with expired annuals typically receive $2,500–$4,000 lower offers. Completing the annual before listing usually nets better proceeds.",
      cost: 3200,
    },
    unknown: {
      text: "Disclose annual status clearly. Buyers assume worst-case when maintenance timing is vague.",
      cost: null,
    },
  }

  return {
    status,
    recommendation: copy[status].text,
    estimatedCost: copy[status].cost,
  }
}

function basePlatforms(make: string, model?: string): PlatformRecommendation[] {
  const m = `${make} ${model ?? ""}`.toLowerCase()
  const experimental = /\b(experimental|van'?s|rv-\d|homebuilt|e-ab)\b/.test(m)
  const warbird = /\b(warbird|p-51|t-6|vintage military|spitfire)\b/.test(m)

  const out: PlatformRecommendation[] = [
    {
      name: "Controller.com",
      url: "https://www.controller.com",
      priority: "PRIMARY",
      rationale: "Largest GA inventory. Best for serious buyers with financing.",
    },
    {
      name: "Trade-A-Plane",
      url: "https://www.trade-a-plane.com",
      priority: "PRIMARY",
      rationale: "Second largest. Strong broker presence. Include here always.",
    },
    {
      name: "Barnstormers",
      url: "https://www.barnstormers.com",
      priority: "PRIMARY",
      rationale: "Largest community of cash buyers. Especially strong for sub-$60K aircraft.",
    },
    experimental
      ? {
          name: "VansAirForce.net",
          url: "https://www.vansairforce.net",
          priority: "PRIMARY" as const,
          rationale: "Core audience for Experimental / RV-class aircraft.",
        }
      : warbird
        ? {
            name: "WarbirdsOnly.com",
            url: "https://www.warbirdsonly.com",
            priority: "PRIMARY" as const,
            rationale: "Specialist visibility for warbird and classic military buyers.",
          }
        : {
            name: "ASO.com",
            url: "https://www.aso.com",
            priority: "SECONDARY" as const,
            rationale: "Additional exposure. Different buyer pool from the top three.",
          },
    {
      name: "AOPA Pilot Marketplace",
      url: "https://www.aopa.org",
      priority: "SECONDARY",
      rationale: "Reaches AOPA members — typically serious, financially qualified buyers.",
    },
  ]
  return out
}

const PHOTO_GUIDE: string[] = [
  "3/4 front view in morning light (the hero shot — lead with this)",
  "Full panel, engine running, all gauges visible",
  "Logbook stack — airframe, engine, prop covers spread open",
  "Engine bay — clean and accessible",
  "Interior front seats and rear",
  "Left and right profile, gear and fairings",
  "Wingtip, tail, and any distinctive features",
  "Any recent work: annual signoff page, 337s, STCs",
]

function listingLocation(row: ListingRow): string | null {
  const label = row.location_label?.trim()
  if (label) return label
  const city = row.location_city?.trim()
  const st = row.location_state?.trim()
  if (city && st) return `${city} ${st}`
  if (st) return st
  if (city) return city
  return null
}

function rowToComp(row: ListingRow): CompListing {
  const price = num(row.asking_price) ?? 0
  return {
    id: String(row.id),
    year: num(row.year) != null ? Math.round(num(row.year)!) : null,
    make: row.make ?? "",
    model: row.model ?? "",
    askingPrice: price,
    ttaf: num(row.total_time_airframe) != null ? Math.round(num(row.total_time_airframe)!) : null,
    smoh: num(row.engine_hours_smoh) != null ? Math.round(num(row.engine_hours_smoh)!) : null,
    location: listingLocation(row),
    daysOnMarket: num(row.days_on_market) != null ? Math.round(num(row.days_on_market)!) : null,
    flipScore: num(row.flip_score) != null ? Math.round(num(row.flip_score)!) : null,
    flipTier: row.flip_tier ?? null,
    url: row.listing_url ?? row.url ?? null,
  }
}

async function fetchListingBatch(
  supabase: ReturnType<typeof createPrivilegedServerClient>,
  opts: {
    make: string
    model?: string
    yearLow?: number
    yearHigh?: number
    limit: number
    orderBy: "flip_score" | "last_seen_date"
    ascending: boolean
    lastSeenSince?: string
  },
): Promise<ListingRow[]> {
  const makeTok = sanitizeIlikeToken(opts.make)
  if (!makeTok) return []

  let q = supabase
    .from("public_listings")
    .select(
      "id,year,make,model,asking_price,total_time_airframe,engine_hours_smoh,location_city,location_state,location_label,days_on_market,flip_score,flip_tier,listing_url,url,last_seen_date,first_seen_date,is_active,description_full,has_glass_cockpit,is_steam_gauge",
    )
    .ilike("make", `%${makeTok}%`)
    .gt("asking_price", 0)
    .eq("is_active", true)

  const modelTok = opts.model ? sanitizeIlikeToken(opts.model) : ""
  if (modelTok) q = q.ilike("model", `%${modelTok}%`)

  if (opts.yearLow != null && opts.yearHigh != null) {
    q = q.gte("year", opts.yearLow).lte("year", opts.yearHigh)
  }

  if (opts.lastSeenSince) {
    q = q.gte("last_seen_date", opts.lastSeenSince)
  }

  q = q.order(opts.orderBy, { ascending: opts.ascending, nullsFirst: false })

  const { data, error } = await q.limit(opts.limit)
  if (error) {
    console.error("[sell-intel] public_listings", error.message)
    return []
  }
  return (data ?? []) as ListingRow[]
}

function aggregateFromRows(rows: ListingRow[]): {
  medianAskPrice: number | null
  p25AskPrice: number | null
  p75AskPrice: number | null
  activeListingCount: number
  avgDaysOnMarket: number | null
  topStates: Array<{ state: string; count: number }>
} {
  const prices = rows.map((r) => num(r.asking_price)).filter((n): n is number => n != null && n > 0)
  const sorted = [...prices].sort((a, b) => a - b)
  const doms = rows.map((r) => num(r.days_on_market)).filter((n): n is number => n != null && n >= 0)
  const domAvg = doms.length ? doms.reduce((a, b) => a + b, 0) / doms.length : null

  const stateCount = new Map<string, number>()
  for (const r of rows) {
    const st = r.location_state?.trim()
    if (!st) continue
    stateCount.set(st, (stateCount.get(st) ?? 0) + 1)
  }
  const topStates = [...stateCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([state, count]) => ({ state, count }))

  return {
    medianAskPrice: medianFromSorted(sorted),
    p25AskPrice: percentile(sorted, 0.25),
    p75AskPrice: percentile(sorted, 0.75),
    activeListingCount: rows.length,
    avgDaysOnMarket: domAvg,
    topStates,
  }
}

function priceHistoryFromRows(rows: ListingRow[], monthsBack: number): PriceHistoryPoint[] {
  const cutoff = new Date()
  cutoff.setUTCMonth(cutoff.getUTCMonth() - monthsBack)
  const byMonth = new Map<string, number[]>()
  for (const r of rows) {
    const key = monthKeyFromDate(r.last_seen_date ?? r.first_seen_date ?? null)
    if (!key) continue
    const [y, m] = key.split("-").map(Number)
    const t = Date.UTC(y, m - 1, 1)
    if (t < cutoff.getTime()) continue
    const p = num(r.asking_price)
    if (p == null || p <= 0) continue
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key)!.push(p)
  }
  const points: PriceHistoryPoint[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, arr]) => {
      const s = [...arr].sort((x, y) => x - y)
      return {
        month,
        medianPrice: medianFromSorted(s) ?? 0,
        listingCount: arr.length,
      }
    })
  return points.slice(-6)
}

async function countOwnershipChanges(
  supabase: ReturnType<typeof createPrivilegedServerClient>,
  make: string,
  model: string | undefined,
): Promise<number> {
  const makeTok = sanitizeIlikeToken(make)
  if (!makeTok) return 0

  let lq = supabase.from("aircraft_listings").select("id").ilike("make", `%${makeTok}%`).limit(8000)
  const modelTok = model ? sanitizeIlikeToken(model) : ""
  if (modelTok) lq = lq.ilike("model", `%${modelTok}%`)
  const { data: listings, error: le } = await lq
  if (le || !listings?.length) return 0

  const ids = listings.map((r: { id: string }) => r.id).filter(Boolean)
  const since = new Date()
  since.setMonth(since.getMonth() - 12)
  const sinceIso = since.toISOString().slice(0, 10)

  let total = 0
  const chunk = 120
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk)
    const { count, error } = await supabase
      .from("detected_ownership_changes")
      .select("listing_id", { count: "exact", head: true })
      .in("listing_id", slice)
      .gte("new_cert_date", sinceIso)
    if (!error && count != null) total += count
  }
  return total
}

async function fetchAllAvionicsRoiItems(
  supabase: ReturnType<typeof createPrivilegedServerClient>,
  segment: string,
): Promise<UpgradeItem[]> {
  const { data: market, error: me } = await supabase
    .from("avionics_market_values")
    .select("unit_id, price_p25, price_median")
    .eq("aircraft_segment", segment)

  if (me || !market?.length) return []

  const unitIds = [...new Set(market.map((r: { unit_id: number }) => r.unit_id).filter(Boolean))]
  const { data: units, error: ue } = await supabase
    .from("avionics_units")
    .select("id, canonical_name")
    .in("id", unitIds)

  if (ue || !units?.length) return []

  const idToName = new Map<number, string>()
  for (const u of units as { id: number; canonical_name: string | null }[]) {
    idToName.set(u.id, u.canonical_name ?? "")
  }

  const items: UpgradeItem[] = []
  for (const row of market as {
    unit_id: number
    price_p25: number | string | null
    price_median: number | string | null
  }[]) {
    const name = idToName.get(row.unit_id)?.trim()
    if (!name) continue
    const valueAdd = num(row.price_p25) ?? num(row.price_median)
    if (valueAdd == null || valueAdd <= 0) continue

    let installCost = resolveInstallCost(name)
    if (installCost == null) {
      installCost = Math.max(1800, Math.round(valueAdd * 0.48))
    }

    const netROI = Math.round(valueAdd - installCost)
    let recommendation: UpgradeItem["recommendation"] = "OPTIONAL"
    if (netROI > 500) recommendation = "DO"
    else if (netROI < -2000) recommendation = "SKIP"

    items.push({
      name,
      installCost,
      valueAdd: Math.round(valueAdd),
      netROI,
      recommendation,
      rationale:
        recommendation === "DO"
          ? "Conservative market P25 supports meaningful value add vs typical installed cost."
          : recommendation === "SKIP"
            ? "Installed cost likely exceeds conservative resale lift for this segment."
            : "Marginal economics — prioritize only if it closes a buyer objection.",
    })
  }

  items.sort((a, b) => b.netROI - a.netROI)
  return items
}

function avionicsItemsForSellerReport(all: UpgradeItem[], selected: string[]): UpgradeItem[] {
  return all.filter((i) => !avionicsInstalled(selected, i.name)).slice(0, 24)
}

function countSelectedPositiveRoiItems(selected: string[], all: UpgradeItem[]): number {
  const matched = new Set<string>()
  for (const s of selected) {
    const t = s.toLowerCase().trim()
    if (!t) continue
    const hit = all.find((i) => t.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(t))
    if (hit && hit.netROI > 0) matched.add(hit.name)
  }
  return matched.size
}

async function fetchEngineContext(
  supabase: ReturnType<typeof createPrivilegedServerClient>,
  engineModel: string,
): Promise<{ tbo: number | null; overhaulCost: number | null }> {
  const em = engineModel.trim()
  const compact = em.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()

  let tboRow: { scoring_default_tbo?: unknown; tbo_hours?: unknown } | null = null
  const byPattern = await supabase
    .from("engine_tbo_reference")
    .select("scoring_default_tbo, tbo_hours")
    .ilike("pattern", `%${compact}%`)
    .limit(1)
    .maybeSingle()
  if (!byPattern.error) {
    tboRow = byPattern.data as typeof tboRow
  }
  if (!tboRow && em) {
    const byModel = await supabase
      .from("engine_tbo_reference")
      .select("scoring_default_tbo, tbo_hours")
      .ilike("engine_model", `%${em}%`)
      .limit(1)
      .maybeSingle()
    if (!byModel.error) tboRow = byModel.data as typeof tboRow
  }

  const tbo = num(tboRow?.scoring_default_tbo) ?? num(tboRow?.tbo_hours) ?? 2000

  const { data: priceRow } = await supabase
    .from("engine_overhaul_pricing")
    .select("exchange_price, retail_price")
    .ilike("engine_model", `%${engineModel}%`)
    .limit(1)
    .maybeSingle()

  const overhaulCost =
    num((priceRow as { exchange_price?: unknown } | null)?.exchange_price) ??
    num((priceRow as { retail_price?: unknown } | null)?.retail_price)

  return { tbo: tbo && tbo > 0 ? Math.round(tbo) : 2000, overhaulCost: overhaulCost != null ? Math.round(overhaulCost) : null }
}

function buildEngineNarrative(
  smoh: number | null,
  tbo: number | null,
  overhaulCost: number | null,
): EngineNarrative {
  if (smoh == null || tbo == null || tbo <= 0) {
    return {
      smoh,
      tbo,
      pctRemaining: null,
      framing: "Add engine time since major overhaul (SMOH) to tailor buyer messaging and pricing.",
      buyerRiskLevel: "MODERATE",
      overhaulCostEstimate: overhaulCost,
    }
  }
  const remaining = Math.max(0, tbo - smoh)
  const pct = Math.round((remaining / tbo) * 1000) / 10
  let framing: string
  let risk: EngineNarrative["buyerRiskLevel"] = "MODERATE"
  if (pct > 60) {
    framing = `${smoh} SMOH — ${remaining} hours of engine life remaining (${tbo}-hr TBO reference). Low buyer scrutiny if logs support the timeline.`
    risk = "LOW"
  } else if (pct >= 30) {
    framing = `${smoh} SMOH. Engine is mid-life with ${remaining} hours to TBO. Disclose and price accordingly.`
    risk = "MODERATE"
  } else {
    const oc = overhaulCost ?? 0
    framing = `${smoh} SMOH — engine approaching TBO at ${tbo} hours. Budget $${oc.toLocaleString("en-US")} overhaul context into your floor price.`
    risk = "HIGH"
  }
  return {
    smoh,
    tbo,
    pctRemaining: pct,
    framing,
    buyerRiskLevel: risk,
    overhaulCostEstimate: overhaulCost,
  }
}

function buildUpgradeSection(
  avionicsItems: UpgradeItem[],
  engineNarrative: EngineNarrative,
  annual: AnnualAdvice,
  damageHistory: boolean | undefined,
  smoh: number | null,
): UpgradeROIData {
  const mustSkip: string[] = []
  if (smoh != null && smoh < 1200) {
    mustSkip.push(
      `Engine overhaul at ${smoh} SMOH: ~$18K–$22K cost, adds ~$10K–$12K value. Net loss ~$8K–$10K. Skip unless required for airworthiness.`,
    )
  }

  const topDo = avionicsItems.filter((i) => i.recommendation === "DO").slice(0, 3)
  let bestSpendSummary = "Focus spend on high-visibility avionics buyers search for (WAAS GPS, ADS-B Out) only when economics stay positive."
  if (topDo.length) {
    bestSpendSummary = `Best bang: ${topDo.map((i) => i.name).join(", ")} — net lift after typical install runs positive on conservative comps.`
  }

  if (annual.status === "fresh" || annual.status === "current") {
    bestSpendSummary = `${bestSpendSummary} Lead with annual status before hardware upgrades.`
  }

  return {
    avionicsItems: avionicsItems,
    engineNarrative,
    annualAdvice: annual,
    damageHistoryImpact: damageHistory
      ? "Damage history usually costs 5–15% vs clean comps unless fully documented and professionally repaired. Price under median and disclose early."
      : null,
    bestSpendSummary,
    mustSkipItems: mustSkip,
    compsAvionicsFrequency: [],
    modelSpecificWarnings: [],
    buyerExpectations: [],
    signatureUpgrade: null,
  }
}

function buildListingStrategy(
  median: number | null,
  annual: AnnualAdvice,
  allAvionicsRoi: UpgradeItem[],
  params: SellIntelParams,
  enginePct: number | null,
  activeListingCount: number,
  avgDom: number | null,
): ListingStrategyData {
  const platforms = basePlatforms(params.make, params.model)
  let suggested: number | null = median != null ? median : null
  if (suggested != null) {
    if (annual.status === "fresh") suggested += 2500

    const installedPositiveRoi = countSelectedPositiveRoiItems(params.avionicsSelected ?? [], allAvionicsRoi)
    suggested += Math.min(8000, installedPositiveRoi * 1500)

    if (params.smoh != null && enginePct != null && enginePct > 70) suggested += 1500
    if (params.smoh != null && enginePct != null && enginePct < 25) suggested -= 2000
    if (params.damageHistory) suggested -= 1500
    suggested = round500(suggested)
  }

  const negotiationFloor = suggested != null ? round500(suggested * 0.93) : null

  const schedule =
    suggested != null
      ? [
          {
            dayThreshold: 0,
            action: "List at suggested price. Hold firm for 30 days.",
            targetPrice: suggested,
          },
          {
            dayThreshold: 30,
            action: "If no serious inquiries, reduce 5%.",
            targetPrice: Math.round((suggested * 0.95) / 500) * 500,
          },
          {
            dayThreshold: 60,
            action: 'Reduce another 3% and add "pre-buy inspection encouraged".',
            targetPrice: Math.round((suggested * 0.92) / 500) * 500,
          },
          { dayThreshold: 90, action: "Reassess: is this the right market? Consider broker.", targetPrice: null },
        ]
      : []

  const keywords = new Set<string>(["fresh annual", "ready to fly", "logs complete"])
  const avSel = params.avionicsSelected ?? []
  for (const a of avSel) {
    const t = a.toLowerCase()
    if (t.includes("ads-b") || t.includes("adsb")) keywords.add("ADS-B compliant")
    if (t.includes("waas") || t.includes("430") || t.includes("530") || t.includes("gtn")) keywords.add("WAAS GPS")
  }
  if ((params.panelType ?? "").toLowerCase().includes("glass")) keywords.add("glass panel")
  if (!params.damageHistory) keywords.add("no damage history")
  if (params.smoh != null && params.smoh < 800) keywords.add("low time engine")

  const selfNet = suggested != null ? round500(suggested * 0.95) : null
  const brokerNet = suggested != null ? round500(suggested * 0.95 * 0.95) : null
  const brokerFee = suggested != null ? suggested * 0.05 : 0
  const dailyCarry = MONTHLY_CARRYING_USD / 30
  const breakEvenDaysOnMarket =
    suggested != null && dailyCarry > 0 ? Math.round(brokerFee / dailyCarry) : null

  let brokerRec =
    "Market is slower — a broker's buyer network may be worth the 5% fee."
  if (activeListingCount > 30 && avgDom != null && avgDom < 60) {
    brokerRec = "Market is active — self-sell is viable. Save the commission."
  }

  return {
    suggestedListPrice: suggested,
    negotiationFloor,
    priceReductionSchedule: schedule,
    platforms,
    keywords: [...keywords],
    photoGuide: PHOTO_GUIDE,
    brokerVsSelf: {
      selfSellNetEstimate: selfNet,
      brokerNetEstimate: brokerNet,
      breakEvenDaysOnMarket,
      recommendation: brokerRec,
    },
  }
}

export async function computeSellIntel(params: SellIntelParams): Promise<SellIntelPayload> {
  const supabase = createPrivilegedServerClient()
  const yb = yearFilterBounds(params.yearMin, params.yearMax)
  const segment = inferSegment(params.make, params.model, params.engineCount)

  let topRows = await fetchListingBatch(supabase, {
    make: params.make,
    model: params.model,
    yearLow: yb?.low,
    yearHigh: yb?.high,
    limit: 50,
    orderBy: "flip_score" as const,
    ascending: false,
  })

  let compsWidenedNote: string | null = null
  if (topRows.length < 3 && params.model?.trim()) {
    topRows = await fetchListingBatch(supabase, {
      make: params.make,
      model: undefined,
      yearLow: yb?.low,
      yearHigh: yb?.high,
      limit: 50,
      orderBy: "flip_score",
      ascending: false,
    })
    compsWidenedNote = `Model-specific comps limited — showing broader ${params.make} market comps.`
  }

  const modelForHistory = compsWidenedNote ? undefined : params.model
  const sinceHist = new Date()
  sinceHist.setUTCMonth(sinceHist.getUTCMonth() - 7)
  const historyRows = await fetchListingBatch(supabase, {
    make: params.make,
    model: modelForHistory,
    yearLow: yb?.low,
    yearHigh: yb?.high,
    limit: 400,
    orderBy: "last_seen_date",
    ascending: false,
    lastSeenSince: sinceHist.toISOString().slice(0, 10),
  })

  const agg = aggregateFromRows(topRows)
  const compsAvionicsFrequency = compsAvionicsFrequencyFromRows(topRows)
  const comps = topRows.slice(0, 6).map(rowToComp)
  const priceHistory = priceHistoryFromRows(historyRows.length ? historyRows : topRows, 6)
  const demandTier = demandTierFrom(agg.activeListingCount, agg.avgDaysOnMarket)

  let priceVsMedianPercent: number | null = null
  if (params.askingPrice != null && agg.medianAskPrice != null && agg.medianAskPrice > 0) {
    priceVsMedianPercent = Math.round(
      ((params.askingPrice - agg.medianAskPrice) / agg.medianAskPrice) * 1000,
    ) / 10
  }

  const recentOwnershipChanges = await countOwnershipChanges(supabase, params.make, params.model)

  const marketPosition: MarketPositionData = {
    medianAskPrice: agg.medianAskPrice != null ? Math.round(agg.medianAskPrice) : null,
    p25AskPrice: agg.p25AskPrice != null ? Math.round(agg.p25AskPrice) : null,
    p75AskPrice: agg.p75AskPrice != null ? Math.round(agg.p75AskPrice) : null,
    activeListingCount: agg.activeListingCount,
    avgDaysOnMarket: agg.avgDaysOnMarket != null ? Math.round(agg.avgDaysOnMarket * 10) / 10 : null,
    priceVsMedianPercent,
    demandTier,
    topStates: agg.topStates,
    recentOwnershipChanges,
    comps,
    priceHistory,
  }

  const annual = buildAnnualAdvice(params.annualStatus)
  const engineModel = defaultEngineModel(params.make, params.model)
  const { tbo, overhaulCost } = await fetchEngineContext(supabase, engineModel)
  const engineNarrative = buildEngineNarrative(params.smoh ?? null, tbo, overhaulCost)

  const allAvionicsRoi = await fetchAllAvionicsRoiItems(supabase, segment)
  const avionicsItems = avionicsItemsForSellerReport(allAvionicsRoi, params.avionicsSelected ?? [])

  const upgradeBase = buildUpgradeSection(
    avionicsItems,
    engineNarrative,
    annual,
    params.damageHistory,
    params.smoh ?? null,
  )
  const modelProf = getModelUpgradeProfile(params.make, params.model)
  const upgradeROI: UpgradeROIData = {
    ...upgradeBase,
    compsAvionicsFrequency,
    modelSpecificWarnings: modelProf?.modelSpecificWarnings ?? [],
    buyerExpectations: modelProf?.buyerExpectations ?? [],
    signatureUpgrade: modelProf?.signatureUpgrade ?? null,
  }

  const listingStrategy = buildListingStrategy(
    agg.medianAskPrice,
    annual,
    allAvionicsRoi,
    params,
    engineNarrative.pctRemaining,
    agg.activeListingCount,
    agg.avgDaysOnMarket,
  )

  let dataQuality: SellIntelPayload["dataQuality"] = "limited"
  if (agg.activeListingCount >= 10) dataQuality = "strong"
  else if (agg.activeListingCount >= 4) dataQuality = "moderate"

  let dataQualityNote: string | null =
    dataQuality === "limited"
      ? "Fewer than 4 comparable listings found. Intelligence is directional — treat price estimates as ranges, not targets."
      : null
  if (compsWidenedNote) {
    dataQualityNote = dataQualityNote ? `${compsWidenedNote} ${dataQualityNote}` : compsWidenedNote
  }

  return {
    aircraft: {
      make: params.make,
      model: params.model,
      yearMin: params.yearMin,
      yearMax: params.yearMax,
      smoh: params.smoh,
      askingPrice: params.askingPrice,
      panelType: params.panelType,
      avionicsSelected: params.avionicsSelected?.length ? params.avionicsSelected : undefined,
    },
    marketPosition,
    upgradeROI,
    listingStrategy,
    computedAt: new Date().toISOString(),
    dataQuality,
    dataQualityNote,
  }
}
