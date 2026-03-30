import { formatMoney } from "@/lib/listings/format"
import { parseFlipExplanationField, type FlipExplanationPayload } from "@/lib/scoring/parseFlipExplanation"

export type HeroHomeScoreCardPayload =
  | { kind: "demo" }
  | {
      kind: "live"
      listingId: string
      listingHref: string
      title: string
      subtitle: string
      flipScore: number
      flipTierKey: string
      pillars: readonly { label: string; pts: number; max: number; barClass: string }[]
      badges: readonly { text: string; tone: "green" | "orange" | "red" | "slate" }[]
      askingText: string
      marketText: string | null
      discountText: string | null
    }

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

type PillarBlock = { pts?: number; max?: number }

function pillarPts(fp: FlipExplanationPayload, block: PillarBlock | undefined, fallbackMax: number): number | null {
  if (!fp || typeof fp !== "object" || !block) return null
  if (typeof block.pts !== "number" || !Number.isFinite(block.pts)) return null
  const cap = typeof block.max === "number" && Number.isFinite(block.max) ? block.max : fallbackMax
  return clamp(Math.round(block.pts), 0, cap)
}

function buildPillars(fp: FlipExplanationPayload, flipScore: number) {
  const p1 = pillarPts(fp, fp?.p1_pricing_edge, 35)
  const p2 = pillarPts(fp, fp?.p2_airworthiness, 20)
  const p3 = pillarPts(fp, fp?.p3_improvement_room, 30)
  const p4 = pillarPts(fp, fp?.p4_exit_liquidity, 15)
  if (p1 !== null && p2 !== null && p3 !== null && p4 !== null) {
    return [
      { label: "Pricing edge", pts: p1, max: 35, barClass: "bg-brand-orange" },
      { label: "Airworthiness", pts: p2, max: 20, barClass: "bg-sky-400" },
      { label: "Improvement room", pts: p3, max: 30, barClass: "bg-teal-400" },
      { label: "Exit liquidity", pts: p4, max: 15, barClass: "bg-violet-400" },
    ] as const
  }
  const fs = clamp(Math.round(flipScore), 0, 100)
  return [
    { label: "Pricing edge", pts: clamp(Math.round((fs * 35) / 100), 0, 35), max: 35, barClass: "bg-brand-orange" },
    { label: "Airworthiness", pts: clamp(Math.round((fs * 20) / 100), 0, 20), max: 20, barClass: "bg-sky-400" },
    { label: "Improvement room", pts: clamp(Math.round((fs * 30) / 100), 0, 30), max: 30, barClass: "bg-teal-400" },
    { label: "Exit liquidity", pts: clamp(Math.round((fs * 15) / 100), 0, 15), max: 15, barClass: "bg-violet-400" },
  ] as const
}

function formatMarketBand(p25: unknown, p75: unknown, median: unknown): string | null {
  const a = typeof p25 === "number" ? p25 : null
  const b = typeof p75 === "number" ? p75 : null
  if (a !== null && b !== null && a > 0 && b >= a) {
    return `${formatMoney(a).replace(/\.00$/, "")} – ${formatMoney(b).replace(/\.00$/, "")}`
  }
  if (typeof median === "number" && median > 0) {
    return `~ ${formatMoney(median)}`
  }
  return null
}

function avionicsHighlight(items: unknown): string | null {
  const raw = JSON.stringify(items ?? "").toLowerCase()
  if (!raw || raw === "[]") return null
  if (raw.includes("gtn 750") || raw.includes("gtn750")) return "GTN 750 detected"
  if (raw.includes("gtn 650")) return "GTN 650 detected"
  if (raw.includes('"gtn"') || raw.includes("gtn ")) return "GTN series detected"
  if (raw.includes("g1000") || raw.includes("g 1000")) return "G1000 / glass stack"
  if (raw.includes("g500") || raw.includes("g600") || raw.includes("g3x")) return "Modern glass / EFI"
  if (raw.includes("ifr")) return "IFR-equipped (parser)"
  return null
}

function buildSubtitle(row: Record<string, unknown>): string {
  const parts: string[] = []
  const reg = String(row.n_number ?? "").trim()
  if (reg) parts.push(reg)
  const ttaf = row.total_time_airframe
  if (typeof ttaf === "number" && ttaf > 0) {
    parts.push(`${Math.round(ttaf).toLocaleString("en-US")} TTAF`)
  }
  const city = String(row.location_label ?? "").trim()
  const st = String(row.location_state ?? "").trim()
  const loc = [city, st].filter(Boolean).join(", ")
  if (loc) parts.push(loc)
  return parts.join(" · ") || "Live listing"
}

export function buildHeroFeaturedScoreCard(row: Record<string, unknown>): HeroHomeScoreCardPayload {
  const id = String(row.id ?? "").trim()
  if (!id) return { kind: "demo" }

  const flipScoreRaw = row.flip_score
  const flipScore =
    typeof flipScoreRaw === "number" && Number.isFinite(flipScoreRaw) ? Math.round(flipScoreRaw) : null
  if (flipScore === null) return { kind: "demo" }

  const fp = parseFlipExplanationField(row.flip_explanation)
  const pillars = [...buildPillars(fp, flipScore)]

  const tierRaw = String(row.flip_tier ?? "GOOD").trim().toUpperCase()
  const flipTierKey = tierRaw in { HOT: 1, GOOD: 1, FAIR: 1, PASS: 1 } ? tierRaw : "GOOD"

  const badges: { text: string; tone: "green" | "orange" | "red" | "slate" }[] = []
  const vs = row.vs_median_price
  if (typeof vs === "number" && Number.isFinite(vs)) {
    if (vs < 0) {
      badges.push({ text: `${Math.abs(Math.round(vs))}% below market`, tone: "green" })
    } else if (vs > 0) {
      badges.push({ text: `${Math.round(vs)}% above market`, tone: "red" })
    }
  }

  const evPct = row.ev_pct_life_remaining
  if (typeof evPct === "number" && Number.isFinite(evPct) && evPct > 0) {
    badges.push({ text: `Engine ${Math.round(evPct)}% life`, tone: "green" })
  }

  const av = avionicsHighlight(row.avionics_matched_items)
  if (av) badges.push({ text: av, tone: "orange" })
  else if (row.has_glass_cockpit === true) {
    badges.push({ text: "Glass cockpit", tone: "orange" })
  } else if (row.is_steam_gauge === true) {
    badges.push({ text: "Steam gauge panel", tone: "slate" })
  }

  if (row.price_reduced === true) {
    const cut = row.price_reduction_amount
    if (typeof cut === "number" && cut > 0) {
      badges.push({ text: `Price cut ${formatMoney(cut)}`, tone: "green" })
    } else {
      badges.push({ text: "Price reduced", tone: "green" })
    }
  }

  const risk = String(row.risk_level ?? "").toUpperCase()
  if (risk === "HIGH" || risk === "CRITICAL") {
    badges.push({ text: `${risk === "CRITICAL" ? "Critical" : "High"} risk`, tone: "red" })
  }

  const asking = row.asking_price
  const askingText =
    typeof asking === "number" && asking > 0 ? formatMoney(asking) : "Price on request"

  const marketText = formatMarketBand(row.comp_p25_price, row.comp_p75_price, row.comp_median_price)

  let discountText: string | null = null
  if (row.price_reduced === true && typeof row.price_reduction_amount === "number" && row.price_reduction_amount > 0) {
    discountText = `↓ ${formatMoney(row.price_reduction_amount)} reduction signal`
  }

  const y = typeof row.year === "number" && row.year > 0 ? `${row.year} ` : ""
  const make = String(row.make ?? "").trim()
  const model = String(row.model ?? "").trim()
  const title = `${y}${[make, model].filter(Boolean).join(" ")}`.trim() || "Featured aircraft"

  return {
    kind: "live",
    listingId: id,
    listingHref: `/listings/${id}`,
    title,
    subtitle: buildSubtitle(row),
    flipScore,
    flipTierKey,
    pillars,
    badges,
    askingText,
    marketText,
    discountText,
  }
}
