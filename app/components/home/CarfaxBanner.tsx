export default function CarfaxBanner() {
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col items-start gap-6 rounded-2xl border border-brand-dark bg-card-bg px-6 py-7 sm:flex-row sm:items-center sm:px-8">
      <span className="flex-shrink-0 text-4xl" aria-hidden>
        ✈️
      </span>
      <div>
        <h2 className="mb-1 text-lg font-bold text-brand-white">Think Carfax — but for airplanes.</h2>
        <p className="text-sm leading-relaxed text-brand-muted">
          Every listing is cross-referenced against FAA registry data, 110+ engine TBO records, 41 propeller overhaul schedules, and real
          market comps from 8 sources — so you see the true cost, not just the asking price.
        </p>
      </div>
    </div>
  )
}
