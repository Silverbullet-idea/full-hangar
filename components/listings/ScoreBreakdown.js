import { formatScore } from "../../lib/listings/format"
/** @typedef {import("../../lib/types").AircraftListing} AircraftListing */

function Row({ label, value }) {
  return (
    <p className="kv">
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
  )
}

/**
 * @param {{ listing: AircraftListing }} props
 */
export default function ScoreBreakdown({ listing }) {
  return (
    <section className="panel">
      <h3 style={{ marginTop: 0 }}>Score Breakdown</h3>
      <Row label="Value Score" value={formatScore(listing.value_score)} />
      <Row label="Engine Score" value={formatScore(listing.engine_score)} />
      <Row label="Prop Score" value={formatScore(listing.prop_score)} />
      <Row label="LLP Score" value={formatScore(listing.llp_score)} />
      <Row label="Risk Level" value={listing.risk_level || "N/A"} />
      <Row label="Intelligence Version" value={listing.intelligence_version || "N/A"} />
    </section>
  )
}
