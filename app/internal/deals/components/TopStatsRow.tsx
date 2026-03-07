type TopStats = {
  total: number
  exceptionalCount: number
  avgDays: number | null
  makesWithComps: number
  highPriorityCount: number
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-brand-dark bg-[#141414] p-3">
      <div className="text-[11px] text-brand-muted">{label}</div>
      <div className="mt-1 text-xl font-extrabold text-brand-orange">{value}</div>
    </div>
  )
}

export default function TopStatsRow({ topStats }: { topStats: TopStats }) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
      <StatCard label="Total listings under $50k" value={String(topStats.total)} />
      <StatCard label="Exceptional deals under $50k" value={String(topStats.exceptionalCount)} />
      <StatCard label="High-priority candidates" value={String(topStats.highPriorityCount)} />
      <StatCard label="Average days since scraped" value={topStats.avgDays == null ? 'N/A' : `${topStats.avgDays.toFixed(1)} days`} />
      <StatCard label="Makes with 10+ comps available" value={String(topStats.makesWithComps)} />
    </div>
  )
}
