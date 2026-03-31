"use client"

import type { PriceStep } from "@/lib/sellIntel/types"

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

type Props = {
  steps: PriceStep[]
}

export default function PriceReductionTimeline({ steps }: Props) {
  return (
    <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-white">
      <p className="text-sm font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Price reduction plan</p>
      <div className="relative mt-6 pl-2">
        <div className="absolute bottom-2 left-[19px] top-2 w-px bg-[var(--fh-border)]" aria-hidden />
        <ul className="space-y-6">
          {steps.map((step, i) => (
            <li key={`${step.dayThreshold}-${i}`} className="timeline-print-row relative flex gap-4">
              <div className="timeline-day-badge relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#FF9900] bg-[#0d1117] text-xs font-black text-[#FF9900] [data-theme=light]:bg-white">
                {step.dayThreshold}
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <p className="text-[10px] font-bold uppercase text-[var(--fh-text-dim)]">Day {step.dayThreshold}</p>
                <p className="text-sm text-[var(--fh-text)] [data-theme=light]:text-slate-900">{step.action}</p>
                {step.targetPrice != null ? (
                  <p className="mt-1 font-mono text-sm font-bold text-[#FF9900]">Target {fmtMoney(step.targetPrice)}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
