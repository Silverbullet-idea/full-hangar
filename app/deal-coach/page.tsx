import type { Metadata } from "next"
import { getListingById } from "../../lib/listings/queries"
import { mapListingToAircraftProfile } from "../../lib/dealCoach/mapListingToProfile"
import DealCoachClient from "./DealCoachClient"

export const metadata: Metadata = {
  title: "Deal Coach — Full Hangar",
  description:
    "Analyze any aircraft deal in minutes. Build a complete flip P&L, get upgrade ROI analysis, and access live market comps — no account required.",
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function DealCoachPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const raw = sp.listing_id
  const listingId = typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? String(raw[0] ?? "").trim() : ""

  let initialListingProfile = null
  if (listingId) {
    const listing = await getListingById(listingId)
    if (listing) {
      initialListingProfile = mapListingToAircraftProfile(listing, listingId)
    }
  }

  return <DealCoachClient initialListingProfile={initialListingProfile} />
}
