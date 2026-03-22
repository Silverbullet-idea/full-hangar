'use client'

import { useRouter, useSearchParams } from 'next/navigation'

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
  return `${key}=${v}`
}

export default function ListingsMetaBar({ totalFiltered }: { totalFiltered: number }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const chips: Array<{ key: string; label: string }> = []
  for (const key of TRACKED) {
    const v = searchParams.get(key)
    if (v && v !== 'false' && v !== '') {
      chips.push({ key, label: labelForKey(key, searchParams) })
    }
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
    </div>
  )
}
