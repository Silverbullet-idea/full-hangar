import Link from "next/link"

type HomeScoringExplainerProps = {
  sampleListingHref: string
}

const PILLARS = [
  {
    title: "Market Opportunity",
    weight: "45%",
    description: "Comps and market tier fit.",
  },
  {
    title: "Condition",
    weight: "35%",
    description: "Airframe, engine, and maintenance risk.",
  },
  {
    title: "Execution Readiness",
    weight: "20%",
    description: "Seller urgency and execution speed.",
  },
]

export default function HomeScoringExplainer({ sampleListingHref }: HomeScoringExplainerProps) {
  return (
    <section id="how-we-score" className="mt-14 rounded-2xl border border-[#3A4454] bg-[#121923] p-6 md:p-9">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted">Scoring framework</p>
        <h2 className="mt-2 text-3xl font-extrabold leading-tight text-white md:text-4xl">How Full Hangar scores aircraft</h2>
        <p className="mt-3 max-w-3xl text-sm text-brand-muted md:text-base">A simple 0-100 score to highlight buying edge.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {PILLARS.map((pillar) => (
          <article key={pillar.title} className="rounded-xl border border-[#3A4454] bg-[#161f2d] p-5 shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand-muted">{pillar.weight} weight</div>
            <h3 className="mt-1 text-xl font-bold text-[#FF9900]">{pillar.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-brand-muted">{pillar.description}</p>
          </article>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[#3A4454] bg-[#161f2d] p-5">
          <h3 className="text-lg font-bold text-white">Confidence layering</h3>
          <p className="mt-2 text-sm leading-relaxed text-brand-muted">Data Confidence and Pricing Confidence show how reliable each score is.</p>
        </div>
        <div className="rounded-xl border border-[#3A4454] bg-[#161f2d] p-5">
          <h3 className="text-lg font-bold text-white">Transparent factors</h3>
          <p className="mt-2 text-sm leading-relaxed text-brand-muted">See the exact factors behind every score on the detail page.</p>
          <Link
            href={sampleListingHref}
            className="mt-4 inline-flex rounded-md border border-[#FF9900] bg-[#FF990014] px-4 py-2 text-sm font-semibold !text-[#FF9900] transition hover:bg-[#FF9900] hover:!text-black"
          >
            View a scored aircraft example
          </Link>
        </div>
      </div>
    </section>
  )
}
