"use client"

type Props = {
  shots: string[]
}

export default function PhotoGuide({ shots }: Props) {
  return (
    <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-white">
      <p className="text-sm font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Photo checklist</p>
      <ol className="mt-3 space-y-3">
        {shots.map((line, i) => (
          <li key={line} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF9900]/20 font-mono text-sm font-bold text-[#FF9900]">
              {i + 1}
            </span>
            <span className="text-sm text-[var(--fh-text)] [data-theme=light]:text-slate-900">{line}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs italic text-[var(--fh-text-dim)]">
        Pro tip: 12+ photos sell aircraft 2× faster than listings with fewer than 6.
      </p>
    </div>
  )
}
