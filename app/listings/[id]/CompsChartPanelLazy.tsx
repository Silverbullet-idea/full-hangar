"use client"

import dynamic from "next/dynamic"

export default dynamic(() => import("./CompsChartPanel"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full rounded-[10px] border border-[var(--fh-border)] bg-[var(--fh-bg3)]"
      style={{ minHeight: 280 }}
      aria-busy="true"
      aria-label="Loading comparable market chart"
    />
  ),
})
