const TESTIMONIALS = [
  {
    quote:
      "I can quickly see whether an aircraft is truly below market or just priced to look attractive. That saves hours every week.",
    author: "Active buyer",
  },
  {
    quote:
      "The score breakdown makes it easier to explain decisions to partners. We move faster because the risk story is clear.",
    author: "Deal desk user",
  },
  {
    quote:
      "I like that confidence and comp depth are visible up front. It tells me when to trust the signal and when to verify.",
    author: "Private investor",
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
      <div className="rounded-2xl border border-[#3A4454] bg-[#121923] p-6 md:p-7">
        <h2 className="text-3xl font-extrabold leading-tight text-white md:text-4xl">Why people keep coming back</h2>
        <p className="mt-3 text-sm text-[#c6d0dd]">Built for fast decision cycles, repeatable analysis, and fewer expensive misses.</p>
        <div className="mt-5 space-y-3">
          {TESTIMONIALS.map((item) => (
            <blockquote key={item.quote} className="rounded-xl border border-[#3A4454] bg-[#161f2d] p-5 shadow-[0_8px_20px_rgba(0,0,0,0.2)]">
              <p className="text-base leading-relaxed text-[#e4ebf5]">"{item.quote}"</p>
              <footer className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#9bb0c9]">{item.author}</footer>
            </blockquote>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-[#3A4454] bg-[#121923] p-6 md:p-7">
        <h2 className="text-3xl font-extrabold leading-tight text-white md:text-4xl">Frequently asked questions</h2>
        <p className="mt-3 text-sm text-[#c6d0dd]">Quick answers on scoring, confidence, and decision support.</p>
        <div className="mt-5 space-y-3">
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className="group rounded-xl border border-[#3A4454] bg-[#161f2d] p-4 transition hover:border-[#55657f]">
              <summary className="cursor-pointer list-none text-base font-bold text-[#FF9900]">
                {item.question}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-[#d2dae6]">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
