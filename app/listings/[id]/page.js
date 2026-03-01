import Link from "next/link"
import DeferredCostPanel from "../../../components/listings/DeferredCostPanel"
import RiskBadge from "../../../components/listings/RiskBadge"
import ScoreBadge from "../../../components/listings/ScoreBadge"
import ScoreBreakdown from "../../../components/listings/ScoreBreakdown"
import { formatMoney } from "../../../lib/listings/format"
import { getListingById } from "../../../lib/listings/queries"
/** @typedef {import("../../../lib/types").AircraftListing} AircraftListing */

export default async function ListingDetailPage({ params }) {
  /** @type {AircraftListing | null} */
  const listing = await getListingById(params.id)
  if (!listing) {
    return (
      <main className="container">
        <p>Listing not found.</p>
        <Link href="/listings">Back to listings</Link>
      </main>
    )
  }

  return (
    <main className="container">
      <p>
        <Link href="/listings">← Back to listings</Link>
      </p>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {listing.title}
        </h1>
        <RiskBadge riskLevel={listing.risk_level} />
      </div>

      <p className="subtle">
        {listing.location_label || "Location unavailable"} | Price: {formatMoney(listing.price_asking)}
      </p>
      <p>
        <ScoreBadge score={listing.value_score} />
      </p>

      <div className="detail-grid">
        <section className="panel">
          {listing.primary_image_url ? (
            <img className="hero-image" src={listing.primary_image_url} alt={listing.title || "Aircraft listing"} />
          ) : (
            <div className="hero-image" />
          )}
          <h3>Listing Details</h3>
          <p>{listing.description_full || listing.description || "No description available."}</p>
          <p className="kv">
            <span>N-Number</span>
            <strong>{listing.n_number || "N/A"}</strong>
          </p>
          <p className="kv">
            <span>Total Time Airframe</span>
            <strong>{listing.total_time_airframe ?? "N/A"}</strong>
          </p>
          <p className="kv">
            <span>SMOH</span>
            <strong>{listing.engine_time_since_overhaul ?? "N/A"}</strong>
          </p>
          <p className="kv">
            <span>SNEW</span>
            <strong>{listing.time_since_new_engine ?? "N/A"}</strong>
          </p>
          <p className="kv">
            <span>SPOH</span>
            <strong>{listing.time_since_prop_overhaul ?? "N/A"}</strong>
          </p>
          {listing.url ? (
            <p>
              <a href={listing.url} target="_blank" rel="noreferrer">
                View source listing
              </a>
            </p>
          ) : null}
          <p>
            <Link href={`/internal/listings/${listing.id}`}>Internal diagnostics</Link>
          </p>
        </section>

        <div>
          <ScoreBreakdown listing={listing} />
          <DeferredCostPanel listing={listing} />
        </div>
      </div>
    </main>
  )
}
