"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react"

const FAILSAFE_HIDE_MS = 15000

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

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (isModifiedEvent(event)) return

      const target = event.target as Element | null
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null
      if (!anchor) return
      if (!shouldTrackAnchorClick(anchor)) return

      setIsNavigating(true)
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = window.setTimeout(() => {
        setIsNavigating(false)
      }, FAILSAFE_HIDE_MS)
    }

    document.addEventListener("click", onClick, true)
    return () => {
      document.removeEventListener("click", onClick, true)
    }
  }, [])

  useEffect(() => {
    if (!isNavigating) return
    const rafId = window.requestAnimationFrame(() => {
      setIsNavigating(false)
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [pathname, searchParams, isNavigating])

  useEffect(
    () => () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
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
