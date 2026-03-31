import { Suspense } from "react"
import LoginClient from "./LoginClient"

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="h-64 w-full max-w-[400px] animate-pulse rounded-xl bg-[#161b22] [data-theme=light]:bg-slate-200" />
      }
    >
      <LoginClient />
    </Suspense>
  )
}
