import type { AircraftListing } from "../types"
import type { AircraftProfile } from "../../app/deal-coach/types"

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v
  return undefined
}

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim()
  return undefined
}

export function mapListingToAircraftProfile(listing: AircraftListing, listingId: string): AircraftProfile {
  const row = listing as Record<string, unknown>
  const asking = num(listing.asking_price) ?? num(listing.price_asking) ?? undefined
  const smoh = num(row.engine_time_since_overhaul)
  const ttaf = num(row.total_time_airframe)

  return {
    source: "listing",
    listingId,
    year: num(listing.year),
    make: str(listing.make),
    model: str(listing.model),
    registration: str(listing.n_number),
    ttaf,
    smoh,
    askingPrice: asking,
    location: str(listing.location_label),
    dealTier: str(listing.deal_tier) ?? null,
    valueScore: num(listing.value_score) ?? null,
  }
}
