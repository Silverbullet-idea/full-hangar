import Link from "next/link"

export default function HomeFinalCta() {
  return (
    <section className="mt-14 rounded-2xl border border-[#3A4454] bg-[linear-gradient(165deg,#121923_0%,#101722_100%)] p-6 md:p-9">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-extrabold leading-tight text-white md:text-4xl">Ready to find your next aircraft deal?</h2>
          <p className="mt-3 text-sm text-brand-muted">Start with live listings and move faster with clear score context.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/listings"
            className="rounded-md bg-[#FF9900] px-5 py-2.5 text-sm font-extrabold !text-black shadow-[0_8px_18px_rgba(255,153,0,0.35)] transition hover:-translate-y-0.5 hover:bg-[#AF4D27] hover:!text-white"
          >
            Explore Listings
          </Link>
          <Link
            href="/internal/login"
            className="rounded-md border border-[#3A4454] bg-[#161f2d] px-5 py-2.5 text-sm font-semibold !text-[#d7deea] transition hover:border-[#FF9900] hover:!text-[#FF9900]"
          >
            Internal Deal Dashboard
          </Link>
        </div>
      </div>
      <footer className="mt-6 border-t border-[#2B3444] pt-4 text-xs text-brand-muted">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} Full Hangar</span>
          <div className="flex items-center gap-4">
            <Link href="/listings" className="hover:text-[#FF9900]">
              Browse Aircraft
            </Link>
            <Link href="/internal/login" className="hover:text-[#FF9900]">
              Internal Access
            </Link>
          </div>
        </div>
      </footer>
    </section>
  )
}
