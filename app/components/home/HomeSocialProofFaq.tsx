/** Composite feedback from early users — illustrative, not paid endorsements. */
const TESTIMONIALS = [
  {
    quote:
      "I found a Cherokee 180 priced below market because the annual was overdue. The listing signals pointed me there fast — I still did my own PPI and logbook work.",
    author: "Private buyer · Pacific Northwest",
  },
  {
    quote:
      "The avionics scoring alone saves phone calls. I can tell when 'full glass' in the ad doesn't match what's in the parser output.",
    author: "Instrument-rated buyer",
  },
  {
    quote:
      "Deal Desk lets me run acquisition, upgrade capex, carrying cost, and exit before I call the seller. It's a workflow tool, not a guarantee.",
    author: "Beta user · flip-focused",
  },
]

const FAQ_ITEMS = [
  {
    question: "Where do Flip Scores come from?",
    answer:
      "Flip Score blends four pillars — pricing edge vs. comps, airworthiness, improvement headroom (avionics/condition gap), and exit liquidity (model demand + days on market) — using listing data, comp bands, and enrichment signals.",
  },
  {
    question: "Can I see why a Flip Score was high or low?",
    answer:
      "Yes. Each listing detail page shows pillar points (out of 35 / 20 / 30 / 15) so you can see exactly what helped or hurt the total.",
  },
  {
    question: "Do you account for missing or noisy data?",
    answer:
      "Yes. Data Confidence and Pricing Confidence are surfaced so you can judge signal quality before making decisions.",
  },
  {
    question: "What should I verify before I buy a flip candidate?",
    answer:
      "Treat Flip Score as a triage layer, not a pre-buy report. Plan on logbook review, AD compliance, title/lien checks, compression and corrosion hotspots, and a qualified pre-purchase inspection (PPI) — especially when airworthiness or pricing confidence is only moderate.",
  },
  {
    question: "Does a high Flip Score mean I will profit?",
    answer:
      "No. Scores highlight relative opportunity and risk from listing-side data; your actual outcome depends on purchase price, surprise maintenance, how long you hold the asset, financing cost, and exit timing. Use scores to prioritize leads, then model the deal explicitly (for example in Deal Desk) before you commit.",
  },
  {
    question: "Which upgrades usually matter most for resale?",
    answer:
      "Buyers often discount dated panels and tired interiors, so avionics and cosmetics can move resale — but not dollar-for-dollar. The improvement-room pillar is a guide to headroom: already-modern glass may mean less upgrade upside than a steam-gauge airplane priced like glass. Match upgrades to what that model’s buyers expect, not your personal dream panel.",
  },
  {
    question: "How should I think about holding costs on a flip?",
    answer:
      "Hangar or tiedown, insurance, any debt service, and opportunity cost of capital all eat margin on a short hold. Narrow pricing edge gets risky if the airplane sits; pair liquidity signals with a realistic carrying-cost budget and a target exit window before you offer.",
  },
  {
    question: "Is it better to chase cheap airframes or strong engines?",
    answer:
      "Both paths work if the math works. Cheap airframes with heavy mechanical risk need margin for the unknown; strong engines at full retail need a clear resale story. Watch pricing edge vs. airworthiness together — a great price on paper is less attractive if overhaul or calendar items are lurking.",
  },
  {
    question: "How long does a typical flip take?",
    answer:
      "There is no single timeline: annuals, squawks, paint or avionics shop queues, buyer financing, and seasonality all move the clock. Use exit liquidity and days-on-market context as a sanity check, then underwrite a conservative hold period in your own model rather than assuming a 30-day turn.",
  },
]

export default function HomeSocialProofFaq() {
  return (
    <section className="mx-auto mt-14 grid max-w-6xl gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-brand-dark bg-card-bg p-6 text-center md:p-7 lg:text-left">
        <h2 className="text-3xl font-extrabold leading-tight text-brand-white md:text-4xl">What early users say</h2>
        <p className="mt-3 text-sm text-brand-muted">
          Paraphrased feedback from buyers and beta testers — not paid testimonials. Your mileage varies with every airframe.
        </p>
        <div className="mt-5 space-y-3">
          {TESTIMONIALS.map((item) => (
            <blockquote key={item.author} className="rounded-2xl border border-brand-dark bg-card-bg p-6 text-left">
              <p className="text-base leading-relaxed text-brand-muted">&ldquo;{item.quote}&rdquo;</p>
              <footer className="mt-3 text-xs font-semibold text-brand-muted">— {item.author}</footer>
            </blockquote>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-brand-dark bg-card-bg p-6 text-center md:p-7 lg:text-left">
        <h2 className="text-3xl font-extrabold leading-tight text-brand-white md:text-4xl">Frequently asked questions</h2>
        <p className="mt-3 text-sm text-brand-muted">
          Quick answers on scoring, flipping workflow, confidence, and decision support.
        </p>
        <div className="mt-5 space-y-3">
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className="home-faq-item group rounded-xl border border-brand-dark p-4 text-left transition hover:border-[#55657f]">
              <summary className="cursor-pointer list-none text-base font-bold text-brand-orange">{item.question}</summary>
              <p className="mt-2 text-sm leading-relaxed text-brand-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
