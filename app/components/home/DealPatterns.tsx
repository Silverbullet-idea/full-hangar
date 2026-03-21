const DEALS = [
  {
    icon: "🔧",
    title: "Deferred Annual Discount",
    body: "Mechanically sound aircraft priced low because the annual is overdue. The seller discounts. You get a pre-buy, pay for the annual, and own a clean airplane below market.",
    tag: "Avg. discount: $800–$2,400 · Risk: Low if engine is healthy",
  },
  {
    icon: "📡",
    title: "Steam Gauge Discount",
    body: "Buy at analog-panel prices, install a GTN 750 or G5, sell at glass-panel prices. The avionics market has clear, consistent premiums Full Hangar maps and tracks.",
    tag: "Uplift potential: $8K–$18K · GTN 750 install: ~$12K retail",
  },
  {
    icon: "📍",
    title: "Geographic Arbitrage",
    body: "The same Piper Cherokee lists $14K cheaper in rural Kansas than in Southern California. Full Hangar's choropleth map shows you exactly where the pricing gaps are, right now.",
    tag: "Avg. Midwest → West Coast delta: $10K–$16K",
  },
]

export default function DealPatterns() {
  return (
    <section className="mt-14">
      <div className="mb-8 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted">Deal intelligence</p>
        <h2 className="mt-2 text-3xl font-extrabold leading-tight text-brand-white md:text-4xl">Three deal patterns worth knowing</h2>
        <p className="mt-3 text-sm text-brand-muted md:text-base">
          Full Hangar is built to surface all three simultaneously — across every listing, every day.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {DEALS.map((d) => (
          <article
            key={d.title}
            className="home-deal-card rounded-2xl border p-6 transition-all hover:-translate-y-0.5 hover:border-brand-orange"
          >
            <div className="mb-4 text-3xl" style={{ color: "inherit", filter: "none" }} aria-hidden>
              {d.icon}
            </div>
            <h3 className="mb-2 text-base font-extrabold">{d.title}</h3>
            <p className="body-text text-sm leading-relaxed">{d.body}</p>
            <p className="home-deal-example-tag mt-4 rounded-lg px-3 py-2.5 text-xs">{d.tag}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
