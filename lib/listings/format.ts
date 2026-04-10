export function formatMoney(value: number | null | undefined): string {
  if (typeof value !== "number") return "N/A"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatScore(score: number | null | undefined): string {
  if (typeof score !== "number") return "N/A"
  return `${score.toFixed(1)}`
}

export function getRiskClass(riskLevel: string | null | undefined): string {
  const normalized = (riskLevel || "").toUpperCase()
  if (normalized === "LOW") return "risk-low"
  if (normalized === "MODERATE") return "risk-moderate"
  if (normalized === "HIGH") return "risk-high"
  if (normalized === "CRITICAL") return "risk-critical"
  return "score-none"
}

/** Title-case word for a known DB risk_level (LOW / MODERATE / …). */
export function formatRiskLevelShort(riskLevel: string | null | undefined): string {
  const raw = (riskLevel || "").trim()
  const normalized = raw.toUpperCase()
  if (!normalized || normalized === "UNKNOWN") return "Unknown"
  const map: Record<string, string> = {
    LOW: "Low",
    MODERATE: "Moderate",
    HIGH: "High",
    CRITICAL: "Critical",
  }
  if (map[normalized]) return map[normalized]
  return raw.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

/** Human phrase for tooltips / secondary copy, e.g. "Moderate risk". */
export function formatRiskLevelLabel(riskLevel: string | null | undefined): string {
  const short = formatRiskLevelShort(riskLevel)
  if (short === "Unknown") return "Not rated"
  return `${short} risk`
}

/** Primary badge text on listing detail — always names "Risk" explicitly. */
export function formatRiskBadgeDisplay(riskLevel: string | null | undefined): string {
  const short = formatRiskLevelShort(riskLevel)
  if (short === "Unknown") return "Risk: Not rated"
  return `Risk: ${short}`
}

/** Screen reader context: risk is not flip tier or data confidence. */
export function formatRiskBadgeAriaLabel(riskLevel: string | null | undefined): string {
  const label = formatRiskLevelLabel(riskLevel)
  return `Downside risk from maintenance burden, registration alerts, and condition signals (separate from flip score and score reliability). Current level: ${label}.`
}

export function formatPriceOrCall(value: number | null | undefined): string {
  if (typeof value !== "number") return "Call for Price"
  return formatMoney(value)
}

export function formatHours(value: number | null | undefined): string {
  if (typeof value !== "number") return "N/A"
  return `${Math.round(value).toLocaleString("en-US")} hrs`
}

/** Human-readable marketplace name for `aircraft_listings.source` (browse cards, detail). */
export function formatListingSourceLabel(raw: string): string {
  const k = raw.trim().toLowerCase().replace(/_/g, "-")
  const m: Record<string, string> = {
    "trade-a-plane": "Trade-A-Plane",
    controller: "Controller",
    aerotrader: "AeroTrader",
    aircraftforsale: "Aircraft For Sale",
    aso: "ASO",
    globalair: "GlobalAir",
    barnstormers: "Barnstormers",
    avbuyer: "AvBuyer",
    controller_cdp: "Controller",
    unknown: "Listing",
  }
  return m[k] ?? raw
}

export function formatIsoDate(value: string | null | undefined): string {
  if (!value) return "—"
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  return new Date(timestamp).toLocaleDateString("en-US")
}

export function formatCompTier(value: string | null | undefined): string {
  const normalized = String(value || "").trim()
  if (!normalized) return "—"
  const labelMap: Record<string, string> = {
    exact_submodel_year_window: "Exact submodel (+/-10 years)",
    model_family_all_years: "Model family (all years)",
    make_level_fallback: "Make-level fallback",
    precomputed_market_comps: "Precomputed market comps",
    baseline_fallback: "Baseline fallback",
    insufficient: "Insufficient",
  }
  return labelMap[normalized] ?? normalized.replace(/_/g, " ")
}

export function formatSeatsEngines(seats: number | null, engines: number | null): string | null {
  const seatText = typeof seats === "number" ? String(seats) : null
  const engineText = typeof engines === "number" ? String(engines) : null
  if (!seatText && !engineText) return null
  return `${seatText ?? "—"} / ${engineText ?? "—"}`
}

/**
 * `vs_median_price` from `public_listings`: asking − comp median (dollars).
 * Negative = listed below the cohort median.
 */
export function formatVsMedianDeltaShort(vs: number | null | undefined): string {
  if (typeof vs !== "number" || !Number.isFinite(vs)) return "—"
  const r = Math.round(vs)
  if (r === 0) return "At median"
  const abs = Math.abs(r)
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(abs)
  if (r < 0) return `${money} below median`
  return `${money} above median`
}
