"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import {
  SUBSCRIPTION_TIER_CARDS,
  formatSubscribeCta,
  tierBadgeLabel,
  type SubscriptionTierId,
} from "@/lib/stripe/tiers"

type ProfileSubscription = {
  stripe_customer_id: string | null
  subscription_tier: SubscriptionTierId | null
  subscription_status: string | null
  subscription_period_end: string | null
}

type Props = {
  showSubscribedSuccess: boolean
  subscription: ProfileSubscription
}

export default function DealAlertsClient({ showSubscribedSuccess, subscription }: Props) {
  const [busyTier, setBusyTier] = useState<SubscriptionTierId | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const [bannerVisible, setBannerVisible] = useState(showSubscribedSuccess)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!showSubscribedSuccess) return
    const t = window.setTimeout(() => setBannerVisible(false), 5000)
    return () => window.clearTimeout(t)
  }, [showSubscribedSuccess])

  const startCheckout = useCallback(async (tier: SubscriptionTierId) => {
    setError(null)
    setBusyTier(tier)
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok) {
        setError(data.error ?? "Checkout failed")
        return
      }
      if (data.url) {
        window.location.href = data.url
        return
      }
      setError("No checkout URL returned")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed")
    } finally {
      setBusyTier(null)
    }
  }, [])

  const openPortal = useCallback(async () => {
    setError(null)
    setPortalBusy(true)
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        credentials: "include",
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok) {
        setError(data.error ?? "Could not open billing portal")
        return
      }
      if (data.url) {
        window.location.href = data.url
        return
      }
      setError("No portal URL returned")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open billing portal")
    } finally {
      setPortalBusy(false)
    }
  }, [])

  const isActive = subscription.subscription_status === "active"
  const activeTier = subscription.subscription_tier
  const renewal =
    subscription.subscription_period_end &&
    !Number.isNaN(Date.parse(subscription.subscription_period_end))
      ? new Intl.DateTimeFormat("en-US", {
          dateStyle: "long",
          timeZone: "UTC",
        }).format(new Date(subscription.subscription_period_end))
      : null

  return (
    <>
      {bannerVisible ? (
        <div
          className="mb-6 rounded-lg border border-[var(--fh-orange)]/40 bg-[var(--fh-orange-dim)] px-4 py-3 text-sm text-[var(--fh-text)] [data-theme=light]:text-slate-900"
          role="status"
        >
          You&apos;re in. Your first digest arrives tomorrow morning.
        </div>
      ) : null}

      {error ? (
        <div
          className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 [data-theme=light]:text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {isActive ? (
        <section className="mb-8 rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-5 [data-theme=light]:bg-white">
          <p className="text-sm text-[var(--fh-text-dim)]">Current plan</p>
          <p
            className="mt-1 text-xl font-bold text-[var(--fh-orange)]"
            style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}
          >
            You&apos;re on {activeTier ? `${tierBadgeLabel(activeTier)} ✓` : "an active plan ✓"}
          </p>
          {renewal ? (
            <p className="mt-2 text-sm text-[var(--fh-text-dim)]">Renews {renewal}</p>
          ) : null}
          <button
            type="button"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[var(--fh-orange)] bg-transparent px-4 text-sm font-semibold text-[var(--fh-orange)] transition hover:bg-[var(--fh-orange-dim)] disabled:opacity-50"
            disabled={portalBusy}
            onClick={() => void openPortal()}
          >
            {portalBusy ? "Opening…" : "Manage billing"}
          </button>
        </section>
      ) : null}

      {!isActive ? (
        <div className="grid gap-6 md:grid-cols-2">
          {SUBSCRIPTION_TIER_CARDS.map((tier) => (
            <article
              key={tier.id}
              className="flex flex-col rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-6 [data-theme=light]:bg-white"
            >
              <h2
                className="text-xl font-bold tracking-tight text-[var(--fh-text)] [data-theme=light]:text-slate-900"
                style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}
              >
                {tier.displayName}
              </h2>
              <p className="mt-2 font-mono text-2xl font-semibold text-[var(--fh-orange)]">
                ${tier.monthlyUsd}
                <span className="text-base font-normal text-[var(--fh-text-dim)]">/month</span>
              </p>
              <ul className="mt-4 flex-1 list-inside list-disc space-y-2 text-sm leading-relaxed text-[var(--fh-text-dim)]">
                {tier.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[var(--fh-orange)] px-4 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-50"
                disabled={busyTier !== null}
                onClick={() => void startCheckout(tier.id)}
              >
                {busyTier === tier.id ? "Redirecting…" : formatSubscribeCta(tier.monthlyUsd)}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--fh-text-dim)]">
          To switch plans or update payment details, use <strong className="text-[var(--fh-text)]">Manage billing</strong>{" "}
          above.
        </p>
      )}

      <p className="mt-8 text-xs text-[var(--fh-text-dim)]">
        Questions? Manage payment methods and cancellation in{" "}
        <button
          type="button"
          className="font-semibold text-[var(--fh-orange)] underline-offset-2 hover:underline disabled:opacity-50"
          disabled={portalBusy || !subscription.stripe_customer_id}
          onClick={() => void openPortal()}
        >
          Stripe billing
        </button>
        {subscription.stripe_customer_id ? "" : " (subscribe first)"}. Digests respect your{" "}
        <Link href="/account/searches" className="font-semibold text-[var(--fh-orange)] hover:underline">
          saved search
        </Link>{" "}
        toggles.
      </p>
    </>
  )
}
