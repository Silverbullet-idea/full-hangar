"use client"

import Link from "next/link"

type Row = {
  id: string
  label: string
  listing_id: string
  updated_at: string | null
}

export default function ScenariosListClient({ initialScenarios }: { initialScenarios: Row[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/account" className="text-sm text-[var(--fh-orange)] no-underline hover:underline">
        ← Account home
      </Link>
      <h1
        className="mt-4 text-2xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900"
        style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}
      >
        Deal scenarios
      </h1>
      <p className="mt-2 text-sm text-[var(--fh-text-dim)]">Saved from Deal Coach (flip P&amp;L desk).</p>

      {initialScenarios.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--fh-text-dim)]">
          None yet.{" "}
          <Link href="/deal-coach" className="font-semibold text-[var(--fh-orange)] no-underline">
            Open Deal Coach →
          </Link>
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {initialScenarios.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] px-4 py-3 [data-theme=light]:bg-white"
            >
              <div className="font-medium text-[var(--fh-text)] [data-theme=light]:text-slate-900">{s.label}</div>
              <div className="text-xs text-[var(--fh-text-dim)]">
                {s.listing_id
                  ? `Listing ${s.listing_id.length > 14 ? `${s.listing_id.slice(0, 12)}…` : s.listing_id}`
                  : "No listing linked"}
                {s.updated_at
                  ? ` · Updated ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(s.updated_at))}`
                  : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
