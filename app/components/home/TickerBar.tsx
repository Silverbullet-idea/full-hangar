import { normalizeHomeCurrency } from "./normalizeHomeCurrency"

const TICKER_PARTS = [
  "LIVE DATA",
  "10,574 Active Listings",
  "8 Data Sources",
  "310,196 FAA Registry Records",
  "110+ Engine TBO References",
  "Cessna",
  "Piper",
  "Beechcraft",
  "Cirrus",
  "Sub-$50K Deal Intelligence",
  "Avionics Valuation Engine",
  "99.57% Avionics Match Rate",
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
        background: "linear-gradient(90deg, #AF4D27 0%, #c55e30 50%, #AF4D27 100%)",
        marginLeft: "calc(-50vw + 50%)",
        marginRight: "calc(-50vw + 50%)",
        width: "100vw",
      }}
    >
      <div className="home-ticker-track flex w-max text-[12px] font-bold uppercase tracking-[0.06em] text-white">
        <TickerStrip />
      </div>
      <style>{`
        @keyframes homeTickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes homeTickerPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
        .home-ticker-track {
          animation: homeTickerScroll 28s linear infinite;
        }
        .home-ticker-live-dot {
          animation: homeTickerPulse 2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .home-ticker-track { animation: none; }
          .home-ticker-live-dot { animation: none; }
        }
      `}</style>
    </div>
  )
}
