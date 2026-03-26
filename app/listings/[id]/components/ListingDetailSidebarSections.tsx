import type { ReactNode } from "react"
import DetailSectionCard, { DetailBadge } from "./DetailSectionCard"

type VerificationFlag = {
  level: "info" | "warning" | "danger"
  text: string
}

type ListingDetailSidebarSectionsProps = {
  faaVerified: boolean
  faaCompactRows: Array<[string, ReactNode]>
  faaLookupUrl: string | null
  verificationFlags: VerificationFlag[]
  faaFullTable: ReactNode
  sellerBadge: "Dealer listing" | "Private / broker"
  sellerHeadline: string
  sellerLocation: string | null
  sourceUrl: string | null
  sourceLinkLabel: string
  scoreExplanation: string[]
  renderScoreExplanationItem: (value: string) => string
}

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const
const mono = { fontFamily: "var(--font-dm-mono), ui-monospace, monospace" } as const

function signalTone(text: string): "ok" | "warn" {
  const t = text.toLowerCase()
  if (
    t.includes("missing") ||
    t.includes("no ") ||
    t.includes("unable") ||
    t.includes("weak") ||
    t.includes("high risk") ||
    t.includes("caution") ||
    t.includes("alert")
  )
    return "warn"
  return "ok"
}

export default function ListingDetailSidebarSections(props: ListingDetailSidebarSectionsProps) {
  return (
    <div className="flex flex-col gap-4">
      <DetailSectionCard
        title="FAA Registry"
        badges={<DetailBadge tone={props.faaVerified ? "green" : "amber"}>{props.faaVerified ? "VERIFIED" : "UNVERIFIED"}</DetailBadge>}
      >
        {props.verificationFlags.length > 0 ? (
          <div className="mb-3 flex flex-col gap-2">
            {props.verificationFlags.map((flag, index) => (
              <div
                key={`${flag.text}-${index}`}
                className={`rounded-md border px-2.5 py-1.5 text-[11px] leading-snug ${
                  flag.level === "danger"
                    ? "border-[var(--fh-red)]/40 bg-[var(--fh-red-dim)] text-[var(--fh-red)]"
                    : flag.level === "warning"
                      ? "border-[var(--fh-amber)]/40 bg-[var(--fh-amber-dim)] text-[var(--fh-amber)]"
                      : "border-[var(--fh-border)] bg-[var(--fh-bg3)] text-[var(--fh-text-dim)]"
                }`}
              >
                {flag.text}
              </div>
            ))}
          </div>
        ) : null}
        <dl className="m-0 grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
          {props.faaCompactRows.map(([label, value]) => (
            <div key={label} className={label === "Registered Owner" ? "sm:col-span-2" : ""}>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--fh-text-muted)]">{label}</dt>
              <dd className="mt-0.5 text-[12px] text-[var(--fh-text-dim)] [data-theme=light]:text-slate-700" style={mono}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {props.faaLookupUrl ? (
          <p className="mb-0 mt-3">
            <a
              className="text-xs font-semibold text-[var(--fh-orange)] underline"
              href={props.faaLookupUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open FAA Registry →
            </a>
          </p>
        ) : null}
        <details className="mt-3 rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg3)] p-2 [data-theme=light]:border-slate-200 [data-theme=light]:bg-slate-50">
          <summary className="cursor-pointer text-xs font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-800">
            Full FAA snapshot
          </summary>
          <div className="mt-2">{props.faaFullTable}</div>
        </details>
      </DetailSectionCard>

      <DetailSectionCard title="Seller & Source">
        <div className="mb-2">
          <DetailBadge tone="blue">{props.sellerBadge}</DetailBadge>
        </div>
        <p className="m-0 text-sm font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">{props.sellerHeadline}</p>
        {props.sellerLocation ? (
          <p className="mb-0 mt-1 text-xs text-[var(--fh-text-muted)]">{props.sellerLocation}</p>
        ) : null}
        {props.sourceUrl ? (
          <a
            href={props.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-lg border border-[var(--fh-border-orange)] bg-[var(--fh-orange-dim)] px-3 py-2 text-sm font-bold text-[var(--fh-orange)] transition hover:bg-[var(--fh-orange)] hover:!text-white"
            style={barlow}
          >
            {props.sourceLinkLabel} →
          </a>
        ) : null}
      </DetailSectionCard>

      <DetailSectionCard title="Flip score drivers">
        {props.scoreExplanation.length === 0 ? (
          <p className="m-0 text-xs text-[var(--fh-text-muted)]">No narrative drivers for this flip score yet.</p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {props.scoreExplanation.slice(0, 12).map((item) => {
              const rendered = props.renderScoreExplanationItem(item)
              const tone = signalTone(rendered)
              return (
                <li
                  key={item}
                  className={`rounded-lg px-2.5 py-2 text-[12px] leading-snug ${
                    tone === "warn"
                      ? "border border-[var(--fh-amber)]/30 bg-[var(--fh-amber-dim)] text-[var(--fh-text)] [data-theme=light]:text-slate-800"
                      : "border border-[rgba(34,197,94,0.2)] bg-[var(--fh-green-dim)] text-[var(--fh-text)] [data-theme=light]:text-slate-800"
                  }`}
                >
                  {tone === "ok" ? "✓ " : "⚠ "}
                  {rendered}
                </li>
              )
            })}
          </ul>
        )}
      </DetailSectionCard>
    </div>
  )
}
