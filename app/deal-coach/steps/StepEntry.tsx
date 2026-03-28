"use client"

import type { DealMode } from "../types"
import type { StepProps } from "./types"

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

const OPTIONS: { mode: DealMode; emoji: string; title: string; subtitle: string }[] = [
  {
    mode: "buy",
    emoji: "🛒",
    title: "I'm buying / flipping an aircraft",
    subtitle: "Model acquisition, upgrades, carrying costs, and exit profit.",
  },
  {
    mode: "sell",
    emoji: "📣",
    title: "I'm selling an aircraft",
    subtitle: "Market positioning and comps (seller tools expanding soon).",
  },
  {
    mode: "research",
    emoji: "🔎",
    title: "Just researching the market",
    subtitle: "Build a profile and explore how deals are structured.",
  },
]

export default function StepEntry({ onUpdate, onNext }: StepProps) {
  const pick = (mode: DealMode) => {
    onUpdate({ mode })
    onNext()
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <p className="text-sm text-[var(--fh-text-dim)]">How can we help you today?</p>
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          onClick={() => pick(o.mode)}
          className="w-full rounded-[14px] border-2 border-transparent bg-[#161b22] p-5 text-left transition hover:border-[#FF9900]/40 [data-theme=light]:bg-slate-100"
          style={barlow}
        >
          <div className="flex items-start gap-4">
            <span className="text-3xl" aria-hidden>
              {o.emoji}
            </span>
            <div>
              <div className="text-lg font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900">{o.title}</div>
              <div className="mt-1 text-sm font-normal text-[var(--fh-text-dim)]">{o.subtitle}</div>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
