"use client"

import { useEffect, useMemo, useState } from "react"
import DrumWheel from "../components/DrumWheel"
import type { SellGoal } from "../types"
import type { StepProps } from "./types"

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

const TIMELINE_OPTIONS = ["ASAP", "2 weeks", "30 days", "45 days", "60 days", "90 days", "6 months", "No rush"] as const

function rangeMoneyLabels(min: number, max: number, step: number): string[] {
  const out: string[] = []
  for (let n = min; n <= max; n += step) {
    out.push(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n))
  }
  return out
}

function parseMoneyLabel(s: string): number {
  const n = Number(String(s).replace(/[^0-9]/g, ""))
  return Number.isFinite(n) ? n : 0
}

export default function StepSellGoals({ answers, onUpdate, onNext }: StepProps) {
  const [coarse, setCoarse] = useState(false)
  const [goal, setGoal] = useState<SellGoal | null>(answers.sellGoal ?? null)
  const [hasLoan, setHasLoan] = useState<boolean | null>(answers.sellHasLoan ?? null)
  const [loanBalance, setLoanBalance] = useState(answers.sellLoanBalance != null ? String(answers.sellLoanBalance) : "")
  const [timeline, setTimeline] = useState(answers.sellTimeline ?? "30 days")
  const [targetPrice, setTargetPrice] = useState(() => answers.sellTargetPrice ?? answers.aircraft?.askingPrice ?? 54_000)

  const priceLabels = useMemo(() => rangeMoneyLabels(20_000, 180_000, 500), [])

  const priceIdx = useMemo(() => {
    let best = 0
    let bestDiff = Infinity
    priceLabels.forEach((lab, i) => {
      const v = parseMoneyLabel(lab)
      const d = Math.abs(v - targetPrice)
      if (d < bestDiff) {
        bestDiff = d
        best = i
      }
    })
    return best
  }, [targetPrice, priceLabels])

  const timelineIdx = useMemo(() => {
    const i = TIMELINE_OPTIONS.indexOf(timeline as (typeof TIMELINE_OPTIONS)[number])
    return i >= 0 ? i : 2
  }, [timeline])

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)")
    setCoarse(mq.matches)
    const fn = () => setCoarse(mq.matches)
    mq.addEventListener("change", fn)
    return () => mq.removeEventListener("change", fn)
  }, [])

  const nudge =
    goal === "top_dollar" ? (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100 [data-theme=light]:text-emerald-950">
        Premium strategy: list 8% above median, hold firm 30 days. Budget 60–90 days. Strong photos and pre-buy-ready logbooks justify the premium.
      </div>
    ) : goal === "sell_30" ? (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100 [data-theme=light]:text-amber-950">
        Fast-sale strategy: price at or 3% below median. Offer to contribute $300–500 toward the buyer&apos;s pre-buy inspection — removes the #1 buyer
        hesitation.
      </div>
    ) : goal === "balance" ? (
      <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 text-sm text-[var(--fh-text)] [data-theme=light]:bg-slate-100 [data-theme=light]:text-slate-900">
        Balanced approach: list at median, &quot;firm for 30 days.&quot; Reduce 5% if no offers. Highest expected value for most sellers.
      </div>
    ) : null

  const submit = () => {
    if (!goal) return
    const bal = hasLoan ? Math.max(0, Number(loanBalance) || 0) : undefined
    onUpdate({
      sellGoal: goal,
      sellTargetPrice: targetPrice,
      sellTimeline: timeline,
      sellHasLoan: hasLoan === true,
      ...(hasLoan === true && bal !== undefined ? { sellLoanBalance: bal } : { sellLoanBalance: undefined }),
    })
    onNext()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900" style={barlow}>
        What matters most to you?
      </h2>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => setGoal("top_dollar")}
          className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${
            goal === "top_dollar"
              ? "border-emerald-500 bg-emerald-500/15 text-emerald-200 [data-theme=light]:text-emerald-900"
              : "border-[var(--fh-border)] text-[var(--fh-text)] hover:border-[#FF9900]/50 [data-theme=light]:text-slate-900"
          }`}
        >
          Get top dollar
        </button>
        <button
          type="button"
          onClick={() => setGoal("sell_30")}
          className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${
            goal === "sell_30"
              ? "border-amber-500 bg-amber-500/15 text-amber-200 [data-theme=light]:text-amber-900"
              : "border-[var(--fh-border)] text-[var(--fh-text)] hover:border-[#FF9900]/50 [data-theme=light]:text-slate-900"
          }`}
        >
          Sell in 30 days
        </button>
        <button
          type="button"
          onClick={() => setGoal("balance")}
          className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${
            goal === "balance"
              ? "border-[#FF9900] bg-[#FF9900]/10 text-[var(--fh-text)] [data-theme=light]:text-slate-900"
              : "border-[var(--fh-border)] text-[var(--fh-text)] hover:border-[#FF9900]/50 [data-theme=light]:text-slate-900"
          }`}
        >
          Balance speed + price
        </button>
      </div>

      {nudge}

      {coarse ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <DrumWheel label="Target price" items={priceLabels} defaultIndex={priceIdx} onChange={(v) => setTargetPrice(parseMoneyLabel(v))} />
          <DrumWheel
            label="Timeline"
            items={[...TIMELINE_OPTIONS]}
            defaultIndex={timelineIdx}
            onChange={(v) => setTimeline(v)}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--fh-text-dim)]">
            Target price
            <input
              type="number"
              min={20_000}
              max={180_000}
              step={500}
              value={targetPrice}
              onChange={(e) => setTargetPrice(Number(e.target.value) || 0)}
              className="rounded-lg border border-[var(--fh-border)] bg-[#161b22] px-3 py-2 font-mono text-sm text-[var(--fh-text)] [data-theme=light]:bg-white [data-theme=light]:text-slate-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--fh-text-dim)]">
            Timeline
            <select
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
              className="rounded-lg border border-[var(--fh-border)] bg-[#161b22] px-3 py-2 text-sm text-[var(--fh-text)] [data-theme=light]:bg-white [data-theme=light]:text-slate-900"
            >
              {TIMELINE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="space-y-3 border-t border-[var(--fh-border)] pt-6">
        <p className="text-sm font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Do you have a loan on this aircraft?</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setHasLoan(false)}
            className={`rounded-xl border px-4 py-2 text-sm font-bold ${
              hasLoan === false ? "border-[#FF9900] bg-[#FF9900]/10" : "border-[var(--fh-border)]"
            }`}
          >
            No — owned free and clear
          </button>
          <button
            type="button"
            onClick={() => setHasLoan(true)}
            className={`rounded-xl border px-4 py-2 text-sm font-bold ${
              hasLoan === true ? "border-[#FF9900] bg-[#FF9900]/10" : "border-[var(--fh-border)]"
            }`}
          >
            Yes — have a loan balance
          </button>
        </div>
        {hasLoan === true ? (
          <label className="flex max-w-xs flex-col gap-1 text-xs font-semibold text-[var(--fh-text-dim)]">
            Loan balance (USD)
            <input
              type="text"
              inputMode="numeric"
              value={loanBalance}
              onChange={(e) => setLoanBalance(e.target.value)}
              className="rounded-lg border border-[var(--fh-border)] bg-[#161b22] px-3 py-2 font-mono text-sm [data-theme=light]:bg-white"
            />
          </label>
        ) : null}
      </div>

      <button
        type="button"
        disabled={!goal}
        onClick={submit}
        className="w-full rounded-xl bg-[#FF9900] py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
      >
        Build my sell strategy →
      </button>
    </div>
  )
}
