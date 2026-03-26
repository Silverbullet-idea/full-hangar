/** Keep in sync with `core/intelligence/aircraft_intelligence.py` INTELLIGENCE_VERSION */
const INTELLIGENCE_VERSION = "2.0.0"

export default function ListingsBrowseDataFootnote() {
  return (
    <footer
      className="mx-auto mb-8 mt-10 max-w-[1280px] rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-4 py-3 text-center text-[11px] leading-relaxed text-[var(--fh-text-muted)] sm:px-5 [data-theme=light]:border-slate-200 [data-theme=light]:bg-slate-50 lg:px-6"
      aria-label="Listings data and disclaimer"
    >
      <p className="m-0 mb-2">
        Data sourced from public aircraft marketplaces · FAA Registry where registrations match.
      </p>
      <p className="m-0 mb-2">
        Flip scores and intelligence layers computed by Full Hangar v{INTELLIGENCE_VERSION} · Refresh times vary by
        listing.
      </p>
      <p className="m-0">
        Full-Hangar.com is not a broker or dealer. Always conduct a pre-buy inspection.
      </p>
    </footer>
  )
}
