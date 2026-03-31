import { normalizeHomeCurrency } from "./normalizeHomeCurrency"

const TICKER_PARTS = [
  "Live listings",
  "Multiple data sources",
  "FAA registry enrichment",
  "Engine TBO references",
  "Flip Score + comps",
  "Deal Coach buy & sell",
  "Avionics parsing",
]

function TickerStrip() {
  const text = normalizeHomeCurrency(TICKER_PARTS.join("  ·  "))
  return (
    <>
      <span className="home-ticker-segment inline-flex shrink-0 items-center gap-3 whitespace-nowrap px-6">
        <span className="inline-flex items-center gap-2">
          <span className="home-ticker-live-dot inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#4ade80]" aria-hidden />
          <span>{text}</span>
        </span>
      </span>
      <span className="home-ticker-segment inline-flex shrink-0 items-center gap-3 whitespace-nowrap px-6" aria-hidden>
        <span className="inline-flex items-center gap-2">
          <span className="home-ticker-live-dot inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#4ade80]" />
          <span>{text}</span>
        </span>
      </span>
    </>
  )
}

export default function TickerBar() {
  return (
    <div
      className="home-ticker-outer relative w-screen max-w-none overflow-hidden py-2.5"
      style={{
        background: "linear-gradient(90deg, #8f3f20 0%, #AF4D27 45%, #8f3f20 100%)",
        marginLeft: "calc(-50vw + 50%)",
        marginRight: "calc(-50vw + 50%)",
        width: "100vw",
      }}
    >
      <div className="home-ticker-track flex w-max text-[11px] font-semibold uppercase tracking-[0.08em] text-white/95">
        <TickerStrip />
      </div>
      <style>{`
        @keyframes homeTickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .home-ticker-track {
          animation: homeTickerScroll 42s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .home-ticker-track { animation: none; }
        }
      `}</style>
    </div>
  )
}
