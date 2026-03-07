"use client"

import { useEffect, useMemo, useState } from "react"
import { useTheme } from "./ThemeProvider"

type HeaderBrandProps = {
  className?: string
}

export default function HeaderBrand({ className = "h-10 w-auto" }: HeaderBrandProps) {
  const { theme } = useTheme()
  const sources = useMemo(
    () =>
      theme === "light"
        ? [
            process.env.NEXT_PUBLIC_BRAND_LOGO_LIGHT_URL,
            "/branding/FullHangarLight.png",
            "/branding/FullHangarLight.svg",
          ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [
            process.env.NEXT_PUBLIC_BRAND_LOGO_URL,
            "/branding/FullHangar.png",
            "/branding/FullHangar.svg",
          ].filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    [theme]
  )
  const [sourceIndex, setSourceIndex] = useState(0)

  useEffect(() => {
    setSourceIndex(0)
  }, [theme])

  if (sources.length > 0 && sourceIndex < sources.length) {
    return (
      <img
        src={sources[sourceIndex]}
        alt="Full Hangar"
        className={className}
        width={330}
        height={80}
        onError={() => setSourceIndex((idx) => idx + 1)}
      />
    )
  }

  return (
    <span className="text-2xl font-bold tracking-wide text-brand-white">
      <span className="text-brand-orange">Full</span> Hangar
    </span>
  )
}
