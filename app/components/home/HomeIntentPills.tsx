import Link from "next/link"

export const HOME_INTENT = {
  buy: { href: "/listings?dealTier=TOP_DEALS&sortBy=flip_desc", label: "Buy" },
  sell: { href: "/deal-coach?intent=sell", label: "Sell" },
  research: { href: "/deal-coach?intent=research", label: "Research" },
} as const

/** Same visual treatment for Buy / Sell / Research everywhere on the home page. */
export function homeIntentPillClass(size: "hero" | "card" | "footer" = "hero"): string {
  const sizing =
    size === "hero"
      ? "min-h-[56px] min-w-[10.5rem] px-8 text-base sm:min-w-[11.5rem]"
      : size === "footer"
        ? "min-h-[52px] min-w-[9rem] flex-1 px-6 text-sm sm:flex-none sm:min-w-[10rem]"
        : "min-h-[48px] w-full px-6 text-sm"
  return [
    "fh-home-intent-pill inline-flex items-center justify-center rounded-full border-2 border-[#FF9900] bg-[rgba(22,31,49,0.92)] font-bold uppercase tracking-[0.06em] text-[#FF9900]",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition",
    "hover:border-[#ffb84d] hover:bg-[#FF9900]/14 hover:text-[#ffb84d]",
    "[data-theme=light]:border-[#ea580c] [data-theme=light]:bg-white [data-theme=light]:text-[#c2410c]",
    "[data-theme=light]:hover:bg-orange-50 [data-theme=light]:hover:text-[#9a3412]",
    sizing,
  ].join(" ")
}

type RowProps = { size?: "hero" | "card" | "footer"; className?: string }

export function HomeIntentPillRow({ size = "hero", className = "" }: RowProps) {
  return (
    <div
      className={`flex w-full flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-4 ${className}`}
    >
      <Link href={HOME_INTENT.buy.href} className={homeIntentPillClass(size)}>
        {HOME_INTENT.buy.label}
      </Link>
      <Link href={HOME_INTENT.sell.href} className={homeIntentPillClass(size)}>
        {HOME_INTENT.sell.label}
      </Link>
      <Link href={HOME_INTENT.research.href} className={homeIntentPillClass(size)}>
        {HOME_INTENT.research.label}
      </Link>
    </div>
  )
}
