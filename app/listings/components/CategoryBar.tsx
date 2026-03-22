'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { CategoryValue } from './listingsClientUtils'

type Counts = {
  all: number
  single: number
  multi: number
  turboprop: number
  jet: number
  helicopter: number
}

function mergeParams(
  params: URLSearchParams,
  updates: Record<string, string | null>
): URLSearchParams {
  const next = new URLSearchParams(params.toString())
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
  }
  next.delete('page')
  return next
}

type CategoryBarProps = {
  counts: Counts
}

const PILLS: Array<{
  key: string
  label: string
  category: CategoryValue
  quick?: 'under50k' | 'priceDrops' | 'newToday'
}> = [
  { key: 'all', label: 'All Aircraft', category: null },
  { key: 'single', label: '✈ Single Engine', category: 'single' },
  { key: 'multi', label: '✈✈ Multi-Engine', category: 'multi' },
  { key: 'turboprop', label: '⚙ Turboprop', category: 'turboprop' as CategoryValue },
  { key: 'jet', label: '🚀 Jets', category: 'jet' },
  { key: 'heli', label: '🚁 Helicopters', category: 'helicopter' },
  { key: 'under50k', label: '🔥 Under $50K', category: null, quick: 'under50k' },
  { key: 'drops', label: '⚡ Price Drops', category: null, quick: 'priceDrops' },
  { key: 'new', label: '📅 New Today', category: null, quick: 'newToday' },
]

export default function CategoryBar({ counts }: CategoryBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const activeCategory = (searchParams.get('category') ?? '').toLowerCase()
  const maxPrice = searchParams.get('maxPrice') ?? ''
  const priceDrop = searchParams.get('priceDropOnly') ?? ''
  const addedToday = searchParams.get('addedToday') ?? ''

  function navigate(updates: Record<string, string | null>) {
    const next = mergeParams(searchParams, updates)
    router.push(`/listings${next.toString() ? `?${next.toString()}` : ''}`)
  }

  function pillCount(p: (typeof PILLS)[number]): number {
    if (p.quick === 'under50k') return 0
    if (p.quick === 'priceDrops') return 0
    if (p.quick === 'newToday') return 0
    if (!p.category) return counts.all
    if (p.category === 'turboprop') return counts.turboprop
    return counts[p.category as keyof Counts] ?? 0
  }

  function isActive(p: (typeof PILLS)[number]): boolean {
    if (p.quick === 'under50k') return maxPrice === '50000'
    if (p.quick === 'priceDrops') return priceDrop === 'true'
    if (p.quick === 'newToday') return addedToday === 'true'
    if (!p.category) return !activeCategory
    return activeCategory === p.category
  }

  function onPillClick(p: (typeof PILLS)[number]) {
    if (p.quick === 'under50k') {
      navigate({ maxPrice: '50000', category: null, priceDropOnly: null, addedToday: null })
      return
    }
    if (p.quick === 'priceDrops') {
      navigate({ priceDropOnly: 'true', maxPrice: null, addedToday: null })
      return
    }
    if (p.quick === 'newToday') {
      navigate({ addedToday: 'true', maxPrice: null, priceDropOnly: null })
      return
    }
    if (!p.category) {
      navigate({ category: null })
      return
    }
    navigate({ category: p.category, maxPrice: null, priceDropOnly: null, addedToday: null })
  }

  const aircraftPills = PILLS.filter((p) => !p.quick)
  const quickPills = PILLS.filter((p) => p.quick)

  return (
    <div className="fh-category-bar border-b border-[var(--fh-border)] bg-[var(--fh-bg2)] px-5 py-2.5">
      <div className="fh-category-scroll flex items-center gap-2 overflow-x-auto pb-0.5">
        <span
          className="shrink-0 font-bold uppercase tracking-[1.5px] text-[var(--fh-text-muted)]"
          style={{ fontFamily: 'var(--font-barlow-condensed), system-ui', fontSize: '10px' }}
        >
          Category
        </span>
        {aircraftPills.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPillClick(p)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              isActive(p)
                ? 'border-[var(--fh-orange)] bg-[var(--fh-orange-dim)] font-semibold text-[var(--fh-orange)]'
                : 'border-[var(--fh-border)] text-[var(--fh-text-dim)]'
            }`}
            style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
          >
            {p.label}{' '}
            <span className="tabular-nums opacity-80">({pillCount(p).toLocaleString('en-US')})</span>
          </button>
        ))}
        <div
          className="mx-1 hidden h-6 w-px shrink-0 bg-[var(--fh-border)] sm:block"
          aria-hidden
        />
        {quickPills.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPillClick(p)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              isActive(p)
                ? 'border-[var(--fh-orange)] bg-[var(--fh-orange-dim)] font-semibold text-[var(--fh-orange)]'
                : 'border-[var(--fh-border)] text-[var(--fh-text-dim)]'
            }`}
            style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
