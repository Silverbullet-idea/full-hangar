"use client"

import dynamic from "next/dynamic"

const CompsChart = dynamic(() => import("../../components/CompsChart"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 280,
        borderRadius: 10,
        border: "1px solid #3a4454",
        background: "#141922",
      }}
      aria-hidden="true"
    />
  ),
})

type CompsChartPanelProps = {
  listingId: string
  hideChrome?: boolean
}

export default function CompsChartPanel({ listingId, hideChrome = false }: CompsChartPanelProps) {
  return <CompsChart listingId={listingId} hideChrome={hideChrome} />
}
