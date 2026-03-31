import Link from "next/link"
import { HomeIntentPillRow } from "./HomeIntentPills"

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

export default function HomeFinalCta() {
  return (
    <section className="mt-14 rounded-2xl border border-brand-dark bg-[linear-gradient(165deg,#121923_0%,#101722_100%)] p-6 md:p-9">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-extrabold leading-tight text-[#ffffff] md:text-4xl" style={barlow}>
          Start with the listing — or with your aircraft.
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
          Browse scored inventory, or walk through Deal Coach to model a buy, a flip, or a sale. Same engine underneath: real
          comps and transparent signals.
        </p>
        <div className="mx-auto mt-8 max-w-xl">
          <HomeIntentPillRow size="footer" />
        </div>
        <p className="mt-6 text-xs text-white/45">
          <Link href="/internal/login" className="underline hover:text-[#FF9900]">
            Internal dashboard
          </Link>
          {" · "}
          <Link href="/account/signup" className="underline hover:text-[#FF9900]">
            Create account
          </Link>
        </p>
      </div>
      <footer className="mx-auto mt-8 max-w-6xl border-t border-brand-dark pt-4 text-xs text-brand-muted">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <span>© {new Date().getFullYear()} Full Hangar</span>
          <span className="hidden sm:inline" aria-hidden>
            ·
          </span>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/listings" className="hover:text-brand-orange">
              Listings
            </Link>
            <Link href="/deal-coach" className="hover:text-brand-orange">
              Deal Coach
            </Link>
            <Link href="/internal/login" className="hover:text-brand-orange">
              Internal access
            </Link>
          </div>
        </div>
      </footer>
    </section>
  )
}
