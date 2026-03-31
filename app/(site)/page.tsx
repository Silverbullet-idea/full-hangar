import CarfaxBanner from "../components/home/CarfaxBanner"
import DealPatterns from "../components/home/DealPatterns"
import HomeAudiencePaths from "../components/home/HomeAudiencePaths"
import HomeFinalCta from "../components/home/HomeFinalCta"
import HomeHeroSection from "../components/home/HomeHeroSection"
import HomeRoadmap from "../components/home/HomeRoadmap"
import HomeScoreBreakdown from "../components/home/HomeScoreBreakdown"
import HomeSocialProofFaq from "../components/home/HomeSocialProofFaq"
import HomeStatsBar from "../components/home/HomeStatsBar"
import HomeVisualStory from "../components/home/HomeVisualStory"
import MarketInfographics from "../components/home/MarketInfographics"
import TickerBar from "../components/home/TickerBar"

export default function HomePage() {
  return (
    <main className="home-page-wrap space-y-2">
      <TickerBar />

      <div className="home-reveal home-r1">
        <HomeHeroSection />
      </div>
      <div className="home-reveal home-r2">
        <HomeVisualStory />
      </div>
      <div className="home-reveal home-r3">
        <HomeAudiencePaths />
      </div>
      <div className="home-reveal home-r4">
        <HomeRoadmap />
      </div>
      <div className="home-reveal home-r5">
        <CarfaxBanner />
      </div>
      <div className="home-reveal home-r6">
        <HomeStatsBar />
      </div>
      <div className="home-reveal home-r7">
        <MarketInfographics />
      </div>
      <div className="home-reveal home-r8">
        <DealPatterns />
      </div>
      <div className="home-reveal home-r9">
        <HomeScoreBreakdown />
      </div>
      <div className="home-reveal home-r10">
        <HomeSocialProofFaq />
      </div>
      <div className="home-reveal home-r11">
        <HomeFinalCta />
      </div>

      <style>{`
        .home-page-wrap {
          padding-bottom: 0.8rem;
        }
        .home-reveal {
          opacity: 0;
          transform: translateY(12px);
          animation: homeFadeUp 480ms cubic-bezier(.2,.8,.2,1) forwards;
        }
        .home-r2 { animation-delay: 70ms; }
        .home-r3 { animation-delay: 130ms; }
        .home-r4 { animation-delay: 190ms; }
        .home-r5 { animation-delay: 250ms; }
        .home-r6 { animation-delay: 310ms; }
        .home-r7 { animation-delay: 370ms; }
        .home-r8 { animation-delay: 430ms; }
        .home-r9 { animation-delay: 490ms; }
        .home-r10 { animation-delay: 550ms; }
        .home-r11 { animation-delay: 610ms; }
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
