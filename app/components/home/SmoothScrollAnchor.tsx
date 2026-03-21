"use client"

import type { CSSProperties, ReactNode } from "react"

type SmoothScrollAnchorProps = {
  href: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}

export default function SmoothScrollAnchor({ href, className, style, children }: SmoothScrollAnchorProps) {
  const id = href.startsWith("#") ? href.slice(1) : href

  return (
    <a
      href={href}
      className={className}
      style={style}
      onClick={(e) => {
        e.preventDefault()
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
      }}
    >
      {children}
    </a>
  )
}
