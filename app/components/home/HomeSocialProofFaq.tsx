const TESTIMONIALS = [
  {
    quote:
      "I found a Cherokee 180 priced $9K below market because the annual was 3 months overdue. Full Hangar flagged it in seconds. I got the annual done for $1,100 and resold it.",
    author: "Private buyer · Coeur d'Alene, ID",
  },
  {
    quote:
      "The avionics scoring alone is worth it. I've stopped calling sellers who list a 'full glass panel' when it turns out to be a single Garmin aera on a RAM mount.",
    author: "Instrument-rated buyer · Pacific Northwest",
  },
  {
    quote:
      "I can run a Deal Desk P&L before I even call the seller. Acquisition cost, upgrade capex, carrying cost, exit value — in one screen. That's a dealmaker tool.",
    author: "Beta user · Deal Desk feature",
  },
]

const FAQ_ITEMS = [
  {
    question: "Where do listing scores come from?",
    answer:
      "Scores combine market opportunity, condition, and execution readiness using listing data, comp data, and aircraft detail signals.",
  },
  {
    question: "Can I see why a score was high or low?",
    answer:
      "Yes. Each detail page includes a clear factor breakdown so you can inspect the strongest positive and negative drivers.",
  },
  {
    question: "Do you account for missing or noisy data?",
    answer:
      "Yes. Data Confidence and Pricing Confidence are surfaced so you can judge signal quality before making decisions.",
  },
]

export default function HomeSocialProofFaq() {
  return (
    <section className="mt-14 grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-brand-dark bg-card-bg p-6 md:p-7">
        <h2 className="text-3xl font-extrabold leading-tight text-brand-white md:text-4xl">Why people keep coming back</h2>
        <p className="mt-3 text-sm text-brand-muted">Built for fast decision cycles, repeatable analysis, and fewer expensive misses.</p>
        <div className="mt-5 space-y-3">
          {TESTIMONIALS.map((item) => (
            <blockquote key={item.author} className="rounded-2xl border border-brand-dark bg-card-bg p-6">
              <p className="text-base leading-relaxed text-brand-muted">&ldquo;{item.quote}&rdquo;</p>
              <footer className="mt-3 text-xs font-semibold text-brand-muted">— {item.author}</footer>
            </blockquote>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-brand-dark bg-card-bg p-6 md:p-7">
        <h2 className="text-3xl font-extrabold leading-tight text-brand-white md:text-4xl">Frequently asked questions</h2>
        <p className="mt-3 text-sm text-brand-muted">Quick answers on scoring, confidence, and decision support.</p>
        <div className="mt-5 space-y-3">
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className="home-faq-item group rounded-xl border border-brand-dark p-4 transition hover:border-[#55657f]">
              <summary className="cursor-pointer list-none text-base font-bold text-brand-orange">{item.question}</summary>
              <p className="mt-2 text-sm leading-relaxed text-brand-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
