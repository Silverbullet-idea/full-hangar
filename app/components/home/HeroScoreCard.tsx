import type { HeroHomeScoreCardPayload } from "@/lib/home/heroFeaturedScoreCard"
import { FLIP_TIER_CONFIG } from "@/lib/scoring/flipTierConfig"
import Link from "next/link"

const DEMO_PILLARS = [
  { label: "Pricing edge", pts: 28, max: 35, barClass: "bg-brand-orange" },
  { label: "Airworthiness", pts: 16, max: 20, barClass: "bg-sky-400" },
  { label: "Improvement room", pts: 22, max: 30, barClass: "bg-teal-400" },
  { label: "Exit liquidity", pts: 12, max: 15, barClass: "bg-violet-400" },
] as const

const BADGE_TONE: Record<
  "green" | "orange" | "red" | "slate",
  string
> = {
  green: "border-[#4ade80]/25 bg-[#4ade80]/12 text-[#4ade80]",
  orange: "border-[#FF9900]/25 bg-[#FF9900]/12 text-[#FF9900]",
  red: "border-red-500/25 bg-red-500/12 text-red-400",
  slate: "border-[#3A4454]/60 bg-[#1a2332] text-[#9AA4B2]",
}

export default function HeroScoreCard({ score }: { score: HeroHomeScoreCardPayload }) {
  const live = score.kind === "live"

  const title = live ? score.title : "1979 Cessna 172N Skyhawk"
  const subtitle = live ? score.subtitle : "N12345 · 4,210 TTAF · IO-360 · Van Nuys, CA"
  const flipScore = live ? score.flipScore : 78
  const tierKey = live ? score.flipTierKey : "GOOD"
  const tier = FLIP_TIER_CONFIG[tierKey] ?? FLIP_TIER_CONFIG.GOOD
  const pillars = live ? score.pillars : DEMO_PILLARS
  const ringPct = Math.max(0, Math.min(100, flipScore))

  const badges = live
    ? score.badges
    : ([
        { text: "12% Below Market", tone: "green" as const },
        { text: "Engine 78% Life", tone: "green" as const },
        { text: "GTN 750 Detected", tone: "orange" as const },
        { text: "Annual Due 45 Days", tone: "red" as const },
      ] as const)

  const askingText = live ? score.askingText : "$38,500"
  const marketText = live ? score.marketText : "$42K – $48K"
  const discountText = live ? score.discountText : "↓ $3,500 discount signal"

  return (
    <div
      className="home-score-card home-hero-score-card relative overflow-hidden rounded-2xl border p-6 opacity-0 [animation:homeScoreCardFade_0.7s_ease_0.2s_forwards]"
    >
      <p className="home-score-card-text-muted text-[10px] font-bold uppercase tracking-[0.2em]">
        Full Hangar Score Report
      </p>
      <h3 className="home-score-card-text-primary mt-3 text-lg font-extrabold">{title}</h3>
      <p className="home-score-card-text-muted mt-1 text-xs">{subtitle}</p>
      {live ? (
        <Link
          href={score.listingHref}
          className="mt-2 inline-block text-xs font-semibold text-[#FF9900] underline-offset-2 hover:underline"
        >
          View full listing
        </Link>
      ) : null}

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2 sm:items-start">
          <div
            className="home-score-card-ring relative grid h-[104px] w-[104px] place-items-center rounded-full p-[5px]"
            style={{
              background: `conic-gradient(#FF9900 0% ${ringPct}%, var(--ring-track) ${ringPct}% 100%)`,
            }}
          >
            <div className="home-score-card-ring-bg grid h-full w-full place-items-center rounded-full">
              <div className="text-center leading-none">
                <span className="text-3xl font-extrabold text-brand-orange">{flipScore}</span>
                <div className="home-score-card-text-muted mt-0.5 text-[9px] font-bold uppercase tracking-wider">
                  Flip score
                </div>
              </div>
            </div>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tier.bg} ${tier.text}`}
          >
            {tier.label}
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-2.5">
          {pillars.map((p) => (
            <FlipPillarRow key={p.label} label={p.label} pts={p.pts} max={p.max} barClass={p.barClass} />
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {badges.map((b) => (
          <span
            key={b.text}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${BADGE_TONE[b.tone]}`}
          >
            {b.text}
          </span>
        ))}
      </div>

      <div className="home-score-card-section-divider mt-5 border-t pt-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="home-score-card-text-muted">
            Asking: <span className="home-score-card-text-primary font-bold">{askingText}</span>
          </span>
          {marketText ? (
            <span className="home-score-card-text-muted">
              Market: <span className="home-score-card-text-primary font-bold">{marketText}</span>
            </span>
          ) : null}
        </div>
        {discountText ? (
          <p className="mt-1 text-xs font-semibold text-[#4ade80]">{discountText}</p>
        ) : null}
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

function FlipPillarRow({
  label,
  pts,
  max,
  barClass,
}: {
  label: string
  pts: number
  max: number
  barClass: string
}) {
  const pct = max > 0 ? Math.round((pts / max) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="home-score-card-text-primary font-bold">{label}</span>
        <span className="home-score-card-text-muted font-extrabold tabular-nums">
          {pts}/{max}
        </span>
      </div>
      <div className="home-score-card-bar-track mt-1 h-1.5 overflow-hidden rounded-full">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
