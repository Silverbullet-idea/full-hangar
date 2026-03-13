"use client"

import { useTheme } from "./ThemeProvider"

export default function ThemeToggle() {
  const { theme, mounted, toggleTheme } = useTheme()
  const isDark = theme === "dark"
  const resolvedIsDark = mounted ? isDark : false

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={!resolvedIsDark}
      className="group inline-flex items-center gap-2 rounded-full border border-brand-dark bg-card-bg px-2 py-1 text-xs font-semibold text-brand-muted hover:text-brand-orange"
      aria-label={`Switch to ${resolvedIsDark ? "light" : "dark"} mode`}
      title={`Switch to ${resolvedIsDark ? "light" : "dark"} mode`}
    >
      <span className="select-none">{resolvedIsDark ? "Dark" : "Light"}</span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-5 w-10 items-center rounded-full border transition-colors ${
          resolvedIsDark ? "border-brand-dark bg-black/50" : "border-brand-dark bg-brand-orange/40"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-brand-white shadow-sm transition-transform ${
            resolvedIsDark ? "translate-x-0.5" : "translate-x-5"
          }`}
        />
      </span>
    </button>
  )
}
