const STEPS = [
  {
    n: 1,
    title: "We scrape. Constantly.",
    body: "8 marketplaces. Controller, Trade-A-Plane, AvBuyer, Barnstormers, and more — refreshed daily so you see every listing, not just the ones you happened to find yourself.",
  },
  {
    n: 2,
    title: "We enrich. Deeply.",
    body: "Each N-number is matched against 310K FAA records. Engine hours are compared to 110+ TBO references. Avionics are identified and valued. Deferred maintenance is priced.",
  },
  {
    n: 3,
    title: "You see the truth.",
    body: "A clear 0–100 Value Score surfaces the best deals. Every factor is transparent. You know what to offer, what to walk away from, and why — before you call the seller.",
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="mt-14 scroll-mt-24">
      <div className="mb-8 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted">How it works</p>
        <h2 className="mt-2 text-3xl font-extrabold leading-tight text-brand-white md:text-4xl">From listing to decision in seconds</h2>
        <p className="mt-3 text-sm text-brand-muted md:text-base">
          Full Hangar does the research that takes buyers hours — automatically, on every listing.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.n} className="relative">
            <article className="h-full rounded-2xl border border-brand-dark bg-card-bg p-6">
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full border border-[#FF9900]/30 bg-[#FF9900]/15 text-sm font-bold text-[#FF9900]">
                {step.n}
              </div>
              <h3 className="mb-2 text-base font-extrabold text-brand-white">{step.title}</h3>
              <p className="text-sm leading-relaxed text-brand-muted">{step.body}</p>
            </article>
            {i < STEPS.length - 1 ? (
              <span
                className="pointer-events-none absolute -right-3 top-1/2 hidden -translate-y-1/2 text-xl text-brand-muted lg:block xl:-right-5"
                aria-hidden
              >
                →
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}
