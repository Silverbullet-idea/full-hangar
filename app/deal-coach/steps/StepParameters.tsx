"use client"

import { useEffect, useMemo, useState } from "react"
import type { FinanceType } from "../types"
import DrumWheel from "../components/DrumWheel"
import type { StepProps } from "./types"

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

function rangeMoney(min: number, max: number, step: number): string[] {
  const out: string[] = []
  for (let n = min; n <= max; n += step) {
    out.push(
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
    )
  }
  return out
}

function parseMoneyLabel(s: string): number {
  const n = Number(String(s).replace(/[^0-9]/g, ""))
  return Number.isFinite(n) ? n : 0
}

function monthLabels(): string[] {
  const out: string[] = []
  for (let m = 1; m <= 24; m += 1) out.push(`${m} mo`)
  return out
}

function parseMonth(s: string): number {
  const m = parseInt(String(s).replace(/\D/g, ""), 10)
  return Number.isFinite(m) ? Math.min(24, Math.max(1, m)) : 6
}

export default function StepParameters({ answers, onUpdate, onNext }: StepProps) {
  const ask = answers.aircraft?.askingPrice ?? 45000
  const [coarse, setCoarse] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)")
    setCoarse(mq.matches)
    const fn = () => setCoarse(mq.matches)
    mq.addEventListener("change", fn)
    return () => mq.removeEventListener("change", fn)
  }, [])

  const offerLabels = useMemo(() => rangeMoney(25000, 75000, 500), [])
  const exitLabels = useMemo(() => rangeMoney(28000, 80000, 500), [])
  const holdLabels = useMemo(() => monthLabels(), [])

  const offerIdx = useMemo(() => {
    const target = answers.offerPrice ?? Math.round(ask * 0.92)
    let best = 0
    let bestDiff = Infinity
    offerLabels.forEach((lab, i) => {
      const v = parseMoneyLabel(lab)
      const d = Math.abs(v - target)
      if (d < bestDiff) {
        bestDiff = d
        best = i
      }
    })
    return best
  }, [answers.offerPrice, ask, offerLabels])

  const holdIdx = useMemo(() => {
    const h = answers.holdMonths ?? 6
    return Math.min(23, Math.max(0, h - 1))
  }, [answers.holdMonths])

  const exitIdx = useMemo(() => {
    const target = answers.exitTarget ?? Math.round(ask * 1.06)
    let best = 0
    let bestDiff = Infinity
    exitLabels.forEach((lab, i) => {
      const v = parseMoneyLabel(lab)
      const d = Math.abs(v - target)
      if (d < bestDiff) {
        bestDiff = d
        best = i
      }
    })
    return best
  }, [answers.exitTarget, ask, exitLabels])

  const [offerFb, setOfferFb] = useState("")

  const finance: FinanceType = answers.financeType ?? "cash"

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="text-sm text-[var(--fh-text-dim)]">Dial in your deal assumptions.</p>

      {coarse ? (
        <div className="grid gap-6 sm:grid-cols-3">
          <DrumWheel
            label="Offer price"
            items={offerLabels}
            defaultIndex={offerIdx}
            onChange={(v) => onUpdate({ offerPrice: parseMoneyLabel(v) })}
          />
          <DrumWheel
            label="Hold period"
            items={holdLabels}
            defaultIndex={holdIdx}
            onChange={(v) => onUpdate({ holdMonths: parseMonth(v) })}
          />
          <DrumWheel
            label="Exit target"
            items={exitLabels}
            defaultIndex={exitIdx}
            onChange={(v) => onUpdate({ exitTarget: parseMoneyLabel(v) })}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--fh-text-dim)]">
            Offer price
            <input
              type="number"
              className="rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 font-mono text-sm [data-theme=light]:bg-white"
              style={{ fontFamily: "var(--font-dm-mono), monospace" }}
              defaultValue={answers.offerPrice ?? Math.round(ask * 0.92)}
              onBlur={(e) => {
                const v = Number(e.target.value) || 0
                onUpdate({ offerPrice: v })
                const ap = ask
                if (ap > 0) {
                  const pct = ((ap - v) / ap) * 100
                  if (v < ap) setOfferFb(`${pct.toFixed(1)}% below ask — negotiating room`)
                  else if (v > ap) setOfferFb("Offer above ask — confirm comps and motivation")
                  else setOfferFb("")
                } else setOfferFb("")
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--fh-text-dim)]">
            Hold (months)
            <input
              type="number"
              min={1}
              max={24}
              className="rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 font-mono text-sm [data-theme=light]:bg-white"
              style={{ fontFamily: "var(--font-dm-mono), monospace" }}
              defaultValue={answers.holdMonths ?? 6}
              onBlur={(e) => onUpdate({ holdMonths: Math.min(24, Math.max(1, Number(e.target.value) || 6)) })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--fh-text-dim)]">
            Exit target
            <input
              type="number"
              className="rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 font-mono text-sm [data-theme=light]:bg-white"
              style={{ fontFamily: "var(--font-dm-mono), monospace" }}
              defaultValue={answers.exitTarget ?? Math.round(ask * 1.06)}
              onBlur={(e) => onUpdate({ exitTarget: Number(e.target.value) || 0 })}
            />
          </label>
        </div>
      )}

      {!coarse && offerFb ? <p className="text-xs text-[var(--fh-text-dim)]">{offerFb}</p> : null}

      <div>
        <p className="mb-2 text-xs font-semibold text-[var(--fh-text-dim)]">Financing</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["cash", "All cash"],
              ["finance50", "Finance 50%"],
              ["finance80", "Finance 80%"],
            ] as const
          ).map(([k, lab]) => (
            <button
              key={k}
              type="button"
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                finance === k ? "border-[#FF9900] bg-[#FF9900]/15" : "border-[var(--fh-border)]"
              }`}
              onClick={() => onUpdate({ financeType: k })}
            >
              {lab}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-lg bg-[#FF9900] py-3 text-sm font-extrabold text-black"
        style={barlow}
      >
        Build my Deal Desk →
      </button>
    </div>
  )
}
