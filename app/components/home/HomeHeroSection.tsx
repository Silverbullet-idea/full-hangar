import { getFeaturedCessna172HeroCarousel } from "@/lib/home/featuredCessna172Hero"
import HeroExampleCarousel from "./HeroExampleCarousel"
import HeroScoreCard from "./HeroScoreCard"
import { HomeIntentPillRow } from "./HomeIntentPills"
import SmoothScrollAnchor from "./SmoothScrollAnchor"

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

export default async function HomeHeroSection() {
  const featured = await getFeaturedCessna172HeroCarousel()
  const carouselAria =
    featured.mode === "live"
      ? `Photo gallery: ${featured.listingTitle}, ${featured.slides.length} marketplace photos`
      : "Example Cessna-class aircraft photo gallery"

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-[#2B3444] p-5 md:p-8"
      style={{ backgroundColor: "#121923" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,153,0,0.1),transparent_45%),radial-gradient(circle_at_80%_100%,rgba(175,77,39,0.15),transparent_40%)]" />

      <div className="relative mx-auto max-w-4xl text-center">
        <div className="mb-4 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FF9900]/25 bg-[#FF9900]/8 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#FF9900]">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4ade80]" aria-hidden />
            Live market intelligence
          </div>
        </div>
        <h1
          className="text-3xl font-extrabold leading-[1.12] md:text-5xl"
          style={{ ...barlow, color: "#ffffff" }}
        >
          Clarity for buyers.
          <br />
          <span style={{ color: "#FF9900" }}>Confidence for sellers.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed md:text-base" style={{ color: "#9AA4B2" }}>
          Full Hangar aggregates aircraft listings, enriches them with registry and engine data where we can, and scores
          every row so you can triage fast — then go deeper in Deal Coach when you&apos;re serious about a deal or a sale.
        </p>
        <div className="mx-auto mt-4 flex max-w-xl flex-wrap justify-center gap-2">
          <span
            className="rounded-full border border-[#2B3444] px-2.5 py-1 text-xs"
            style={{ backgroundColor: "#162131", color: "#9AA4B2" }}
          >
            ✓ Thousands of live listings
          </span>
          <span
            className="rounded-full border border-[#2B3444] px-2.5 py-1 text-xs"
            style={{ backgroundColor: "#162131", color: "#9AA4B2" }}
          >
            ✓ FAA registry match paths
          </span>
          <span
            className="rounded-full border border-[#2B3444] px-2.5 py-1 text-xs"
            style={{ backgroundColor: "#162131", color: "#9AA4B2" }}
          >
            ✓ Engine TBO &amp; avionics signals
          </span>
        </div>

        <div className="mx-auto mt-6 max-w-2xl">
          <HomeIntentPillRow size="hero" />
        </div>
        <div className="mt-4 flex justify-center">
          <SmoothScrollAnchor
            href="#how-it-works"
            className="text-sm font-semibold text-[#9AA4B2] underline-offset-4 hover:text-brand-orange hover:underline"
          >
            How it works
          </SmoothScrollAnchor>
        </div>
      </div>

      <div className="relative mx-auto mt-10 grid max-w-6xl gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
        <HeroExampleCarousel slides={featured.slides} ariaLabel={carouselAria} />
        <HeroScoreCard score={featured.scoreCard} />
      </div>
    </section>
  )
}
