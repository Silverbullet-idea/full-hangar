'use client'

import { useRouter, useSearchParams } from 'next/navigation'

type FlipTierKey = 'top' | 'hot' | 'good' | 'fair'

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

const TIERS: Array<{ id: FlipTierKey; dealTier: string; label: string; sub: string }> = [
  { id: 'top', dealTier: 'TOP_DEALS', label: 'TOP', sub: 'HOT+GOOD' },
  { id: 'hot', dealTier: 'HOT', label: 'HOT', sub: 'top flips' },
  { id: 'good', dealTier: 'GOOD', label: 'GOOD', sub: 'solid' },
  { id: 'fair', dealTier: 'FAIR', label: 'FAIR', sub: 'worth a look' },
]

function rawTierToKey(raw: string): FlipTierKey | null {
  if (raw === 'TOP_DEALS') return 'top'
  if (raw === 'HOT') return 'hot'
  if (raw === 'GOOD') return 'good'
  if (raw === 'FAIR') return 'fair'
  return null
}

export default function DealTierBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTier = (searchParams.get('dealTier') ?? '').trim().toUpperCase()
  const activeTier = rawTierToKey(rawTier)

  function push(updates: Record<string, string | null>) {
    const next = mergeParams(searchParams, updates)
    router.push(`/listings${next.toString() ? `?${next.toString()}` : ''}`)
  }

  function tierStyle(id: FlipTierKey, active: boolean): string {
    const base =
      'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors'
    if (id === 'hot') {
      return `${base} ${active ? 'border-[#f97316] bg-[rgba(249,115,22,0.2)] text-[#f97316]' : 'border-[rgba(249,115,22,0.35)] bg-[rgba(249,115,22,0.08)] text-[#f97316]'}`
    }
    if (id === 'good') {
      return `${base} ${active ? 'border-[#10b981] bg-[rgba(16,185,129,0.2)] text-[#10b981]' : 'border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.08)] text-[#10b981]'}`
    }
    if (id === 'fair') {
      return `${base} ${active ? 'border-[#fbbf24] bg-[rgba(251,191,36,0.2)] text-[#fbbf24]' : 'border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.08)] text-[#fbbf24]'}`
    }
    return `${base} ${active ? 'border-[#FF9900] bg-[rgba(255,153,0,0.2)] text-[#FF9900]' : 'border-[rgba(255,153,0,0.35)] bg-[rgba(255,153,0,0.1)] text-[#FF9900]'}`
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
                if (active) {
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
    </div>
  )
}
