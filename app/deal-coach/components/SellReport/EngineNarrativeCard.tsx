"use client"

import { useCallback, useState } from "react"
import type { EngineNarrative } from "@/lib/sellIntel/types"

type Props = {
  engine: EngineNarrative
}

export default function EngineNarrativeCard({ engine }: Props) {
  const [copied, setCopied] = useState(false)
  const usedPct =
    typeof engine.smoh === "number" && typeof engine.tbo === "number" && engine.tbo > 0
      ? Math.max(0, Math.min(100, (engine.smoh / engine.tbo) * 100))
      : null
  const remainingPct = usedPct != null ? Math.max(0, 100 - usedPct) : null

  const barClass =
    usedPct != null ? (usedPct >= 85 ? "bg-red-400" : usedPct >= 50 ? "bg-amber-400" : "bg-[#FF9900]") : "bg-[var(--fh-text-dim)]"

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(engine.framing)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }, [engine.framing])

  return (
    <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-white">
      <p className="text-sm font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Engine story for buyers</p>
      {usedPct != null ? (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-[var(--fh-text-dim)]">
            <span>Life used</span>
            <span>
              {remainingPct != null ? `${remainingPct.toFixed(0)}% remaining` : ""}
            </span>
          </div>
          <div className="engine-life-bar-track flex h-2.5 w-full overflow-hidden rounded-full border border-[var(--fh-border)] bg-[#0d1117] [data-theme=light]:bg-slate-200">
            <div className={`engine-life-bar-used h-full ${barClass}`} style={{ width: `${usedPct}%` }} />
            <div className="engine-life-bar-remaining h-full flex-1 bg-emerald-500/50" />
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-xs font-bold uppercase text-[var(--fh-text-dim)]">Copy this to your listing:</p>
      <div className="mt-2 rounded-lg border border-[var(--fh-border)] bg-[#0d1117]/80 p-3 text-sm italic leading-relaxed text-[var(--fh-text)] [data-theme=light]:bg-slate-50 [data-theme=light]:text-slate-800">
        {engine.framing}
      </div>
      <button
        type="button"
        onClick={copy}
        className="mt-3 rounded-lg border border-[#FF9900] px-3 py-2 text-xs font-bold text-[#FF9900] hover:bg-[#FF9900]/10"
      >
        {copied ? "Copied" : "Copy to clipboard"}
      </button>
      <p className="mt-3 text-xs text-[var(--fh-text-dim)]">
        Buyer risk level: <span className="font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">{engine.buyerRiskLevel}</span>
        {engine.overhaulCostEstimate != null ? (
          <>
            {" "}
            · Overhaul estimate ~{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(engine.overhaulCostEstimate)}
          </>
        ) : null}
      </p>
    </div>
  )
}
