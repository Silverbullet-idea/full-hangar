"use client"

export default function SeasonalHint() {
  const m = new Date().getMonth()
  let text: string
  if (m >= 2 && m <= 4) text = "Spring is peak buying season for GA aircraft. List now."
  else if (m >= 5 && m <= 7) text = "Strong buyer activity. Good time to list."
  else if (m >= 8 && m <= 10) text = "Activity slows heading into winter. Price competitively."
  else text = "Slower season. Serious buyers still active but fewer of them. Consider waiting until March if not urgent."

  return (
    <div className="rounded-xl border border-[#FF9900]/30 bg-[#FF9900]/5 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[#FF9900]">Seasonal signal</p>
      <p className="mt-1 text-sm text-[var(--fh-text)] [data-theme=light]:text-slate-900">{text}</p>
    </div>
  )
}
