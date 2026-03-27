import Link from "next/link"
import HeroScoreCard from "./HeroScoreCard"
import SmoothScrollAnchor from "./SmoothScrollAnchor"

export default function HomeHeroSection() {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-[#2B3444] p-5 md:p-8"
      style={{ backgroundColor: "#121923" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,153,0,0.14),transparent_45%),radial-gradient(circle_at_80%_100%,rgba(175,77,39,0.2),transparent_40%)]" />
      <div className="relative grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#FF9900]/30 bg-[#FF9900]/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#FF9900]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ade80] opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4ade80]" />
            </span>
            Live · Aircraft market intelligence
          </div>
          <h1 className="text-3xl font-extrabold leading-[1.12] md:text-5xl" style={{ color: "#ffffff" }}>
            Stop guessing
            <br />
            what a plane is
            <br />
            <span style={{ color: "#FF9900" }}>really worth.</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed md:text-base" style={{ color: "#9AA4B2" }}>
            Full Hangar is the Carfax for aircraft — automatically surfacing deferred maintenance, engine life, avionics value,
            and true cost of ownership before you make an offer.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className="rounded-full border border-[#2B3444] px-2.5 py-1 text-xs"
              style={{ backgroundColor: "#162131", color: "#9AA4B2" }}
            >
              ✓ 10,574 listings tracked
            </span>
            <span
              className="rounded-full border border-[#2B3444] px-2.5 py-1 text-xs"
              style={{ backgroundColor: "#162131", color: "#9AA4B2" }}
            >
              ✓ FAA registry matched
            </span>
            <span
              className="rounded-full border border-[#2B3444] px-2.5 py-1 text-xs"
              style={{ backgroundColor: "#162131", color: "#9AA4B2" }}
            >
              ✓ Engine TBO scored
            </span>
            <span
              className="rounded-full border border-[#2B3444] px-2.5 py-1 text-xs"
              style={{ backgroundColor: "#162131", color: "#9AA4B2" }}
            >
              ✓ Avionics valued
            </span>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/listings?dealTier=TOP_DEALS"
              className="rounded-md bg-[#FF9900] px-4 py-2 text-sm font-bold !text-black transition hover:bg-[#AF4D27] hover:!text-white"
            >
              Browse Live Deals →
            </Link>
            <SmoothScrollAnchor
              href="#how-it-works"
              className="rounded-md border border-[#2B3444] px-4 py-2 text-sm font-semibold transition hover:border-brand-orange hover:text-brand-orange"
              style={{ backgroundColor: "#161f2d", color: "#d7deea" }}
            >
              See How It Works
            </SmoothScrollAnchor>
          </div>
        </div>
        <HeroScoreCard />
      </div>
    </section>
  )
}
