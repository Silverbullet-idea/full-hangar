import Link from "next/link"
import { HOME_INTENT, homeIntentPillClass } from "./HomeIntentPills"

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

export default function HomeAudiencePaths() {
  return (
    <section className="mt-14">
      <div className="mx-auto mb-10 max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted">Who it&apos;s for</p>
        <h2 className="mt-2 text-3xl font-extrabold leading-tight text-brand-white md:text-4xl" style={barlow}>
          Buyers, sellers, and researchers
        </h2>
        <p className="mt-3 text-sm text-brand-muted md:text-base">
          Whether you&apos;re hunting value, pricing a sale, or mapping the market — same underlying data: comps, condition
          signals, and upgrade context.
        </p>
      </div>
      <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
        <article className="flex flex-col items-center rounded-2xl border border-brand-dark bg-card-bg p-6 text-center md:p-7">
          <h3 className="text-xl font-bold text-brand-white" style={barlow}>
            Buyers &amp; flippers
          </h3>
          <p className="mt-2 text-sm text-brand-muted">
            Live listings with Flip Score, pillar breakdowns, and Deal Coach for acquisition math — today.
          </p>
          <ul className="mt-4 flex-1 space-y-2 text-sm text-brand-muted">
            <li>Rank and filter by deal tier, category, and geography</li>
            <li>Engine, avionics, and listing-quality signals on each row</li>
            <li>Model upgrades, holding cost, and exit in Deal Coach</li>
          </ul>
          <Link href={HOME_INTENT.buy.href} className={`${homeIntentPillClass("card")} mt-6 max-w-xs`}>
            {HOME_INTENT.buy.label}
          </Link>
        </article>

        <article className="flex flex-col items-center rounded-2xl border border-brand-dark bg-card-bg p-6 text-center md:p-7">
          <h3 className="text-xl font-bold text-brand-white" style={barlow}>
            Sellers
          </h3>
          <p className="mt-2 text-sm text-brand-muted">
            Sell path in Deal Coach: market position, upgrade ROI hints, and listing angles — powered by live comps where we
            have them.
          </p>
          <ul className="mt-4 flex-1 space-y-2 text-sm text-brand-muted">
            <li>Price vs. median and demand for your make/model band</li>
            <li>Honest data-quality notes when samples are thin</li>
            <li>
              Syndication to every marketplace is on the roadmap (
              <Link href="#roadmap" className="underline hover:text-brand-orange">
                see below
              </Link>
              )
            </li>
          </ul>
          <Link href={HOME_INTENT.sell.href} className={`${homeIntentPillClass("card")} mt-6 max-w-xs`}>
            {HOME_INTENT.sell.label}
          </Link>
        </article>

        <article className="flex flex-col items-center rounded-2xl border border-brand-dark bg-card-bg p-6 text-center md:p-7">
          <h3 className="text-xl font-bold text-brand-white" style={barlow}>
            Researchers
          </h3>
          <p className="mt-2 text-sm text-brand-muted">
            Explore how deals are structured before you commit. Deal Coach in research mode skips seller-specific steps and
            keeps the market lens wide.
          </p>
          <ul className="mt-4 flex-1 space-y-2 text-sm text-brand-muted">
            <li>Build a profile and walk the same comp stack as buyers</li>
            <li>Stress-test assumptions without implying a live offer</li>
            <li>Upgrade to buy or sell flows anytime</li>
          </ul>
          <Link href={HOME_INTENT.research.href} className={`${homeIntentPillClass("card")} mt-6 max-w-xs`}>
            {HOME_INTENT.research.label}
          </Link>
        </article>
      </div>
    </section>
  )
}
