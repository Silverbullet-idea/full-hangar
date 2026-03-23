import type { ReactNode } from "react"

type DetailSectionCardProps = {
  icon?: string
  title: string
  badges?: ReactNode
  children: ReactNode
  className?: string
}

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

export default function DetailSectionCard({ icon, title, badges, children, className = "" }: DetailSectionCardProps) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] [data-theme=light]:border-slate-200 [data-theme=light]:bg-white ${className}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--fh-border)] px-4 py-3.5 [data-theme=light]:border-slate-200">
        <h2
          className="m-0 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--fh-text-dim)] [data-theme=light]:text-slate-600"
          style={barlow}
        >
          {icon ? `${icon} ` : ""}
          {title}
        </h2>
        {badges ? <div className="flex flex-wrap items-center justify-end gap-1.5">{badges}</div> : null}
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  )
}

export function DetailBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "green" | "amber" | "blue" | "red" | "neutral"
}) {
  const map = {
    green: "bg-[var(--fh-green-dim)] text-[var(--fh-green)] border border-[rgba(34,197,94,0.25)]",
    amber: "bg-[var(--fh-amber-dim)] text-[var(--fh-amber)] border border-[rgba(245,158,11,0.25)]",
    blue: "bg-[var(--fh-blue-dim)] text-[var(--fh-blue)] border border-[rgba(59,130,246,0.25)]",
    red: "bg-[var(--fh-red-dim)] text-[var(--fh-red)] border border-[rgba(239,68,68,0.25)]",
    neutral: "bg-[var(--fh-bg3)] text-[var(--fh-text-dim)] border border-[var(--fh-border)] [data-theme=light]:bg-slate-100 [data-theme=light]:text-slate-600",
  } as const
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${map[tone]}`}
      style={{ fontFamily: "var(--font-dm-mono), ui-monospace, monospace" }}
    >
      {children}
    </span>
  )
}
