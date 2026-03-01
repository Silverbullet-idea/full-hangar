import Link from "next/link"
import RiskBadge from "./RiskBadge"
import ScoreBadge from "./ScoreBadge"
import { formatMoney } from "../../lib/listings/format"
/** @typedef {import("../../lib/types").AircraftListing} AircraftListing */

/**
 * @param {{ listing: AircraftListing }} props
 */
export default function ListingCard({ listing }) {
  const title = listing.title || [listing.year, listing.make, listing.model].filter(Boolean).join(" ")
  return (
    <article className="card">
      {listing.primary_image_url ? (
        <img className="hero-image" src={listing.primary_image_url} alt={title || "Aircraft listing"} />
      ) : (
        <div className="hero-image" />
      )}
      <div className="card-body">
        <div className="row">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>{title || "Untitled Listing"}</h3>
          <RiskBadge riskLevel={listing.risk_level} />
        </div>
        <p className="subtle" style={{ margin: "0.35rem 0" }}>
          {listing.location_label || "Location unavailable"}
        </p>
        <div className="row" style={{ marginBottom: "0.5rem" }}>
          <strong>{formatMoney(listing.price_asking)}</strong>
          <span className="subtle">Deferred: {formatMoney(listing.deferred_total)}</span>
        </div>
        <div className="row">
          <ScoreBadge score={listing.value_score} />
          <Link href={`/listings/${listing.id}`}>View details</Link>
        </div>
      </div>
    </article>
  )
}
