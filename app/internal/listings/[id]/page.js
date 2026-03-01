import Link from "next/link"
import RawDataPanel from "../../../../components/internal/RawDataPanel"
import { getListingById, getListingRawById } from "../../../../lib/listings/queries"

export default async function InternalListingPage({ params }) {
  const [listingViewRow, raw] = await Promise.all([getListingById(params.id), getListingRawById(params.id)])
  if (!raw) {
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
        <Link href={`/listings/${params.id}`}>← Back to listing</Link>
      </p>
      <h1 className="page-title">Internal Diagnostics</h1>
      <p className="subtle">Use this route to verify field coverage and score payload consistency.</p>
      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Public View Snapshot</h3>
        <pre>{JSON.stringify(listingViewRow, null, 2)}</pre>
      </section>
      <RawDataPanel row={raw} />
    </main>
  )
}
