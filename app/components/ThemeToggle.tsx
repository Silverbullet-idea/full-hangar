"use client"

import { useEffect, useState } from "react"
import { useTheme } from "./ThemeProvider"

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === "dark"
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  if (!ready) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={false}
        aria-label="Toggle theme"
        className="group inline-flex items-center gap-2 rounded-full border border-brand-dark bg-card-bg px-2 py-1 text-xs font-semibold text-brand-muted"
        suppressHydrationWarning
      >
        <span className="select-none" suppressHydrationWarning>
          ···
        </span>
        <span
          aria-hidden="true"
          className="relative inline-flex h-5 w-10 items-center rounded-full border border-brand-dark bg-brand-orange/40 transition-colors"
        >
          <span className="inline-block h-4 w-4 translate-x-5 rounded-full bg-brand-white shadow-sm transition-transform" />
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={!isDark}
      className="group inline-flex items-center gap-2 rounded-full border border-brand-dark bg-card-bg px-2 py-1 text-xs font-semibold text-brand-muted hover:text-brand-orange"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <span className="select-none">{isDark ? "Dark" : "Light"}</span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-5 w-10 items-center rounded-full border transition-colors ${
          isDark ? "border-brand-dark bg-black/50" : "border-brand-dark bg-brand-orange/40"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-brand-white shadow-sm transition-transform ${
            isDark ? "translate-x-0.5" : "translate-x-5"
          }`}
        />
      </span>
    </button>
  )
}
