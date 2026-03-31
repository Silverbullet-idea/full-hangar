"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type ProfileRow = {
  id: string
  display_name: string | null
  avatar_url: string | null
  notify_price_drops: boolean
  notify_new_matches: boolean
  notify_product_updates: boolean
  onboarding_completed: boolean
  created_at?: string
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function fmtMemberSince(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(iso))
  } catch {
    return "—"
  }
}

export default function AccountDashboardClient({
  userEmail,
  profile: initialProfile,
  searchCount,
  scenarioCount,
  memberSince,
}: {
  userEmail: string
  profile: ProfileRow | null
  searchCount: number
  scenarioCount: number
  memberSince: string
}) {
  const [profile, setProfile] = useState<ProfileRow | null>(initialProfile)
  const [savedFlash, setSavedFlash] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (initialProfile) return
    let cancelled = false
    void (async () => {
      const res = await fetch("/api/account/profile", { credentials: "include" })
      if (!res.ok || cancelled) return
      const json = (await res.json()) as { profile?: ProfileRow }
      if (json.profile && !cancelled) setProfile(json.profile)
    })()
    return () => {
      cancelled = true
    }
  }, [initialProfile])

  const displayName =
    profile?.display_name?.trim() || userEmail.split("@")[0] || "pilot"

  const patchProfile = useCallback((patch: Partial<ProfileRow>) => {
    setProfile((p) => (p ? { ...p, ...patch } : p))
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      debounceRef.current = null
      const body: Record<string, unknown> = {}
      if ("notify_price_drops" in patch) body.notify_price_drops = patch.notify_price_drops
      if ("notify_new_matches" in patch) body.notify_new_matches = patch.notify_new_matches
      if ("notify_product_updates" in patch) body.notify_product_updates = patch.notify_product_updates
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setSavedFlash(true)
        setTimeout(() => setSavedFlash(false), 2000)
      }
    }, 500)
  }, [])

  const statLine = useMemo(() => {
    const parts: string[] = []
    if (searchCount > 0) parts.push(`${searchCount} saved search${searchCount === 1 ? "" : "es"}`)
    if (scenarioCount > 0) parts.push(`${scenarioCount} scenario${scenarioCount === 1 ? "" : "s"}`)
    const tail = `Member since ${fmtMemberSince(memberSince)}`
    if (parts.length === 0) return `— · ${tail}`
    return `${parts.join(" · ")} · ${tail}`
  }, [searchCount, scenarioCount, memberSince])

  const nPrice = profile?.notify_price_drops ?? true
  const nMatch = profile?.notify_new_matches ?? true
  const nProduct = profile?.notify_product_updates ?? true

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1
          className="text-2xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900 sm:text-3xl"
          style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}
        >
          {greeting()}, {displayName} <span aria-hidden>✈</span>
        </h1>
        <p className="mt-1 text-sm text-[var(--fh-text-dim)]">Your Full Hangar account</p>
        <p className="mt-3 text-xs text-[var(--fh-text-dim)]">{statLine}</p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--fh-text-dim)]">Quick actions</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/listings"
            className="rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-4 no-underline transition hover:border-[var(--fh-orange)]/35 [data-theme=light]:bg-white"
          >
            <div className="text-lg">🔍</div>
            <div className="mt-1 font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Browse deals</div>
            <div className="text-xs text-[var(--fh-text-dim)]">→ /listings</div>
          </Link>
          <Link
            href="/deal-coach"
            className="rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-4 no-underline transition hover:border-[var(--fh-orange)]/35 [data-theme=light]:bg-white"
          >
            <div className="text-lg">✈</div>
            <div className="mt-1 font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Deal Coach</div>
            <div className="text-xs text-[var(--fh-text-dim)]">Analyze a flip</div>
          </Link>
          <Link
            href="/account/searches"
            className="rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-4 no-underline transition hover:border-[var(--fh-orange)]/35 [data-theme=light]:bg-white"
          >
            <div className="text-lg">🔖</div>
            <div className="mt-1 font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">
              My searches{searchCount > 0 ? ` (${searchCount})` : ""}
            </div>
            <div className="text-xs text-[var(--fh-text-dim)]">Saved filters &amp; alerts</div>
          </Link>
          <Link
            href="/account/alerts"
            className="rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-4 no-underline transition hover:border-[var(--fh-orange)]/35 [data-theme=light]:bg-white"
          >
            <div className="text-lg">📬</div>
            <div className="mt-1 font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Deal alerts</div>
            <div className="text-xs text-[var(--fh-text-dim)]">Digests &amp; future tiers</div>
          </Link>
        </div>
      </section>

      <section className="mb-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-5 [data-theme=light]:bg-white">
          <h3 className="font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Saved searches</h3>
          {searchCount > 0 ? (
            <p className="mt-2 text-sm text-[var(--fh-text-dim)]">You have {searchCount} saved.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-[var(--fh-text-dim)]">
                Save a search on the listings page to track price drops.
              </p>
              <Link href="/listings" className="mt-3 inline-block text-sm font-semibold text-[var(--fh-orange)] no-underline">
                Browse listings →
              </Link>
            </>
          )}
        </div>
        <div className="rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-5 [data-theme=light]:bg-white">
          <h3 className="font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Recent deal scenarios</h3>
          {scenarioCount > 0 ? (
            <p className="mt-2 text-sm text-[var(--fh-text-dim)]">You have {scenarioCount} saved.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-[var(--fh-text-dim)]">Run a deal analysis to see it saved here.</p>
              <Link href="/deal-coach" className="mt-3 inline-block text-sm font-semibold text-[var(--fh-orange)] no-underline">
                Open Deal Coach →
              </Link>
            </>
          )}
          {scenarioCount > 0 ? (
            <Link href="/account/scenarios" className="mt-3 inline-block text-sm font-semibold text-[var(--fh-orange)] no-underline">
              View all scenarios →
            </Link>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-5 [data-theme=light]:bg-white">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Notification preferences</h3>
          {savedFlash ? (
            <span className="text-xs font-medium text-emerald-500 transition-opacity">Saved</span>
          ) : null}
        </div>
        <ul className="mt-4 space-y-4">
          <li className="flex items-center justify-between gap-4">
            <span className="text-sm text-[var(--fh-text)] [data-theme=light]:text-slate-800">Price drop alerts</span>
            <button
              type="button"
              role="switch"
              aria-checked={nPrice}
              onClick={() => patchProfile({ notify_price_drops: !nPrice })}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${nPrice ? "bg-[var(--fh-orange)]" : "bg-[var(--fh-border)]"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition ${nPrice ? "translate-x-5" : ""}`}
              />
            </button>
          </li>
          <li className="flex items-center justify-between gap-4">
            <span className="text-sm text-[var(--fh-text)] [data-theme=light]:text-slate-800">New listing matches</span>
            <button
              type="button"
              role="switch"
              aria-checked={nMatch}
              onClick={() => patchProfile({ notify_new_matches: !nMatch })}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${nMatch ? "bg-[var(--fh-orange)]" : "bg-[var(--fh-border)]"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition ${nMatch ? "translate-x-5" : ""}`}
              />
            </button>
          </li>
          <li className="flex items-center justify-between gap-4">
            <span className="text-sm text-[var(--fh-text)] [data-theme=light]:text-slate-800">Product updates</span>
            <button
              type="button"
              role="switch"
              aria-checked={nProduct}
              onClick={() => patchProfile({ notify_product_updates: !nProduct })}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${nProduct ? "bg-[var(--fh-orange)]" : "bg-[var(--fh-border)]"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition ${nProduct ? "translate-x-5" : ""}`}
              />
            </button>
          </li>
        </ul>
      </section>
    </div>
  )
}
