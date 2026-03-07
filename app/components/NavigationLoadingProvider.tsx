"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react"

const FAILSAFE_HIDE_MS = 15000
const LISTINGS_NAV_GRACE_MS = 350
const NAV_LOADING_START_EVENT = "fullhangar:navigation-loading-start"
const NAV_LOADING_END_EVENT = "fullhangar:navigation-loading-end"

function isModifiedEvent(event: MouseEvent | ReactMouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
}

function shouldTrackAnchorClick(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute("href")
  if (!href) return false
  if (href.startsWith("#")) return false
  if (anchor.hasAttribute("download")) return false
  if (anchor.target && anchor.target.toLowerCase() === "_blank") return false

  const resolved = new URL(href, window.location.href)
  const current = new URL(window.location.href)

  if (resolved.origin !== current.origin) return false
  if (resolved.pathname === current.pathname && resolved.search === current.search) return false
  return true
}

export function NavigationLoadingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigating, setIsNavigating] = useState(false)
  const hideTimerRef = useRef<number | null>(null)
  const listingsGraceTimerRef = useRef<number | null>(null)
  const loadingLocksRef = useRef(0)
  const pendingListingsNavigationRef = useRef(false)

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  const clearListingsGraceTimer = () => {
    if (listingsGraceTimerRef.current) {
      window.clearTimeout(listingsGraceTimerRef.current)
      listingsGraceTimerRef.current = null
    }
  }

  const scheduleFailsafeHide = () => {
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => {
      loadingLocksRef.current = 0
      setIsNavigating(false)
      hideTimerRef.current = null
    }, FAILSAFE_HIDE_MS)
  }

  const startOverlay = () => {
    setIsNavigating(true)
    scheduleFailsafeHide()
  }

  const endOverlay = () => {
    if (loadingLocksRef.current > 0) return
    clearHideTimer()
    setIsNavigating(false)
  }

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (isModifiedEvent(event)) return

      const target = event.target as Element | null
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null
      if (!anchor) return
      if (!shouldTrackAnchorClick(anchor)) return

      const resolved = new URL(anchor.href, window.location.href)
      pendingListingsNavigationRef.current = resolved.pathname === "/listings"
      startOverlay()
    }

    const onLoadingStart = () => {
      pendingListingsNavigationRef.current = false
      clearListingsGraceTimer()
      loadingLocksRef.current += 1
      startOverlay()
    }

    const onLoadingEnd = () => {
      pendingListingsNavigationRef.current = false
      clearListingsGraceTimer()
      loadingLocksRef.current = Math.max(0, loadingLocksRef.current - 1)
      endOverlay()
    }

    document.addEventListener("click", onClick, true)
    window.addEventListener(NAV_LOADING_START_EVENT, onLoadingStart)
    window.addEventListener(NAV_LOADING_END_EVENT, onLoadingEnd)
    return () => {
      document.removeEventListener("click", onClick, true)
      window.removeEventListener(NAV_LOADING_START_EVENT, onLoadingStart)
      window.removeEventListener(NAV_LOADING_END_EVENT, onLoadingEnd)
    }
  }, [])

  useEffect(() => {
    if (!isNavigating) return
    if (pendingListingsNavigationRef.current && pathname === "/listings") {
      if (loadingLocksRef.current > 0) return
      clearListingsGraceTimer()
      listingsGraceTimerRef.current = window.setTimeout(() => {
        pendingListingsNavigationRef.current = false
        listingsGraceTimerRef.current = null
        endOverlay()
      }, LISTINGS_NAV_GRACE_MS)
      return
    }
    pendingListingsNavigationRef.current = false
    clearListingsGraceTimer()
    if (loadingLocksRef.current > 0) return
    const rafId = window.requestAnimationFrame(() => {
      endOverlay()
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [pathname, searchParams, isNavigating])

  useEffect(
    () => () => {
      clearHideTimer()
      clearListingsGraceTimer()
    },
    []
  )

  return (
    <>
      {children}
      {isNavigating ? (
        <div className="nav-loading-overlay" role="status" aria-live="polite" aria-label="Loading next page">
          <div className="nav-loading-spinner-shell">
            <img src="/branding/nav-loading-spinner.png" alt="Loading" className="nav-loading-spinner-image" />
          </div>
        </div>
      ) : null}
    </>
  )
}
