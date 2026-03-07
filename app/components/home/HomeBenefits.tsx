const BENEFITS = [
  {
    title: "Find undervalued aircraft faster",
    description: "Filter by value score and deal tier to surface priority opportunities quickly.",
  },
  {
    title: "Price against real market comps",
    description: "Instantly see whether an asking price is above, near, or below market.",
  },
  {
    title: "Expose true ownership cost",
    description: "Account for maintenance and avionics signals before deciding what a deal is really worth.",
  },
  {
    title: "Prioritize execution-ready deals",
    description: "Use risk, days on market, and reductions to focus on better negotiation setups.",
  },
]

export default function HomeBenefits() {
  return (
    <section className="mt-14">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted">Built for high-conviction buying</p>
        <h2 className="mt-2 text-3xl font-extrabold leading-tight text-white md:text-4xl">Why buyers use Full Hangar</h2>
        <p className="mt-3 max-w-3xl text-sm text-brand-muted md:text-base">Fast, data-backed decisions in a noisy market.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {BENEFITS.map((benefit) => (
          <article
            key={benefit.title}
            className="group rounded-xl border border-[#3A4454] bg-[linear-gradient(165deg,#161d28_0%,#141b26_100%)] p-6 shadow-[0_14px_30px_rgba(0,0,0,0.24)] transition hover:-translate-y-0.5 hover:border-[#55657f]"
          >
            <h3 className="text-xl font-bold text-[#FF9900]">{benefit.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-brand-muted">{benefit.description}</p>
            <div className="mt-4 h-px w-full bg-gradient-to-r from-[#AF4D27] via-[#FF9900] to-transparent opacity-55" />
          </article>
        ))}
      </div>
    </section>
  )
}
