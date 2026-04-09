import Link from "next/link"
import HeaderNavBrand from "@/app/components/HeaderNavBrand"

export default function AccountAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="account-auth-shell min-h-screen bg-[#0d1117] px-5 py-8 [data-theme=light]:bg-slate-100"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div className="mb-8 flex flex-col items-center text-center">
        <Link
          href="/"
          className="inline-flex flex-col items-center rounded-sm no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF9900]"
          aria-label="Full Hangar home"
        >
          <HeaderNavBrand imgClassName="h-11 w-auto max-w-[min(280px,85vw)] object-contain sm:h-12" />
        </Link>
        <p className="mt-3 text-[13px] text-[#8b949e] [data-theme=light]:text-slate-600">Aircraft market intelligence</p>
      </div>
      {children}
    </div>
  )
}
