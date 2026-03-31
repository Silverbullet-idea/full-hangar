import { Suspense } from "react"
import VerifyClient from "./VerifyClient"

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="h-72 w-full max-w-[400px] animate-pulse rounded-xl bg-[#161b22] [data-theme=light]:bg-slate-200" />
      }
    >
      <VerifyClient />
    </Suspense>
  )
}
