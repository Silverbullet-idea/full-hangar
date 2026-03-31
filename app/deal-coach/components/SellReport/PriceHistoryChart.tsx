"use client"

import { useMemo } from "react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { PriceHistoryPoint } from "@/lib/sellIntel/types"

type Props = {
  points: PriceHistoryPoint[]
  yourTargetPrice: number | null | undefined
}

export default function PriceHistoryChart({ points, yourTargetPrice }: Props) {
  const data = useMemo(
    () =>
      points.map((p) => ({
        month: p.month,
        medianPrice: p.medianPrice,
        listingCount: p.listingCount,
      })),
    [points]
  )

  const maxCount = useMemo(() => Math.max(1, ...points.map((p) => p.listingCount)), [points])

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-8 text-center text-sm text-[var(--fh-text-dim)] [data-theme=light]:bg-slate-50">
        No price history for this cohort.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-slate-50">
      <p className="mb-3 text-sm font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">6-month median trend</p>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--fh-text-dim)" }} stroke="rgba(148,163,184,0.4)" />
            <YAxis
              yAxisId="price"
              tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
              tick={{ fontSize: 10, fill: "var(--fh-text-dim)" }}
              stroke="rgba(148,163,184,0.4)"
              width={44}
            />
            <YAxis yAxisId="count" hide domain={[0, maxCount * 1.15]} />
            <Tooltip
              contentStyle={{
                background: "#111827",
                border: "1px solid #374151",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#e5e7eb" }}
              formatter={(value: number, name: string) =>
                name === "listingCount" ? [value, "Listings"] : [new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value), "Median"]
              }
            />
            <Area
              yAxisId="count"
              type="monotone"
              dataKey="listingCount"
              fill="rgba(255,153,0,0.12)"
              stroke="none"
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="medianPrice"
              stroke="#FF9900"
              strokeWidth={2}
              dot={{ r: 3, fill: "#FF9900" }}
            />
            {typeof yourTargetPrice === "number" && yourTargetPrice > 0 ? (
              <ReferenceLine
                yAxisId="price"
                y={yourTargetPrice}
                stroke="#34d399"
                strokeDasharray="6 4"
                label={{ value: "Your target", fill: "#34d399", fontSize: 10 }}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
