"use client"

import { useState } from "react"
import type { IntentType } from "../types"
import type { StepProps } from "./types"

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

const OPTIONS: { intent: IntentType; label: string; nudge: string }[] = [
  {
    intent: "flip",
    label: "Buy and flip",
    nudge:
      "Flip mode activated. Deal Desk will include carrying costs, upgrade ROI, and a sensitivity grid showing break-even scenarios.",
  },
  {
    intent: "personal",
    label: "Personal flying",
    nudge: "Personal use. Deal Desk will cover acquisition + ongoing operating costs.",
  },
  {
    intent: "training",
    label: "Flight training / rental",
    nudge: "Training ops. Deal Desk will factor 150-hr maintenance intervals and engine reserve.",
  },
  {
    intent: "business",
    label: "Business travel",
    nudge: "Business travel. Avionics specification and IFR capability drive most of the value model.",
  },
]

export default function StepIntent({ answers, onUpdate, onNext }: StepProps) {
  const [nudge, setNudge] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <p className="text-sm text-[var(--fh-text-dim)]">What is your primary goal?</p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.intent}
            type="button"
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${
              answers.intent === o.intent ? "border-[#FF9900] bg-[#FF9900]/15 text-[var(--fh-text)]" : "border-[var(--fh-border)]"
            }`}
            onClick={() => {
              onUpdate({ intent: o.intent })
              setNudge(o.nudge)
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      {nudge ? (
        <div className="rounded-lg border border-[var(--fh-border)] bg-[#161b22] p-4 text-sm text-[var(--fh-text)] [data-theme=light]:bg-slate-50">
          {nudge}
        </div>
      ) : null}
      <button
        type="button"
        disabled={!answers.intent}
        className="w-full rounded-lg bg-[#FF9900] py-3 text-sm font-extrabold text-black disabled:opacity-40"
        style={barlow}
        onClick={onNext}
      >
        Next →
      </button>
    </div>
  )
}
