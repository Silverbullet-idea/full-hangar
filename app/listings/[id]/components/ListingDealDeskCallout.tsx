import Link from "next/link"

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

type ListingDealDeskCalloutProps = {
  dealDeskHref: string
  aircraftLabel: string
  dealCoachHref?: string
}

export default function ListingDealDeskCallout({
  dealDeskHref,
  aircraftLabel,
  dealCoachHref,
}: ListingDealDeskCalloutProps) {
  return (
    <div
      className="rounded-xl border border-[var(--fh-border-orange)] p-[18px]"
      style={{
        background: "linear-gradient(135deg, rgba(175, 77, 39, 0.2), rgba(255, 153, 0, 0.1))",
      }}
    >
      <h3 className="m-0 text-base font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900" style={barlow}>
        Deal Desk
      </h3>
      <p className="mb-3 mt-2 text-xs leading-relaxed text-[var(--fh-text-dim)]">
        Model flip economics, carrying costs, and exit sensitivity for{" "}
        <span className="font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-800">{aircraftLabel}</span>.
      </p>
      <Link
        href={dealDeskHref}
        className="fh-cta-on-orange-fill inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[var(--fh-orange)] px-4 py-2.5 text-sm font-extrabold transition hover:bg-[var(--fh-orange-burn)]"
        style={barlow}
      >
        Open Deal Desk
      </Link>
      {dealCoachHref ? (
        <Link
          href={dealCoachHref}
          className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border-2 border-[var(--fh-orange)] px-4 py-2.5 text-sm font-extrabold text-[var(--fh-orange)] transition hover:bg-[var(--fh-orange)]/10"
          style={barlow}
        >
          ✈ Analyze in Deal Coach
        </Link>
      ) : null}
    </div>
  )
}
