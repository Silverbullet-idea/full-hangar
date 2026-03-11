"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react"

const FAILSAFE_HIDE_MS = 15000
const IMAGE_READY_TIMEOUT_MS = 10000
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
  const loadingLocksRef = useRef(0)
  const pendingListingsNavigationRef = useRef(false)
  const hasRouteCommittedRef = useRef(false)
  const pendingNetworkRequestsRef = useRef(0)
  const pendingImageLoadsRef = useRef(0)
  const navigationIdRef = useRef(0)

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
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
    navigationIdRef.current += 1
    hasRouteCommittedRef.current = false
    setIsNavigating(true)
    scheduleFailsafeHide()
  }

  const endOverlay = () => {
    if (loadingLocksRef.current > 0) return
    if (!hasRouteCommittedRef.current) return
    if (pendingNetworkRequestsRef.current > 0) return
    if (pendingImageLoadsRef.current > 0) return
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
      if (pendingListingsNavigationRef.current) {
        // Keep overlay until ListingsClient confirms the new payload is mounted.
        loadingLocksRef.current += 1
      }
      startOverlay()
    }

    const onLoadingStart = () => {
      pendingListingsNavigationRef.current = false
      loadingLocksRef.current += 1
      startOverlay()
    }

    const onLoadingEnd = () => {
      pendingListingsNavigationRef.current = false
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
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (...args) => {
      const trackThisRequest = isNavigating && hasRouteCommittedRef.current
      if (trackThisRequest) {
        pendingNetworkRequestsRef.current += 1
      }
      try {
        return await originalFetch(...args)
      } finally {
        if (trackThisRequest) {
          pendingNetworkRequestsRef.current = Math.max(0, pendingNetworkRequestsRef.current - 1)
          endOverlay()
        }
      }
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [isNavigating])

  useEffect(() => {
    if (!isNavigating) return
    const navId = navigationIdRef.current
    hasRouteCommittedRef.current = true

    if (pendingListingsNavigationRef.current && pathname === "/listings") {
      // Listings uses explicit start/end events while data payload mounts.
      pendingListingsNavigationRef.current = false
    }

    const pendingImages = Array.from(document.images).filter((img) => !img.complete).length
    if (pendingImages === 0) {
      pendingImageLoadsRef.current = 0
      endOverlay()
      return
    }

    pendingImageLoadsRef.current = pendingImages
    const trackedImages = Array.from(document.images).filter((img) => !img.complete)
    const releaseOne = () => {
      pendingImageLoadsRef.current = Math.max(0, pendingImageLoadsRef.current - 1)
      if (navigationIdRef.current !== navId) return
      endOverlay()
    }
    const cleanupFns: Array<() => void> = []
    for (const img of trackedImages) {
      const onDone = () => releaseOne()
      img.addEventListener("load", onDone, { once: true })
      img.addEventListener("error", onDone, { once: true })
      cleanupFns.push(() => {
        img.removeEventListener("load", onDone)
        img.removeEventListener("error", onDone)
      })
    }

    const timeoutId = window.setTimeout(() => {
      if (navigationIdRef.current !== navId) return
      pendingImageLoadsRef.current = 0
      endOverlay()
    }, IMAGE_READY_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timeoutId)
      for (const cleanup of cleanupFns) cleanup()
    }
  }, [pathname, searchParams, isNavigating])

  useEffect(
    () => () => {
      clearHideTimer()
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
