const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

export default function HomeRoadmap() {
  return (
    <section id="roadmap" className="mt-14 scroll-mt-24">
      <div className="mx-auto mb-8 max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted">Roadmap</p>
        <h2 className="mt-2 text-3xl font-extrabold leading-tight text-brand-white md:text-4xl" style={barlow}>
          Where we are — and where we&apos;re going
        </h2>
        <p className="mt-3 text-sm text-brand-muted md:text-base">
          We&apos;re building a vertically integrated aircraft transaction platform. Today you get serious market intelligence;
          tomorrow, the rest of the stack — honestly sequenced.
        </p>
      </div>
      <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-brand-dark bg-card-bg p-5 text-center md:p-6 md:text-left">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--fh-orange)]">Now</p>
          <p className="mt-1 text-sm font-semibold text-brand-muted">Phase 1 — live</p>
          <p className="mt-4 text-sm leading-relaxed text-brand-muted">
            Aggregated marketplace listings, Flip Score, listing detail intelligence, Deal Coach (buy-side deal math +
            sell-side strategy report), accounts, and saved infrastructure for searches and scenarios.
          </p>
        </article>
        <article className="rounded-2xl border border-brand-dark bg-card-bg p-5 text-center md:p-6 md:text-left">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--fh-orange)]">Next</p>
          <p className="mt-1 text-sm font-semibold text-brand-muted">Product depth</p>
          <p className="mt-4 text-sm leading-relaxed text-brand-muted">
            Saved searches you can reopen as URLs, price alerts, richer notification center, and seller analytics as view data
            grows. Always additive — we won&apos;t strip transparency.
          </p>
        </article>
        <article className="rounded-2xl border border-brand-dark bg-card-bg p-5 text-center md:p-6 md:text-left">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--fh-orange)]">Later</p>
          <p className="mt-1 text-sm font-semibold text-brand-muted">Platform</p>
          <p className="mt-4 text-sm leading-relaxed text-brand-muted">
            Listing reach across marketplaces, transaction support (escrow, inspections, brokerage coordination, financing) —
            the &ldquo;Carvana for GA&rdquo; vision. We&apos;ll ship it in layers, not vapor.
          </p>
        </article>
      </div>
    </section>
  )
}
