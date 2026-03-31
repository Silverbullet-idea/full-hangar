import Link from "next/link"
import { redirect } from "next/navigation"
import { createSupabaseRscClient } from "@/lib/supabase/server"

export default async function WatchlistPage() {
  const supabase = await createSupabaseRscClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/account/login?returnTo=%2Faccount%2Fwatchlist")

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/account" className="text-sm text-[var(--fh-orange)] no-underline hover:underline">
        ← Account home
      </Link>
      <h1
        className="mt-4 text-2xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900"
        style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}
      >
        My watchlist
      </h1>
      <p className="mt-4 text-sm text-[var(--fh-text-dim)]">
        Watchlist sync is coming in a later release. Browse listings and save searches for now.
      </p>
      <Link href="/listings" className="mt-6 inline-block text-sm font-semibold text-[var(--fh-orange)] no-underline">
        Browse listings →
      </Link>
    </div>
  )
}
