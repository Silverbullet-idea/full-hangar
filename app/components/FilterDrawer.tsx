"use client"

import { useEffect } from "react"

type FilterDrawerProps = {
  open: boolean
  onClose: () => void
  onApply: () => void
  onClearAll: () => void
  children: React.ReactNode
}

export default function FilterDrawer({ open, onClose, onApply, onClearAll, children }: FilterDrawerProps) {
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  return (
    <div
      className={`fixed inset-0 z-50 md:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-label="Close filters"
      />
      <div
        className={`absolute bottom-0 left-0 right-0 flex max-h-[85dvh] flex-col rounded-t-2xl border border-border bg-background text-foreground shadow-lg transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          paddingLeft: "max(0px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(0px, env(safe-area-inset-right, 0px))",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-drawer-title"
      >
        <div className="flex shrink-0 flex-col items-center border-b border-border px-4 pb-2 pt-3">
          <div className="mb-2 h-1 w-10 rounded-full bg-muted-foreground/40" aria-hidden />
          <div className="flex w-full items-center justify-between gap-2">
            <h2 id="filter-drawer-title" className="text-sm font-semibold text-foreground">
              Filters
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3">
          {children}
        </div>
        <div
          className="shrink-0 border-t border-border bg-background px-4 pt-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                onClearAll()
              }}
              className="text-center text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear all filters
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] flex-1 rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:bg-foreground/10"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  onApply()
                  onClose()
                }}
                className="fh-cta-on-orange-fill min-h-[44px] flex-1 rounded-md border border-brand-orange bg-brand-orange px-3 text-sm font-bold hover:bg-brand-burn"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
