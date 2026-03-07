import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "Internal Login",
  robots: {
    index: false,
    follow: false,
  },
}

export default function InternalLoginLayout({ children }: { children: ReactNode }) {
  return children
}
