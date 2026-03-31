import type { CoachAnswers } from "./types"

/** Builds query string for GET /api/sell-intel (BACKEND contract). */
export function buildSellIntelQueryString(answers: CoachAnswers): string {
  const params = new URLSearchParams()
  const a = answers.aircraft
  const make = a?.make?.trim()
  if (make) params.set("make", make)
  if (a?.model?.trim()) params.set("model", a.model.trim())
  if (typeof a?.year === "number" && Number.isFinite(a.year)) {
    params.set("yearMin", String(Math.max(1900, a.year - 4)))
    params.set("yearMax", String(a.year + 4))
  }
  if (typeof a?.smoh === "number" && Number.isFinite(a.smoh)) params.set("smoh", String(Math.round(a.smoh)))
  const ask = answers.sellTargetPrice ?? a?.askingPrice
  if (typeof ask === "number" && ask > 0) params.set("askingPrice", String(Math.round(ask)))
  if (a?.panelType?.trim()) params.set("panelType", a.panelType.trim())
  if (a?.avionicsSelected?.length) params.set("avionics", a.avionicsSelected.join(","))
  if (a?.annualStatus?.trim()) params.set("annualStatus", a.annualStatus.trim())
  if (a?.damageHistory === true) params.set("damageHistory", "true")
  if (typeof a?.engineCount === "number" && (a.engineCount === 1 || a.engineCount === 2)) {
    params.set("engineCount", String(a.engineCount))
  }

  const qs = params.toString()
  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[sell-intel] GET /api/sell-intel?" + qs)
  }
  return qs
}
