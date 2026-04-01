"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { useCurrentUser } from "@/lib/account/useCurrentUser"
import { setAuthReturnCookie } from "@/lib/account/authReturnCookie"
import AccountDropdown from "./AccountDropdown"
import HeaderNavBrand from "./HeaderNavBrand"
import HeaderSearchBar from "./HeaderSearchBar"
import NotificationBell from "./NotificationBell"
import ThemeToggle from "./ThemeToggle"

export default function SiteHeader({ hasSellListings = false }: { hasSellListings?: boolean }) {
  const { user, profile, isAdmin, isLoading } = useCurrentUser()
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const displayName = profile?.display_name?.trim() || user?.email?.split("@")[0] || ""
  const shortName =
    displayName.length > 16 ? `${displayName.slice(0, 15)}…` : displayName || "Account"
  const initial = (displayName[0] || user?.email?.[0] || "?").toUpperCase()

  return (
    <header className="fh-site-header">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-5 sm:gap-4">
        <a href="/" className="flex min-w-0 shrink-0 items-center no-underline" aria-label="Full Hangar home">
          <HeaderNavBrand />
        </a>

        <div className="flex min-w-0 flex-1 justify-center">
          <div className="w-full max-w-[360px] min-w-0">
            <HeaderSearchBar />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-9 w-20 animate-pulse rounded-lg bg-[var(--fh-border)]" />
              <div className="h-9 w-28 animate-pulse rounded-lg bg-[var(--fh-border)]" />
            </div>
          ) : user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href={hasSellListings ? "/sell/dashboard" : "/sell"}
                className="hidden text-sm font-semibold text-[var(--fh-orange)] no-underline hover:underline sm:inline"
              >
                {hasSellListings ? "My listings" : "Sell your aircraft"}
              </Link>
              <NotificationBell />
              <div className="relative flex items-center gap-2" ref={wrapRef}>
                {isAdmin ? (
                  <span className="hidden rounded border border-[var(--fh-orange)]/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--fh-orange)] sm:inline">
                    Admin
                  </span>
                ) : null}
                <button
                  type="button"
                  className="flex max-w-[200px] items-center gap-2 rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg2)] py-1 pl-1 pr-2 text-left transition hover:border-[var(--fh-orange)]/40 [data-theme=light]:bg-white"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--fh-orange)] text-sm font-bold text-white">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initial
                    )}
                  </span>
                  <span className="truncate text-sm font-medium text-[var(--fh-text)] [data-theme=light]:text-slate-900">
                    {shortName}
                  </span>
                  <span className="text-[var(--fh-text-dim)]" aria-hidden>
                    ▾
                  </span>
                </button>
                <AccountDropdown
                  user={user}
                  profile={profile}
                  isAdmin={isAdmin}
                  open={menuOpen}
                  onClose={() => setMenuOpen(false)}
                />
              </div>
            </div>
          ) : (
            <>
              <Link
                href="/account/login"
                onClick={() => setAuthReturnCookie(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/")}
                className="fh-nav-quick-action inline-flex h-9 items-center justify-center rounded-lg border border-[var(--fh-border)] px-3 text-sm font-medium text-[var(--fh-text)] no-underline hover:border-[var(--fh-orange)]/40 [data-theme=light]:text-slate-800"
              >
                Sign in
              </Link>
              <Link
                href="/account/signup"
                className="fh-cta-on-orange-fill inline-flex h-9 min-w-[7.5rem] items-center justify-center rounded-lg border border-black/25 bg-[#FF9900] px-3.5 text-sm font-bold tracking-wide no-underline shadow-[0_1px_0_rgba(255,255,255,0.35)_inset] hover:brightness-105 active:brightness-95 [data-theme=light]:border-black/15 [data-theme=light]:shadow-sm"
              >
                Create account
              </Link>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
