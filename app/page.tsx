import Link from "next/link"
import CarfaxBanner from "./components/home/CarfaxBanner"
import DealPatterns from "./components/home/DealPatterns"
import HomeFinalCta from "./components/home/HomeFinalCta"
import HomeHeroSection from "./components/home/HomeHeroSection"
import HomeScoreBreakdown from "./components/home/HomeScoreBreakdown"
import HomeSocialProofFaq from "./components/home/HomeSocialProofFaq"
import HomeStatsBar from "./components/home/HomeStatsBar"
import HowItWorks from "./components/home/HowItWorks"
import MarketInfographics from "./components/home/MarketInfographics"
import TickerBar from "./components/home/TickerBar"
import { CATEGORIES } from "./listings/components/listingsClientUtils"

export default function HomePage() {
  return (
    <main className="space-y-2 home-page-wrap">
      <TickerBar />

      <section className="mb-2">
        <div className="w-full rounded-lg border border-brand-dark bg-card-bg p-1.5">
          <div
            className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-1 sm:grid-cols-3 lg:[grid-template-columns:repeat(var(--top-btn-count),minmax(0,1fr))]"
            style={{ ["--top-btn-count" as string]: CATEGORIES.length + 1 }}
          >
            {CATEGORIES.map((category) => (
              <Link
                key={category.label}
                href={buildHomeCategoryHref(category.value)}
                className="h-8 rounded-md border border-brand-dark bg-[#121822] px-2 py-2 text-center text-xs font-semibold text-brand-white transition-colors hover:border-brand-orange hover:text-brand-orange"
              >
                {category.label}
              </Link>
            ))}
            <Link
              href="/listings?dealTier=TOP_DEALS&sortBy=deal_desc"
              className="flex h-8 items-center justify-center rounded-md border border-[#166534] bg-[#166534] px-2 text-center text-xs font-bold text-white transition-colors hover:bg-[#15803d]"
            >
              Deals
            </Link>
          </div>
        </div>
      </section>

      <div className="home-reveal home-r1">
        <HomeHeroSection />
      </div>
      <div className="home-reveal home-r2">
        <CarfaxBanner />
      </div>
      <div className="home-reveal home-r3">
        <HomeStatsBar />
      </div>
      <div className="home-reveal home-r4">
        <MarketInfographics />
      </div>
      <div className="home-reveal home-r5">
        <HowItWorks />
      </div>
      <div className="home-reveal home-r6">
        <DealPatterns />
      </div>
      <div className="home-reveal home-r7">
        <HomeScoreBreakdown />
      </div>
      <div className="home-reveal home-r8">
        <HomeSocialProofFaq />
      </div>
      <div className="home-reveal home-r9">
        <HomeFinalCta />
      </div>

      <style>{`
        .home-page-wrap {
          padding-bottom: 0.8rem;
        }
        .home-reveal {
          opacity: 0;
          transform: translateY(14px);
          animation: homeFadeUp 560ms cubic-bezier(.2,.8,.2,1) forwards;
        }
        .home-r2 { animation-delay: 90ms; }
        .home-r3 { animation-delay: 160ms; }
        .home-r4 { animation-delay: 230ms; }
        .home-r5 { animation-delay: 300ms; }
        .home-r6 { animation-delay: 370ms; }
        .home-r7 { animation-delay: 440ms; }
        .home-r8 { animation-delay: 510ms; }
        .home-r9 { animation-delay: 580ms; }
        @keyframes homeFadeUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .home-reveal {
            opacity: 1;
            transform: none;
            animation: none;
          }
        }
      `}</style>
    </main>
  )
}

function buildHomeCategoryHref(category: (typeof CATEGORIES)[number]["value"]) {
  if (!category) return "/listings"
  return `/listings?category=${encodeURIComponent(category)}`
}
