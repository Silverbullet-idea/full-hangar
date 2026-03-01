export function formatMoney(value) {
  if (typeof value !== "number") return "N/A"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
}

export function formatScore(score) {
  if (typeof score !== "number") return "N/A"
  return `${score.toFixed(1)}`
}

export function getScoreClass(score) {
  if (typeof score !== "number") return "score-none"
  if (score >= 75) return "score-high"
  if (score >= 50) return "score-mid"
  return "score-low"
}

export function getRiskClass(riskLevel) {
  const normalized = (riskLevel || "").toUpperCase()
  if (normalized === "LOW") return "risk-low"
  if (normalized === "MODERATE") return "risk-moderate"
  if (normalized === "HIGH") return "risk-high"
  if (normalized === "CRITICAL") return "risk-critical"
  return "score-none"
}
