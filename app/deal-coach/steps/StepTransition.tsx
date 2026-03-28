"use client"

import { useEffect, useRef, useState } from "react"
import type { StepProps } from "./types"

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

export default function StepTransition({ answers, onNext }: StepProps) {
  const [visible, setVisible] = useState(0)
  const finished = useRef(false)

  const offer = answers.offerPrice ?? 0
  const exit = answers.exitTarget ?? 0
  const hold = answers.holdMonths ?? 6
  const avionicsEst = answers.aircraft?.panelType === "Steam gauges" ? 6200 : 3500
  const monthlyBurn = 250 + 150 + 80
  const carryingEst = monthlyBurn * hold
  const fin =
    answers.financeType === "finance50"
      ? "Finance 50%"
      : answers.financeType === "finance80"
        ? "Finance 80%"
        : "All cash"

  const rows = [
    `Aircraft & asking — ${answers.aircraft?.make ?? ""} ${answers.aircraft?.model ?? ""} · ${typeof answers.aircraft?.askingPrice === "number" ? fmtMoney(answers.aircraft.askingPrice) : "Ask TBD"}`,
    `Offer price → ${fmtMoney(offer)}`,
    `Upgrades (avionics ROI) → ~${fmtMoney(avionicsEst)} est.`,
    `Carrying costs → ~${fmtMoney(carryingEst)} (${hold} mo × ${fmtMoney(monthlyBurn)}/mo est.)`,
    `Financing → ${fin}`,
    `Exit target → ${fmtMoney(exit)}`,
  ]

  useEffect(() => {
    const t0 = setTimeout(() => setVisible(1), 400)
    return () => clearTimeout(t0)
  }, [])

  useEffect(() => {
    if (visible === 0 || visible > rows.length) return
    if (visible === rows.length) {
      if (finished.current) return
      finished.current = true
      const t = setTimeout(() => onNext(), 600)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setVisible((v) => v + 1), 350)
    return () => clearTimeout(t)
  }, [visible, rows.length, onNext])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <div className="animate-pulse text-6xl" aria-hidden>
        ✈️
      </div>
      <h2 className="mt-6 text-2xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900" style={barlow}>
        Building your Deal Desk
      </h2>
      <p className="mt-2 max-w-md text-sm text-[var(--fh-text-dim)]">
        Pre-filling all sections with your answers and Full Hangar market data.
      </p>
      <ul className="mt-8 w-full max-w-lg space-y-2 text-left text-sm">
        {rows.map((r, i) => (
          <li
            key={i}
            className={`rounded-lg border border-[var(--fh-border)] bg-[#161b22] px-3 py-2 transition-opacity duration-300 [data-theme=light]:bg-white ${
              i < visible ? "opacity-100" : "opacity-0"
            }`}
          >
            {r}
          </li>
        ))}
      </ul>
    </div>
  )
}
