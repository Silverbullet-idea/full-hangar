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

export function formatPriceOrCall(value: number | null | undefined): string {
  if (typeof value !== "number") return "Call for Price"
  return formatMoney(value)
}

export function formatHours(value: number | null | undefined): string {
  if (typeof value !== "number") return "N/A"
  return `${Math.round(value).toLocaleString("en-US")} hrs`
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
