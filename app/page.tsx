import Link from "next/link"
import CarfaxBanner from "./components/home/CarfaxBanner"
import DealPatterns from "./components/home/DealPatterns"
import HomeFinalCta from "./components/home/HomeFinalCta"
import HomeHeroSection from "./components/home/HomeHeroSection"
import HomeScoreBreakdown from "./components/home/HomeScoreBreakdown"
import HomeSocialProofFaq from "./components/home/HomeSocialProofFaq"
import HomeStatsBar from "./components/home/HomeStatsBar"
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
              href="/listings?dealTier=TOP_DEALS&sortBy=flip_desc"
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
        <DealPatterns />
      </div>
      <div className="home-reveal home-r6">
        <HomeScoreBreakdown />
      </div>
      <div className="home-reveal home-r7">
        <HomeSocialProofFaq />
      </div>
      <div className="home-reveal home-r8">
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

        /* Homepage surfaces — dark defaults (match prior hardcoded navy/slate) */
        .home-deal-card {
          background-color: #161f2d;
          border-color: #2b3444;
        }
        .home-deal-card h3 {
          color: #ffffff;
        }
        .home-deal-card p.body-text {
          color: #9aa4b2;
        }
        .home-deal-example-tag {
          background-color: rgba(255, 153, 0, 0.1);
          border: 1px solid rgba(255, 153, 0, 0.15);
          color: #ff9900;
        }

        .home-score-card {
          --ring-track: #2b3444;
          background-color: #1a2538;
          border-color: #2b3444;
        }
        .home-score-card-text-primary {
          color: #ffffff;
        }
        .home-score-card-text-muted {
          color: #9aa4b2;
        }
        .home-score-card-bar-track {
          background-color: #2b3444;
        }
        .home-score-card-ring-bg {
          background-color: #1a2538;
        }
        .home-score-card-section-divider {
          border-top-color: #2b3444;
        }

        .home-pillar-track {
          background-color: var(--color-brand-dark);
        }

        .home-confidence-box {
          background-color: #161f2d;
          border-color: #2b3444;
        }
        .home-confidence-box h3 {
          color: #ffffff;
        }
        .home-confidence-box p {
          color: #9aa4b2;
        }

        .home-faq-item {
          background-color: #161f2d;
        }

        [data-theme="light"] .home-deal-card {
          background-color: #f1f5f9;
          border-color: #cbd5e1;
        }
        [data-theme="light"] .home-deal-card h3 {
          color: #0f172a;
        }
        [data-theme="light"] .home-deal-card p.body-text {
          color: #475569;
        }
        [data-theme="light"] .home-deal-example-tag {
          background-color: rgba(255, 153, 0, 0.08);
          border-color: rgba(255, 153, 0, 0.25);
          color: #92400e;
        }

        [data-theme="light"] .home-score-card {
          --ring-track: #cbd5e1;
          background-color: #e2e8f0;
          border-color: #cbd5e1;
        }
        [data-theme="light"] .home-score-card-text-primary {
          color: #0f172a;
        }
        [data-theme="light"] .home-score-card-text-muted {
          color: #475569;
        }
        [data-theme="light"] .home-score-card-bar-track {
          background-color: #cbd5e1;
        }
        [data-theme="light"] .home-score-card-ring-bg {
          background-color: #e2e8f0;
        }
        [data-theme="light"] .home-score-card-section-divider {
          border-top-color: #cbd5e1;
        }

        [data-theme="light"] .home-score-breakdown {
          background-color: #f8fafc;
          border-color: #e2e8f0;
        }

        [data-theme="light"] .home-pillar-track {
          background-color: #e2e8f0;
        }

        [data-theme="light"] .home-carfax-banner {
          background-color: #f1f5f9;
          border-color: #e2e8f0;
        }

        [data-theme="light"] .home-faq-item {
          background-color: #f1f5f9;
          border-color: #e2e8f0;
        }

        [data-theme="light"] .home-confidence-box {
          background-color: #f1f5f9;
          border-color: #cbd5e1;
        }
        [data-theme="light"] .home-confidence-box h3 {
          color: #0f172a;
        }
        [data-theme="light"] .home-confidence-box p {
          color: #475569;
        }
      `}</style>
    </main>
  )
}

function buildHomeCategoryHref(category: (typeof CATEGORIES)[number]["value"]) {
  if (!category) return "/listings"
  return `/listings?category=${encodeURIComponent(category)}`
}
