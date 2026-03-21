export default function HeroScoreCard() {
  return (
    <div
      className="home-hero-score-card relative overflow-hidden rounded-2xl border border-[#2B3444] p-6 opacity-0 [animation:homeScoreCardFade_0.7s_ease_both_0.2s_forwards]"
      style={{ backgroundColor: "#1a2538" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#9AA4B2" }}>
        Full Hangar Score Report
      </p>
      <h3 className="mt-3 text-lg font-extrabold" style={{ color: "#ffffff" }}>
        1979 Cessna 172N Skyhawk
      </h3>
      <p className="mt-1 text-xs" style={{ color: "#9AA4B2" }}>
        N12345 · 4,210 TTAF · IO-360 · Van Nuys, CA
      </p>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex shrink-0 justify-center sm:justify-start">
          <div
            className="relative grid h-[104px] w-[104px] place-items-center rounded-full p-[5px]"
            style={{
              background: "conic-gradient(#FF9900 0% 78%, #2B3444 78% 100%)",
            }}
          >
            <div className="grid h-full w-full place-items-center rounded-full" style={{ backgroundColor: "#1a2538" }}>
              <div className="text-center leading-none">
                <span className="text-3xl font-extrabold text-brand-orange">78</span>
                <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: "#9AA4B2" }}>
                  Score
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <PillarRow label="Market Opportunity" value={81} pct={81} barClass="bg-brand-orange" />
          <PillarRow label="Condition" value={74} pct={74} barClass="bg-[#4ade80]" />
          <PillarRow label="Execution" value={68} pct={68} barClass="bg-[#f59e0b]" />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <span className="rounded-md border border-[#4ade80]/25 bg-[#4ade80]/12 px-2.5 py-1 text-[11px] font-semibold text-[#4ade80]">
          12% Below Market
        </span>
        <span className="rounded-md border border-[#4ade80]/25 bg-[#4ade80]/12 px-2.5 py-1 text-[11px] font-semibold text-[#4ade80]">
          Engine 78% Life
        </span>
        <span className="rounded-md border border-[#FF9900]/25 bg-[#FF9900]/12 px-2.5 py-1 text-[11px] font-semibold text-[#FF9900]">
          GTN 750 Detected
        </span>
        <span className="rounded-md border border-red-500/25 bg-red-500/12 px-2.5 py-1 text-[11px] font-semibold text-red-400">
          Annual Due 45 Days
        </span>
      </div>

      <div className="mt-5 border-t border-[#2B3444] pt-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span style={{ color: "#9AA4B2" }}>
            Asking:{" "}
            <span className="font-bold" style={{ color: "#ffffff" }}>
              {"$38,500"}
            </span>
          </span>
          <span style={{ color: "#9AA4B2" }}>
            Market:{" "}
            <span className="font-bold" style={{ color: "#ffffff" }}>
              {"$42K – $48K"}
            </span>
          </span>
        </div>
        <p className="mt-1 text-xs font-semibold text-[#4ade80]">
          ↓ {"$3,500 discount signal"}
        </p>
      </div>

      <style>{`
        @keyframes homeScoreCardFade {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .home-hero-score-card {
            animation: none;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

function PillarRow({
  label,
  value,
  pct,
  barClass,
}: {
  label: string
  value: number
  pct: number
  barClass: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-bold" style={{ color: "#ffffff" }}>
          {label}
        </span>
        <span className="font-extrabold text-brand-orange">{value}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#2B3444]">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
