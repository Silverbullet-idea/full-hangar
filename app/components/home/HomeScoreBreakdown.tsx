"use client"

import { useEffect, useRef, useState } from "react"

const PILLARS = [
  {
    name: "Market Opportunity",
    weight: "45%",
    score: 81,
    color: "#FF9900",
    description:
      "Price vs. real market comps from 8 sources. Days on market, price reductions, and deal tier relative to active inventory.",
  },
  {
    name: "Condition Intelligence",
    weight: "35%",
    score: 74,
    color: "#4ade80",
    description:
      "Engine TBO remaining, prop overhaul status, life-limited parts, deferred maintenance liability, avionics value uplift. FAA accident history cross-reference.",
  },
  {
    name: "Execution Readiness",
    weight: "20%",
    score: 68,
    color: "#f59e0b",
    description:
      "Seller urgency signals: how long it's been listed, whether the price has dropped, private vs. dealer. Speed-to-close indicators.",
  },
]

export default function HomeScoreBreakdown() {
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
    <section ref={sectionRef} className="mt-14">
      <div className="mb-8 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted">Scoring framework</p>
        <h2 className="mt-2 text-3xl font-extrabold leading-tight text-brand-white md:text-4xl">One score. Every factor explained.</h2>
        <p className="mt-3 text-sm text-brand-muted md:text-base">
          A transparent 0–100 Value Score built from three weighted components. No black boxes.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <div className="rounded-2xl border border-brand-dark bg-card-bg p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Example: 1977 Cessna 172M</p>
          <div className="mt-2 text-[5rem] font-extrabold leading-none text-brand-orange">78</div>
          <p className="text-sm text-brand-muted">Value Score</p>
          <span className="mt-3 inline-block rounded-full border border-[#4ade80]/30 bg-[#4ade80]/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#4ade80]">
            [STRONG DEAL]
          </span>
          <ul className="mt-6 space-y-2">
            <li className="text-xs text-[#4ade80]">↑ 12% below market comp range</li>
            <li className="text-xs text-[#4ade80]">↑ Engine at 78% remaining life</li>
            <li className="text-xs text-[#4ade80]">↑ GTN 750 confirmed (adds ~$14K)</li>
            <li className="text-xs text-red-400">↓ Annual due in 45 days ($1,200 est.)</li>
          </ul>
        </div>

        <div className="space-y-5">
          {PILLARS.map((p) => (
            <div key={p.name}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-extrabold text-brand-white">{p.name}</span>
                <span className="text-xs font-semibold text-brand-muted">{p.weight}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-dark">
                <div
                  className="h-full rounded-full transition-[width] duration-[800ms] ease-out"
                  style={{
                    width: barsVisible ? `${p.score}%` : "0%",
                    backgroundColor: p.color,
                  }}
                />
              </div>
              <div className="mt-1 flex justify-end">
                <span className="text-xs font-bold text-brand-orange">{p.score}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-brand-muted">{p.description}</p>
            </div>
          ))}

          <div className="rounded-xl border border-brand-dark bg-[#161f2d] p-4">
            <h3 className="text-sm font-extrabold text-brand-white">Confidence Layering</h3>
            <p className="mt-2 text-xs leading-relaxed text-brand-muted">
              Every score includes a Data Confidence and Pricing Confidence indicator — so you always know how much signal is behind the
              number, not just what the number is.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
