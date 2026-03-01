import { getRiskClass } from "../../lib/listings/format"

export default function RiskBadge({ riskLevel }) {
  return <span className={`badge ${getRiskClass(riskLevel)}`}>{riskLevel || "UNKNOWN"}</span>
}
