import Link from 'next/link'
import CompactListingCardPrototype from './CompactListingCardPrototype'

/** Shared demo block for `/listings/compact-card-prototype` and `/compact-card-prototype`. */
export default function CompactCardPrototypeDemo() {
  return (
    <div
      className="min-h-screen px-4 py-8 text-[var(--fh-text)]"
      style={{
        /* Inline fallbacks so the page is visible even if CSS variables fail to load */
        minHeight: '100vh',
        backgroundColor: 'var(--fh-bg, #f0f2f5)',
        color: 'var(--fh-text, #111827)',
      }}
    >
      <div className="mx-auto max-w-5xl">
        <p className="mb-2 text-sm text-[var(--fh-text-muted)]">
          <Link href="/listings" className="text-[var(--fh-orange)] underline-offset-2 hover:underline">
            ← Back to listings
          </Link>
        </p>
        <h1
          className="mb-2 text-2xl font-bold tracking-tight text-[var(--fh-text)]"
          style={{ fontFamily: 'var(--font-barlow-condensed), system-ui' }}
        >
          Compact card — layout prototype
        </h1>
        <p
          className="mb-8 max-w-2xl text-sm leading-relaxed text-[var(--fh-text-dim)]"
          style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
        >
          This page previews a no-thumbnail compact row with a fully readable year / make / model line, wrapped
          location, and extra placeholder spec rows. It is not linked from production navigation; use it to approve the
          layout before we merge into the live compact listing card.
        </p>

        <p className="mb-4 rounded border border-dashed border-[var(--fh-border)] px-3 py-2 text-xs text-[var(--fh-text-dim)]">
          Same page on two URLs:{' '}
          <Link href="/listings/compact-card-prototype">/listings/compact-card-prototype</Link>
          {' · '}
          <Link href="/compact-card-prototype">/compact-card-prototype</Link>
        </p>

        <div className="flex flex-col gap-2">
          <CompactListingCardPrototype
            listingKey="proto-1"
            titleText="2007 Beechcraft King Air B200"
            locationText="Southern Africa, South Africa — GlobalAir"
            nNumber="N/A"
            priceDisplay="$2,695,000"
            flipScoreDisplay="41.0"
            flipTier="PASS"
            engineBadgeText="⚠ Overdue"
            engineBadgeClass="border-red-500 bg-red-500/15 text-red-300"
            engineBadgeTitle="Engine: Overdue"
          />
          <CompactListingCardPrototype
            listingKey="proto-2"
            titleText="2016 Beechcraft Baron G58 with long model suffix for wrap test"
            locationText="Wichita, Kansas, United States — Controller"
            nNumber="N12345"
            priceDisplay="$899,000"
            flipScoreDisplay="72.4"
            flipTier="GOOD"
            engineBadgeText="~1,234hrs"
            engineBadgeClass="border-amber-500 bg-amber-500/15 text-amber-300"
            engineBadgeTitle="Engine: hours to TBO"
          />
          <CompactListingCardPrototype
            listingKey="proto-3"
            titleText="1978 Cessna 172N Skyhawk"
            locationText="Regional airport strip, rural Montana — Trade-A-Plane"
            nNumber="N98765"
            priceDisplay="$89,500"
            flipScoreDisplay="58.0"
            flipTier="FAIR"
            ownershipBadgeText="Fractional"
            engineBadgeText="●"
            engineBadgeClass="border-emerald-500 bg-emerald-500/15 text-emerald-300"
            engineBadgeTitle="Engine: Fresh"
          />
          <CompactListingCardPrototype
            listingKey="proto-4"
            titleText="1992 Piper PA-28-181 Archer III"
            locationText="Location unavailable"
            nNumber="N/A"
            priceDisplay="Call"
            flipScoreDisplay="—"
            flipTier={null}
          />
        </div>
      </div>
    </div>
  )
}
