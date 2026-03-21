"use client"

import type { ReactNode } from "react"

type SmoothScrollAnchorProps = {
  href: string
  className?: string
  children: ReactNode
}

export default function SmoothScrollAnchor({ href, className, children }: SmoothScrollAnchorProps) {
  const id = href.startsWith("#") ? href.slice(1) : href

  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
      }}
    >
      {children}
    </a>
  )
}
