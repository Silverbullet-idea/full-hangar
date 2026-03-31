'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import SaveListingsSearchButton from './SaveListingsSearchButton'

const TRACKED = new Set([
  'category',
  'maxPrice',
  'priceDropOnly',
  'addedToday',
  'dealScore',
  'q',
  'make',
  'modelFamily',
  'minPrice',
  'location',
  'minEngine',
  'minAvionics',
  'minQuality',
  'minValue',
  'maxValueScore',
  'engineLife',
  'avionics',
  'dealPattern',
  'hidePriceUndisclosed',
  'priceStatus',
  'yearMin',
  'yearMax',
  'totalTimeMin',
  'totalTimeMax',
  'maintenanceBand',
  'engineTime',
  'trueCostMin',
  'trueCostMax',
  'minValueScore',
  'sortBy',
  'pageSize',
])

function labelForKey(key: string, params: URLSearchParams): string {
  const v = params.get(key) ?? ''
  if (key === 'category') return v === 'turboprop' ? 'Turboprop' : v.replace(/_/g, ' ')
  if (key === 'maxPrice' && v === '50000') return 'Under $50K'
  if (key === 'priceDropOnly') return 'Price drops'
  if (key === 'addedToday') return 'New today'
  if (key === 'dealScore') return `Deal: ${v}`
  if (key === 'q') return `Search: ${v}`
  if (key === 'make') return `Make: ${v}`
  if (key === 'modelFamily') return `Model: ${v}`
  if (key === 'minPrice') return `Min $${Number(v).toLocaleString('en-US')}`
  if (key === 'location') return `Location: ${v}`
  if (key === 'minEngine') return `Engine score ≥ ${v}`
  if (key === 'minAvionics') return `Avionics score ≥ ${v}`
  if (key === 'minQuality') return `Quality score ≥ ${v}`
  if (key === 'minValue') return `Market score ≥ ${v}`
  if (key === 'maxValueScore') return `Max total score ≤ ${v}`
  if (key === 'minValueScore') return `Min total score ≥ ${v}`
  if (key === 'engineLife') return `Engine life: ${v.replace(/,/g, ', ')}`
  if (key === 'avionics') return `Avionics: ${v.replace(/,/g, ', ')}`
  if (key === 'dealPattern') return `Deal pattern: ${v.replace(/,/g, ', ')}`
  if (key === 'hidePriceUndisclosed') return 'Priced only'
  if (key === 'priceStatus' && v === 'priced') return 'Priced listings'
  if (key === 'yearMin') return `Year from ${v}`
  if (key === 'yearMax') return `Year to ${v}`
  if (key === 'totalTimeMin') return `TT from ${Number(v).toLocaleString('en-US')} h`
  if (key === 'totalTimeMax') return `TT to ${Number(v).toLocaleString('en-US')} h`
  if (key === 'maintenanceBand') return `Maint.: ${v}`
  if (key === 'engineTime') return `Engine time: ${v}`
  if (key === 'trueCostMin') return `True cost from $${Number(v).toLocaleString('en-US')}`
  if (key === 'trueCostMax') return `True cost to $${Number(v).toLocaleString('en-US')}`
  if (key === 'sortBy') {
    const labels: Record<string, string> = {
      price_low: 'Sort: Price low',
      price_high: 'Sort: Price high',
      deal_desc: 'Sort: Best deal',
      market_best: 'Sort: Best market delta',
      market_worst: 'Sort: Worst market delta',
      risk_low: 'Sort: Risk low first',
      risk_high: 'Sort: Risk high first',
      deferred_low: 'Sort: Deferred low',
      deferred_high: 'Sort: Deferred high',
      tt_low: 'Sort: TT low',
      tt_high: 'Sort: TT high',
      year_newest: 'Sort: Year newest',
      year_oldest: 'Sort: Year oldest',
      engine_life: 'Sort: Engine life',
      dom_asc: 'Sort: Days on market',
      recent_add: 'Sort: Recently added',
    }
    return labels[v] ?? `Sort: ${v}`
  }
  if (key === 'pageSize') return `Per page: ${v}`
  return `${key}=${v}`
}

export default function ListingsMetaBar({ totalFiltered }: { totalFiltered: number }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const chips: Array<{ key: string; label: string }> = []
  for (const key of TRACKED) {
    const v = searchParams.get(key)
    if (!v || v === 'false') continue
    if (key === 'sortBy' && v === 'deal_desc') continue
    if (key === 'pageSize' && v === '24') continue
    chips.push({ key, label: labelForKey(key, searchParams) })
  }

  function clearAll() {
    router.push('/listings')
  }

  function removeChip(key: string) {
    const next = new URLSearchParams(searchParams.toString())
    next.delete(key)
    if (key === 'hidePriceUndisclosed') next.delete('hidePriceUndisclosed')
    next.delete('page')
    router.push(`/listings${next.toString() ? `?${next.toString()}` : ''}`)
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
      <span className="text-sm text-[var(--fh-text-dim)]" style={{ fontFamily: 'var(--font-dm-sans)' }}>
        <span className="font-semibold text-[var(--fh-text)]">{totalFiltered.toLocaleString('en-US')}</span>{' '}
        listings
      </span>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => removeChip(c.key)}
          className="rounded-full border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2.5 py-0.5 text-[11px] text-[var(--fh-text-dim)] hover:border-[var(--fh-orange)]"
        >
          {c.label}{' '}
          <span aria-hidden>×</span>
        </button>
      ))}
      {chips.length > 0 ? (
        <button
          type="button"
          onClick={clearAll}
          className="text-xs font-semibold text-[var(--fh-orange)] hover:underline"
        >
          Clear all
        </button>
      ) : null}
      <div className="ml-auto shrink-0">
        <SaveListingsSearchButton />
      </div>
    </div>
  )
}
