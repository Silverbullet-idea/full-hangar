import Link from "next/link"
import { redirect } from "next/navigation"
import { createSupabaseRscClient } from "@/lib/supabase/server"

export default async function DealAlertsPage() {
  const supabase = await createSupabaseRscClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/account/login?returnTo=%2Faccount%2Falerts")

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/account" className="text-sm text-[var(--fh-orange)] no-underline hover:underline">
        ← Account home
      </Link>
      <h1
        className="mt-4 text-2xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900"
        style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}
      >
        Deal alerts
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--fh-text-dim)]">
        Saved-search digests are included with your account: enable &quot;Email me a daily digest&quot; on{" "}
        <Link href="/account/searches" className="font-semibold text-[var(--fh-orange)] no-underline hover:underline">
          Saved searches
        </Link>
        . We email at most once per day per account when at least one alert search has current matches (top listings by
        flip score).
      </p>
      <section className="mt-8 rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-5 [data-theme=light]:bg-white">
        <h2 className="text-lg font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Coming soon: paid tiers</h2>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-[var(--fh-text-dim)]">
          <li>
            <strong className="text-[var(--fh-text)] [data-theme=light]:text-slate-800">$49/mo</strong> — expanded digest
            limits and priority delivery
          </li>
          <li>
            <strong className="text-[var(--fh-text)] [data-theme=light]:text-slate-800">$99/mo</strong> — broker-grade
            watchlists and API-style exports (roadmap)
          </li>
        </ul>
        <p className="mt-4 text-xs text-[var(--fh-text-dim)]">
          Stripe billing is not wired yet; today&apos;s digests are free for signed-in users with alerts enabled.
        </p>
      </section>
    </div>
  )
}
