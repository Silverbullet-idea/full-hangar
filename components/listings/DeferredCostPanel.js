import { formatMoney } from "../../lib/listings/format"
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
export default function DeferredCostPanel({ listing }) {
  return (
    <section className="panel">
      <h3 style={{ marginTop: 0 }}>Cost Intelligence</h3>
      <Row label="Asking Price" value={formatMoney(listing.price_asking)} />
      <Row label="Deferred Total" value={formatMoney(listing.deferred_total)} />
      <Row label="True Cost" value={formatMoney(listing.true_cost)} />
    </section>
  )
}
