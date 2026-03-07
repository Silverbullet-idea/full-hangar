const FLOW_STEPS = [
  {
    step: "Step 1",
    title: "Scan opportunities",
    text: "Browse listings with filters for deal tier, risk, price band, and value score to quickly narrow candidates.",
  },
  {
    step: "Step 2",
    title: "Validate with intelligence",
    text: "Open detail pages to review comp ranges, confidence levels, FAA context, and maintenance signals.",
  },
  {
    step: "Step 3",
    title: "Move on the best edge",
    text: "Use execution clues (DOM, reductions, seller urgency) to prioritize outreach and negotiation sequence.",
  },
]

const SIGNALS = [
  "Asking price materially below modeled market range",
  "Long days-on-market with fresh reduction signals",
  "Stronger-than-peer engine/airframe profile",
  "Comp depth sufficient for confident pricing decisions",
]

export default function HomeDealSignals() {
  return (
    <section className="mt-14 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="rounded-2xl border border-[#3A4454] bg-[#161d28] p-6 md:p-7">
        <h2 className="text-3xl font-extrabold leading-tight text-white md:text-4xl">From listing to decision</h2>
        <p className="mt-3 text-sm text-[#c6d0dd]">
          A practical workflow built for buyers who need to make faster, better-informed offers.
        </p>
        <div className="mt-5 grid gap-3">
          {FLOW_STEPS.map((item) => (
            <article key={item.title} className="rounded-xl border border-[#3A4454] bg-[#111a27] p-5 shadow-[0_8px_20px_rgba(0,0,0,0.2)]">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#9bb0c9]">{item.step}</div>
              <h3 className="mt-1 text-lg font-bold text-[#FF9900]">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#d2dae6]">{item.text}</p>
            </article>
          ))}
        </div>
      </div>
      <aside className="rounded-2xl border border-[#3A4454] bg-[#121923] p-6 md:p-7">
        <h2 className="text-2xl font-extrabold text-white">Featured deal signals</h2>
        <p className="mt-3 text-sm text-[#c6d0dd]">High-signal patterns that often indicate actionable pricing edge.</p>
        <ul className="mt-4 space-y-3">
          {SIGNALS.map((signal) => (
            <li key={signal} className="rounded-lg border border-[#3A4454] bg-[#161f2d] px-3 py-2.5 text-sm text-[#e2e8f0]">
              {signal}
            </li>
          ))}
        </ul>
      </aside>
    </section>
  )
}
