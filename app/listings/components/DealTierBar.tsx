'use client'

import { useRouter, useSearchParams } from 'next/navigation'

type FlipTierToken = 'all' | 'top' | 'hot' | 'good' | 'fair' | 'pass'

type SortOption =
  | 'flip_desc'
  | 'flip_asc'
  | 'price_low'
  | 'price_high'
  | 'engine_life'
  | 'dom_asc'
  | 'recent_add'

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

type DealTierBarProps = {
  layoutMode: 'tiles' | 'rows' | 'compact'
  setLayoutMode: (m: 'tiles' | 'rows' | 'compact') => void
  sortBy: string
  /** When set, sort changes update the URL via parent (full filter snapshot + replace). */
  onSortByChange?: (value: string) => void
}

const TIERS: Array<{ id: FlipTierToken; dealTier: string | null; label: string; sub: string }> = [
  { id: 'top', dealTier: 'TOP_DEALS', label: 'TOP', sub: 'HOT+GOOD' },
  { id: 'hot', dealTier: 'HOT', label: 'HOT', sub: 'top flips' },
  { id: 'good', dealTier: 'GOOD', label: 'GOOD', sub: 'solid' },
  { id: 'fair', dealTier: 'FAIR', label: 'FAIR', sub: 'worth a look' },
  { id: 'pass', dealTier: 'PASS', label: 'PASS', sub: 'not competitive' },
  { id: 'all', dealTier: null, label: 'ALL', sub: '' },
]

export default function DealTierBar({ layoutMode, setLayoutMode, sortBy, onSortByChange }: DealTierBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTier = (searchParams.get('dealTier') ?? '').trim().toUpperCase()
  const activeTier: FlipTierToken =
    rawTier === 'TOP_DEALS'
      ? 'top'
      : rawTier === 'HOT'
        ? 'hot'
        : rawTier === 'GOOD'
          ? 'good'
          : rawTier === 'FAIR'
            ? 'fair'
            : rawTier === 'PASS'
              ? 'pass'
              : 'all'
  const hideUndisclosed = searchParams.get('hidePriceUndisclosed') === 'true'

  function push(updates: Record<string, string | null>) {
    const next = mergeParams(searchParams, updates)
    router.push(`/listings${next.toString() ? `?${next.toString()}` : ''}`)
  }

  function tierStyle(id: FlipTierToken, active: boolean): string {
    const base = 'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors'
    if (id === 'hot') {
      return `${base} ${active ? 'border-[#f97316] bg-[rgba(249,115,22,0.2)] text-[#f97316]' : 'border-[rgba(249,115,22,0.35)] bg-[rgba(249,115,22,0.08)] text-[#f97316]'}`
    }
    if (id === 'good') {
      return `${base} ${active ? 'border-[#10b981] bg-[rgba(16,185,129,0.2)] text-[#10b981]' : 'border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.08)] text-[#10b981]'}`
    }
    if (id === 'fair') {
      return `${base} ${active ? 'border-[#fbbf24] bg-[rgba(251,191,36,0.2)] text-[#fbbf24]' : 'border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.08)] text-[#fbbf24]'}`
    }
    if (id === 'pass') {
      return `${base} ${active ? 'border-[#94a3b8] bg-[rgba(148,163,184,0.2)] text-[#94a3b8]' : 'border-[rgba(148,163,184,0.35)] bg-[rgba(148,163,184,0.08)] text-[#94a3b8]'}`
    }
    if (id === 'top') {
      return `${base} ${active ? 'border-[#FF9900] bg-[rgba(255,153,0,0.2)] text-[#FF9900]' : 'border-[rgba(255,153,0,0.35)] bg-[rgba(255,153,0,0.1)] text-[#FF9900]'}`
    }
    return `${base} ${active ? 'border-[var(--fh-text-dim)] bg-[rgba(122,138,158,0.15)] text-[var(--fh-text)]' : 'border-[rgba(122,138,158,0.3)] bg-[rgba(122,138,158,0.1)] text-[var(--fh-text-dim)]'}`
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--fh-border)] bg-[var(--fh-bg)] px-5 py-2">
      <span
        className="mr-1 shrink-0 font-bold uppercase tracking-[1.5px] text-[var(--fh-text-muted)]"
        style={{ fontFamily: 'var(--font-barlow-condensed), system-ui', fontSize: '10px' }}
      >
        Flip tier
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {TIERS.map((t) => {
          const active = activeTier === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (t.dealTier == null) {
                  push({
                    dealTier: null,
                    dealScore: null,
                    minValueScore: null,
                    maxValueScore: null,
                  })
                } else {
                  push({
                    dealTier: t.dealTier,
                    dealScore: null,
                    minValueScore: null,
                    maxValueScore: null,
                  })
                }
              }}
              className={tierStyle(t.id, active)}
              style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
            >
              <span
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: 'currentColor' }}
              />
              {t.label}
              {t.sub ? <span className="font-normal opacity-80">({t.sub})</span> : null}
            </button>
          )
        })}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--fh-text-dim)]" style={{ fontFamily: 'var(--font-dm-sans)' }}>
          <input
            type="checkbox"
            className="fh-checkbox-orange h-3 w-3 rounded border-[var(--fh-border)]"
            checked={hideUndisclosed}
            onChange={(e) => {
              push({ hidePriceUndisclosed: e.target.checked ? 'true' : null })
            }}
          />
          Hide &quot;Call for Price&quot;
        </label>
        <select
          value={sortBy === 'deal_desc' ? 'flip_desc' : sortBy}
          onChange={(e) => {
            const v = e.target.value as SortOption
            if (onSortByChange) {
              onSortByChange(v)
            } else {
              push({ sortBy: v })
            }
          }}
          className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-1.5 text-xs text-[var(--fh-text)]"
          style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
        >
          <option value="flip_desc">Best flip opportunity</option>
          <option value="flip_asc">Flip score (low first)</option>
          <option value="price_low">Price ↑</option>
          <option value="price_high">Price ↓</option>
          <option value="engine_life">Engine Life ↓</option>
          <option value="dom_asc">Days Listed ↑</option>
          <option value="recent_add">Recently Added</option>
        </select>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Grid layout"
            onClick={() => setLayoutMode('tiles')}
            className={`rounded-md border p-1.5 ${layoutMode === 'tiles' ? 'bg-[var(--fh-bg4)] border-[var(--fh-border)]' : 'border-[var(--fh-border)] text-[var(--fh-text-dim)]'}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="List layout"
            onClick={() => setLayoutMode('rows')}
            className={`rounded-md border p-1.5 ${layoutMode === 'rows' ? 'bg-[var(--fh-bg4)] border-[var(--fh-border)]' : 'border-[var(--fh-border)] text-[var(--fh-text-dim)]'}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Compact layout"
            onClick={() => setLayoutMode('compact')}
            className={`rounded-md border p-1.5 ${layoutMode === 'compact' ? 'bg-[var(--fh-bg4)] border-[var(--fh-border)]' : 'border-[var(--fh-border)] text-[var(--fh-text-dim)]'}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M4 5h16v3H4V5zm0 6h10v3H4v-3zm0 6h16v3H4v-3z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
