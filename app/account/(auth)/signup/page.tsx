import { Suspense } from "react"
import SignupClient from "./SignupClient"

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="h-80 w-full max-w-[400px] animate-pulse rounded-xl bg-[#161b22] [data-theme=light]:bg-slate-200" />
      }
    >
      <SignupClient />
    </Suspense>
  )
}
