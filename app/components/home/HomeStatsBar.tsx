"use client"

import { useState } from "react"

const INITIAL_COUNTS = {
  listings: "10,574",
  faa: "310,196",
  tbo: "110+",
  sources: "8",
} as const

export default function HomeStatsBar() {
  const [counts] = useState(INITIAL_COUNTS)

  return (
    <section className="border-y border-[#2B3444] py-8" style={{ backgroundColor: "#121923" }}>
      <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-6 px-6 lg:grid-cols-4">
        <div>
          <div className="text-[2.2rem] font-extrabold leading-none" style={{ color: "#ffffff" }}>
            {counts.listings}
          </div>
          <p className="mt-1 text-xs" style={{ color: "#9AA4B2" }}>
            Live listings tracked
          </p>
        </div>
        <div>
          <div className="text-[2.2rem] font-extrabold leading-none" style={{ color: "#ffffff" }}>
            {counts.faa}
          </div>
          <p className="mt-1 text-xs" style={{ color: "#9AA4B2" }}>
            FAA registry records
          </p>
        </div>
        <div>
          <div className="text-[2.2rem] font-extrabold leading-none" style={{ color: "#ffffff" }}>
            {counts.tbo}
          </div>
          <p className="mt-1 text-xs" style={{ color: "#9AA4B2" }}>
            Engine TBO references
          </p>
        </div>
        <div>
          <div className="text-[2.2rem] font-extrabold leading-none" style={{ color: "#ffffff" }}>
            {counts.sources}
          </div>
          <p className="mt-1 text-xs" style={{ color: "#9AA4B2" }}>
            Data sources scraped daily
          </p>
        </div>
      </div>
    </section>
  )
}
