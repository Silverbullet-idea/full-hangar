import { normalizeHomeCurrency } from "./normalizeHomeCurrency"

type Infographic = {
  label: string
  value: string
  trend: string
  barPct: number
  barColor: "orange" | "amber" | "green" | "red"
}

const CARDS: Infographic[] = [
  {
    label: "Cessna 172 median asking price (pre-1980)",
    value: "$42,500",
    trend: "↑ Up ~8% vs. 18 months ago",
    barPct: 72,
    barColor: "orange",
  },
  {
    label: "Avg. days on market before price reduction",
    value: "47 days",
    trend: "Reduction = negotiation leverage",
    barPct: 47,
    barColor: "orange",
  },
  {
    label: "Listings with deferred annual inspection",
    value: "~22% of sub-$50K",
    trend: "Avg. $800–$2,400 discount signal",
    barPct: 22,
    barColor: "amber",
  },
  {
    label: "Avionics premium: steam gauge → glass panel",
    value: "+$8K–$18K uplift",
    trend: "GTN 750 install alone: $12K–$18K retail",
    barPct: 65,
    barColor: "green",
  },
  {
    label: "Piper Cherokee 180 geographic price spread",
    value: "$14K delta",
    trend: "Rural Midwest vs. Metro West Coast",
    barPct: 55,
    barColor: "orange",
  },
  {
    label: "Piper PA-28 wing spar AD (AD 2024) exposure",
    value: "21,000+ aircraft",
    trend: "$25K–$60K liability if triggered",
    barPct: 85,
    barColor: "red",
  },
]

const BAR_BG: Record<Infographic["barColor"], string> = {
  orange: "bg-brand-orange",
  amber: "bg-[#f59e0b]",
  green: "bg-[#4ade80]",
  red: "bg-[#f87171]",
}

const TREND_COLOR: Record<Infographic["barColor"], string> = {
  orange: "text-brand-orange",
  amber: "text-[#f59e0b]",
  green: "text-[#4ade80]",
  red: "text-[#f87171]",
}

export default function MarketInfographics() {
  return (
    <section className="mt-14">
      <div className="mb-6 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted">Market intelligence</p>
        <h2 className="mt-2 text-3xl font-extrabold leading-tight text-brand-white md:text-4xl">The numbers behind the deals</h2>
        <p className="mt-3 text-sm text-brand-muted md:text-base">
          Real signals from the piston-single market — where Full Hangar focuses its intelligence engine.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card, i) => (
          <article
            key={card.label}
            className="home-reveal-infographic rounded-2xl border border-brand-dark bg-card-bg p-5 transition-all hover:-translate-y-0.5 hover:border-brand-orange"
            style={{ animationDelay: `${80 + i * 50}ms` }}
          >
            <p className="mb-1.5 text-xs text-brand-muted">{card.label}</p>
            <p className="text-3xl font-extrabold leading-tight text-brand-white">{normalizeHomeCurrency(card.value)}</p>
            <p className={`mt-2 text-xs ${TREND_COLOR[card.barColor]}`}>{normalizeHomeCurrency(card.trend)}</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-brand-dark">
              <div className={`h-full rounded-full ${BAR_BG[card.barColor]}`} style={{ width: `${card.barPct}%` }} />
            </div>
          </article>
        ))}
      </div>
      <style>{`
        .home-reveal-infographic {
          opacity: 0;
          transform: translateY(14px);
          animation: homeFadeUp 560ms cubic-bezier(.2,.8,.2,1) forwards;
        }
        @keyframes homeFadeUp {
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .home-reveal-infographic {
            opacity: 1;
            transform: none;
            animation: none;
          }
        }
      `}</style>
    </section>
  )
}
