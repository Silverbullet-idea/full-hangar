"use client"

import { useCallback, useState } from "react"

type Props = {
  keywords: string[]
}

export default function KeywordChips({ keywords }: Props) {
  const [copied, setCopied] = useState(false)

  const copyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(keywords.join(", "))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }, [keywords])

  return (
    <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Keywords buyers search for</p>
        <button
          type="button"
          onClick={copyAll}
          className="rounded-lg border border-[var(--fh-border)] px-2 py-1 text-xs font-bold text-[#FF9900] hover:bg-[#FF9900]/10"
        >
          {copied ? "Copied" : "Copy all"}
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--fh-text-dim)]">Include these phrases in your listing title and body.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {keywords.map((k) => (
          <span
            key={k}
            className="keyword-chip-print rounded-full border border-[var(--fh-border)] bg-[#0d1117] px-3 py-1 text-xs text-[var(--fh-text)] [data-theme=light]:bg-slate-100 [data-theme=light]:text-slate-800"
          >
            {k}
          </span>
        ))}
      </div>
    </div>
  )
}
