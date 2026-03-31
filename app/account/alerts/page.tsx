import Link from "next/link"
import { redirect } from "next/navigation"
import DealAlertsClient from "./DealAlertsClient"
import { createSupabaseRscClient } from "@/lib/supabase/server"
import type { SubscriptionTierId } from "@/lib/stripe/tiers"

type PageProps = {
  searchParams: Promise<{ subscribed?: string | string[] }>
}

function parseSubscribed(raw: string | string[] | undefined): boolean {
  if (raw === undefined) return false
  const v = Array.isArray(raw) ? raw[0] : raw
  return v === "true" || v === "1"
}

function coerceTier(v: unknown): SubscriptionTierId | null {
  return v === "scout" || v === "pro" ? v : null
}

export default async function DealAlertsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const showSubscribedSuccess = parseSubscribed(sp.subscribed)

  const supabase = await createSupabaseRscClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/account/login?returnTo=%2Faccount%2Falerts")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("stripe_customer_id, subscription_tier, subscription_status, subscription_period_end")
    .eq("id", user.id)
    .maybeSingle()

  const subscription = {
    stripe_customer_id: profile?.stripe_customer_id ?? null,
    subscription_tier: coerceTier(profile?.subscription_tier),
    subscription_status: typeof profile?.subscription_status === "string" ? profile.subscription_status : null,
    subscription_period_end:
      typeof profile?.subscription_period_end === "string" ? profile.subscription_period_end : null,
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
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
        Paid subscribers get daily digests when your alert searches have matches (top listings by flip score). Enable
        &quot;Email me a daily digest&quot; on{" "}
        <Link href="/account/searches" className="font-semibold text-[var(--fh-orange)] no-underline hover:underline">
          Saved searches
        </Link>
        .
      </p>

      <div className="mt-8">
        <DealAlertsClient showSubscribedSuccess={showSubscribedSuccess} subscription={subscription} />
      </div>
    </div>
  )
}
