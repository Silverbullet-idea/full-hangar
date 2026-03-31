import type { CategoryValue } from './listingsClientUtils'

export type CategoryBarCounts = {
  all: number
  single: number
  multi: number
  turboprop: number
  jet: number
  helicopter: number
}

export type CategoryNavPill =
  | { key: string; label: string; kind: 'all' }
  | { key: string; label: string; kind: 'category'; category: CategoryValue }
  | { key: string; label: string; kind: 'quick'; quick: 'under50k' | 'priceDrops' | 'newToday' }

export const LISTINGS_CATEGORY_NAV_PILLS: CategoryNavPill[] = [
  { key: 'all', label: 'All Aircraft', kind: 'all' },
  { key: 'single', label: '✈ Single Engine', kind: 'category', category: 'single' },
  { key: 'multi', label: '✈✈ Multi-Engine', kind: 'category', category: 'multi' },
  { key: 'turboprop', label: '⚙ Turboprop', kind: 'category', category: 'turboprop' },
  { key: 'jet', label: '🚀 Jets', kind: 'category', category: 'jet' },
  { key: 'heli', label: '🚁 Helicopters', kind: 'category', category: 'helicopter' },
  { key: 'under50k', label: '🔥 Under $50K', kind: 'quick', quick: 'under50k' },
  { key: 'drops', label: '⚡ Price Drops', kind: 'quick', quick: 'priceDrops' },
  { key: 'new', label: '📅 New Today', kind: 'quick', quick: 'newToday' },
]

export function mergeListingsQueryParams(
  base: { toString(): string },
  updates: Record<string, string | null>
): URLSearchParams {
  const next = new URLSearchParams(base.toString())
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
  }
  next.delete('page')
  return next
}

export function categoryNavPillCount(p: CategoryNavPill, counts: CategoryBarCounts): number {
  if (p.kind === 'quick') return 0
  if (p.kind === 'all') return counts.all
  if (p.category === 'turboprop') return counts.turboprop
  return counts[p.category as keyof CategoryBarCounts] ?? 0
}

export function buildCategoryNavUpdates(p: CategoryNavPill): Record<string, string | null> {
  if (p.kind === 'quick') {
    if (p.quick === 'under50k') {
      return { maxPrice: '50000', category: null, priceDropOnly: null, addedToday: null }
    }
    if (p.quick === 'priceDrops') {
      return { priceDropOnly: 'true', maxPrice: null, addedToday: null }
    }
    return { addedToday: 'true', maxPrice: null, priceDropOnly: null }
  }
  if (p.kind === 'all') {
    return { category: null }
  }
  return { category: p.category, maxPrice: null, priceDropOnly: null, addedToday: null }
}

export function categoryNavPillIsActive(
  p: CategoryNavPill,
  activeCategory: string,
  maxPrice: string,
  priceDropOnly: string,
  addedToday: string
): boolean {
  if (p.kind === 'quick') {
    if (p.quick === 'under50k') return maxPrice === '50000'
    if (p.quick === 'priceDrops') return priceDropOnly === 'true'
    return addedToday === 'true'
  }
  if (p.kind === 'all') return !activeCategory
  return activeCategory === p.category
}
