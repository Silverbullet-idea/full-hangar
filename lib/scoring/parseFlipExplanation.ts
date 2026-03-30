export type FlipExplanationPayload = {
  p1_pricing_edge?: { pts?: number; max?: number; basis?: string }
  p2_airworthiness?: { pts?: number; max?: number; basis?: string }
  p3_improvement_room?: { pts?: number; max?: number; basis?: string }
  p4_exit_liquidity?: { pts?: number; max?: number; basis?: string }
  raw_total?: number
  risk_cap_applied?: boolean
  suppressed?: string
  error?: string
} | null

export function parseFlipExplanationField(raw: unknown): FlipExplanationPayload {
  if (raw == null || raw === "") return null
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as NonNullable<FlipExplanationPayload>
  }
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw)
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as NonNullable<FlipExplanationPayload>)
        : null
    } catch {
      return null
    }
  }
  return null
}
