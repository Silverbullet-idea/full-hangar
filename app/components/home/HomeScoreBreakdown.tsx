"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { FLIP_TIER_CONFIG } from "@/lib/scoring/flipTierConfig"

/** Same hypothetical listing as `HeroScoreCard` — pillars sum to 78. */
const EXAMPLE_FLIP_TOTAL = 78

const EXAMPLE_PILLARS = [
  { name: "Pricing edge", pts: 28, max: 35, color: "#FF9900" },
  { name: "Airworthiness", pts: 16, max: 20, color: "#38bdf8" },
  { name: "Improvement room", pts: 22, max: 30, color: "#2dd4bf" },
  { name: "Exit liquidity", pts: 12, max: 15, color: "#a78bfa" },
] as const

const PILLAR_DEEP_DIVES: Array<{
  name: string
  pts: number
  max: number
  body: string
}> = [
  {
    name: "Pricing edge",
    pts: 28,
    max: 35,
    body:
      "We compare **true cost** (asking price plus estimated deferred maintenance) to a live comp median for similar 172Ns. In this example the ask is **$38,500** and the annual is due in about 45 days, so we book roughly **$1,200** of near-term maintenance liability — true cost lands near **$39,700**. Active comps for the same vintage and equipment cluster around **$42K–$48K** (~**$45K** midpoint), so true cost sits about **12% below** that midpoint. That ratio maps into the upper pricing-edge band (not quite the top bin, because the comp sample is finite and we discount a little for pricing-confidence noise). **28/35** reflects a strong but not extreme buy against the market.",
  },
  {
    name: "Airworthiness",
    pts: 16,
    max: 20,
    body:
      "This pillar blends **engine life remaining** with **risk/condition**. The powerplant is modeled at about **78% life remaining** before overhaul — that contributes solid engine-side points. Overall **risk level** is **Moderate** (not Low): the logbooks read fine, but the **annual is due in 45 days**, which is a real execution and airworthiness schedule item for the next owner. We cap how much “condition” credit we give when near-term inspections are pending. Net: strong engine story, moderated by calendar maintenance pressure → **16/20**.",
  },
  {
    name: "Improvement room",
    pts: 22,
    max: 30,
    body:
      "Here we reward **upside that a buyer can still capture** in avionics and presentation. A **GTN 750** is already installed, so we do **not** treat the panel as pure steam-gauge upside — the big glass uplift is largely **already in the airplane**. We still award meaningful points because the rest of the stack and cosmetics are not a “fully modernized” flagship spec: there is room to rationalize backups, ADS-B presentation, paint/interior polish, and small panel gaps on a resale. Think partial avionics headroom plus normal condition gap vs. a mint retail example — together that lands at **22/30**.",
  },
  {
    name: "Exit liquidity",
    pts: 12,
    max: 15,
    body:
      "We score how quickly this **make/model** tends to trade, adjusted for **days on market**. A **Cessna 172** sits in our **high-liquidity** bucket — there is almost always a bid for a sensibly priced Skyhawk. This listing has been marketed long enough to pick up a modest **DOM penalty** (not stale, but not day-one fresh either), so we shave a point or two off the liquidity ceiling. Net: still a very sellable tail, just not a perfect liquidity read → **12/15**.",
  },
]

function formatDetailParagraphs(text: string) {
  const chunks = text.split(/\*\*(.+?)\*\*/g)
  const out: ReactNode[] = []
  for (let i = 0; i < chunks.length; i += 1) {
    if (i % 2 === 1) {
      out.push(
        <strong key={i} className="font-bold text-brand-white [data-theme=light]:text-slate-900">
          {chunks[i]}
        </strong>
      )
    } else if (chunks[i]) {
      out.push(<span key={i}>{chunks[i]}</span>)
    }
  }
  return out
}

function pillarBarColor(blockName: string) {
  return EXAMPLE_PILLARS.find((x) => x.name === blockName)?.color ?? "#FF9900"
}

export default function HomeScoreBreakdown() {
  const tier = FLIP_TIER_CONFIG.GOOD
  const sectionRef = useRef<HTMLElement>(null)
  const [barsVisible, setBarsVisible] = useState(false)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setBarsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.25 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={sectionRef} id="how-it-works" className="mt-14 scroll-mt-24">
      <div className="mb-8 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted">Scoring framework</p>
        <h2 className="mt-2 text-3xl font-extrabold leading-tight text-brand-white md:text-4xl">One score. Every factor explained.</h2>
        <p className="mt-3 text-sm text-brand-muted md:text-base">
          A transparent 0–100 Flip Score built from four pillars (pricing edge, airworthiness, improvement room, exit liquidity).
          Tiers: HOT, GOOD, FAIR, PASS — oriented around resale and flip opportunity, not a black box.
        </p>
      </div>

      <div className="home-score-breakdown max-w-4xl rounded-2xl border border-brand-dark bg-card-bg p-6 md:p-8 [data-theme=light]:border-slate-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Example: 1979 Cessna 172N Skyhawk</p>
        <p className="mt-3 text-sm leading-relaxed text-brand-muted [data-theme=light]:text-slate-600">
          Same aircraft as the score card above. Overall Flip Score is{" "}
          <span className="font-bold text-brand-white [data-theme=light]:text-slate-900">{EXAMPLE_FLIP_TOTAL}</span> (tier{" "}
          <span className="font-semibold text-[#4ade80]">GOOD</span>). The four pillars beside the total add up to that number — no hidden
          multipliers.
        </p>

        <div className="mt-6 flex flex-col gap-8 md:flex-row md:items-start md:gap-10">
          <div className="shrink-0 md:min-w-[8rem]">
            <div className="text-[4.5rem] font-extrabold leading-none text-brand-orange sm:text-[5rem]">{EXAMPLE_FLIP_TOTAL}</div>
            <p className="text-sm text-brand-muted [data-theme=light]:text-slate-600">Flip score</p>
            <span
              className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${tier.bg} ${tier.text}`}
            >
              {tier.label}
            </span>
          </div>

          <div className="min-w-0 flex-1 border-t border-brand-dark pt-6 md:border-l md:border-t-0 md:pl-10 md:pt-1 [data-theme=light]:border-slate-200">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-muted">Pillar breakdown</p>
            <ul className="mt-4 space-y-3">
              {EXAMPLE_PILLARS.map((p) => {
                const pct = p.max > 0 ? Math.round((p.pts / p.max) * 100) : 0
                return (
                  <li key={p.name}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-brand-white [data-theme=light]:text-slate-900">{p.name}</span>
                      <span className="tabular-nums text-brand-muted [data-theme=light]:text-slate-600">
                        {p.pts}/{p.max}
                      </span>
                    </div>
                    <div className="home-pillar-track mt-1.5 h-2 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full transition-[width] duration-[800ms] ease-out"
                        style={{
                          width: barsVisible ? `${pct}%` : "0%",
                          backgroundColor: p.color,
                        }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-brand-dark pt-8 [data-theme=light]:border-slate-200">
          <h3 className="text-lg font-extrabold text-brand-white [data-theme=light]:text-slate-900">
            How we got to {EXAMPLE_FLIP_TOTAL}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-brand-muted [data-theme=light]:text-slate-600">
            Hypothetical walkthrough — numbers match this example. Real listings use the same pillar structure; only the inputs change.
          </p>

          <div className="mt-6 space-y-4">
            {PILLAR_DEEP_DIVES.map((block) => {
              const color = pillarBarColor(block.name)
              const pct = block.max > 0 ? Math.round((block.pts / block.max) * 100) : 0
              return (
                <div
                  key={block.name}
                  className="rounded-xl border border-brand-dark/80 bg-black/15 p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-slate-50"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h4 className="shrink-0 text-base font-extrabold text-brand-white [data-theme=light]:text-slate-900">
                      {block.name}
                    </h4>
                    <div className="home-pillar-track h-2 min-w-[4rem] flex-1 basis-[6rem] overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full transition-[width] duration-[800ms] ease-out"
                        style={{
                          width: barsVisible ? `${pct}%` : "0%",
                          backgroundColor: color,
                        }}
                      />
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-brand-orange">
                      {block.pts}/{block.max}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-brand-muted [data-theme=light]:text-slate-600">
                    {formatDetailParagraphs(block.body)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="home-confidence-box mt-8 rounded-xl border p-4">
          <h3 className="text-sm font-extrabold">Confidence layering</h3>
          <p className="mt-2 text-xs leading-relaxed">
            Every Flip Score sits alongside Data Confidence and Pricing Confidence — so you always know how much signal is behind the
            number, not just what the number is.
          </p>
        </div>
      </div>
    </section>
  )
}
