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
      <div className="mb-8 text-center">
        <div
          className="text-[28px] font-bold tracking-wide text-white [data-theme=light]:text-slate-900"
          style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}
        >
          Full<span className="text-[#FF9900]">Hangar</span>
        </div>
        <div className="mt-1 text-[13px] text-[#8b949e] [data-theme=light]:text-slate-600">Aircraft market intelligence</div>
      </div>
      {children}
    </div>
  )
}
