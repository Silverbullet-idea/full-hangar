"use client"

import type { PlatformRecommendation } from "@/lib/sellIntel/types"

type Props = {
  platforms: PlatformRecommendation[]
}

export default function PlatformList({ platforms }: Props) {
  const primary = platforms.filter((p) => p.priority === "PRIMARY")
  const secondary = platforms.filter((p) => p.priority === "SECONDARY")

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {primary.map((p) => (
          <div key={p.name} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-emerald-500/30 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-300 [data-theme=light]:text-emerald-900">
                Primary
              </span>
              <p className="text-lg font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900">{p.name}</p>
            </div>
            <p className="mt-2 text-sm text-[var(--fh-text-dim)]">{p.rationale}</p>
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex rounded-lg border border-[#FF9900] px-3 py-2 text-xs font-bold text-[#FF9900] hover:bg-[#FF9900]/10"
            >
              List here →
            </a>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {secondary.map((p) => (
          <div key={p.name} className="rounded-lg border border-[var(--fh-border)] bg-[#161b22]/80 p-3 [data-theme=light]:bg-slate-50">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-[var(--fh-text-dim)]">Secondary</span>
              <p className="font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">{p.name}</p>
            </div>
            <p className="mt-1 text-xs text-[var(--fh-text-dim)]">{p.rationale}</p>
            <a href={p.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-[#FF9900]">
              List here →
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
