"use client"

import { useTheme } from "./ThemeProvider"

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="rounded-md border border-brand-dark px-3 py-1.5 text-xs font-semibold text-brand-muted hover:text-brand-orange"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? "Light Mode" : "Dark Mode"}
    </button>
  )
}
