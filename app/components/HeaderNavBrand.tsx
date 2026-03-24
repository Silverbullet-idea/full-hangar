"use client"

import { useEffect, useMemo, useState } from "react"
import { useTheme } from "./ThemeProvider"

export default function HeaderNavBrand() {
  const { theme } = useTheme()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  const lightSources = useMemo(
    () =>
      [
        process.env.NEXT_PUBLIC_BRAND_LOGO_LIGHT_URL,
        "/branding/FullHangarLight.png",
        "/branding/FullHangarLight.svg",
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    []
  )

  const darkSources = useMemo(
    () =>
      [
        process.env.NEXT_PUBLIC_BRAND_LOGO_URL,
        "/branding/FullHangar.png",
        "/branding/FullHangar.svg",
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    []
  )

  const sources = useMemo(() => {
    if (!ready) return darkSources
    return theme === "light" ? lightSources : darkSources
  }, [ready, theme, lightSources, darkSources])

  const [sourceIndex, setSourceIndex] = useState(0)

  useEffect(() => {
    setSourceIndex(0)
  }, [sources])

  return (
    <div className="flex shrink-0 items-center">
      {sources.length > 0 && sourceIndex < sources.length ? (
        <img
          src={sources[sourceIndex]}
          alt="Full Hangar"
          width={40}
          height={40}
          className="h-9 w-auto object-contain"
          onError={() => setSourceIndex((idx) => idx + 1)}
        />
      ) : null}
    </div>
  )
}
