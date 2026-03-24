"use client"

import HeaderNavBrand from "./HeaderNavBrand"
import HeaderSearchBar from "./HeaderSearchBar"
import ThemeToggle from "./ThemeToggle"

export default function SiteHeader() {
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
          <a href="/internal/deal-desk" className="fh-nav-quick-action no-underline">
            ⚡ Deal Desk
          </a>
          <a href="/internal/market-intel" className="fh-nav-quick-action no-underline">
            📊 Market Intel
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
