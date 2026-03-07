"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

export type ThemeMode = "dark" | "light"

type ThemeContextValue = {
  theme: ThemeMode
  setTheme: (next: ThemeMode) => void
  toggleTheme: () => void
}

const STORAGE_KEY = "full-hangar-theme"
const DEFAULT_THEME: ThemeMode = "dark"

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return
  document.documentElement.setAttribute("data-theme", theme)
}

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_THEME
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === "light" ? "light" : "dark"
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(DEFAULT_THEME)

  useEffect(() => {
    const initial = readStoredTheme()
    setThemeState(initial)
    applyTheme(initial)
  }, [])

  const setTheme = (next: ThemeMode) => {
    setThemeState(next)
    applyTheme(next)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return context
}
