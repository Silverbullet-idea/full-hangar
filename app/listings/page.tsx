'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ListingsPage() {
  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [riskFilter, setRiskFilter] = useState('all')
  const [minimumScore, setMinimumScore] = useState(0)

  useEffect(() => {
    supabase
      .from('public_listings')
      .select(
        'id, source_id, make, model, year, asking_price, value_score, risk_level, total_time_airframe, location_label, deferred_total, primary_image_url, time_since_overhaul'
      )
      .not('value_score', 'is', null)
      .order('value_score', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (data) setListings(data)
        if (error) console.error('Failed to fetch listings:', JSON.stringify(error))
        setLoading(false)
      })
  }, [])

  const filteredListings = listings.filter((listing) => {
    const score = listing.value_score ?? 0
    if (score < minimumScore) return false

    if (riskFilter === 'all') return true
    return (listing.risk_level ?? '').toLowerCase() === riskFilter
  })

  const getValueScoreClasses = (valueScore: number) => {
    if (valueScore >= 80) return 'bg-brand-orange text-brand-black'
    if (valueScore >= 60) return 'bg-brand-burn text-white'
    if (valueScore >= 40) return 'bg-brand-dark text-brand-muted'
    return 'bg-red-900 text-red-300'
  }

  if (loading) return <div className="text-brand-muted">Loading listings...</div>

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Aircraft For Sale</h1>
          <p className="text-sm text-brand-muted">
            Premium market intelligence across {filteredListings.length} of {listings.length} listings
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="text-xs text-brand-muted">
            Risk Level
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="mt-1 block w-full rounded border border-brand-dark bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
            >
              <option value="all">All</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="text-xs text-brand-muted">
            Minimum Value Score
            <select
              value={minimumScore}
              onChange={(e) => setMinimumScore(Number(e.target.value))}
              className="mt-1 block w-full rounded border border-brand-dark bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
            >
              <option value={0}>Any score</option>
              <option value={60}>60+</option>
              <option value={80}>80+</option>
            </select>
          </label>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredListings.map((l) => (
          <a
            key={l.source_id ?? l.id}
            href={`/listings/${l.source_id ?? l.id}`}
            className="block rounded-lg border border-brand-dark bg-[#1a1a1a] p-4 transition-colors hover:border-brand-burn"
          >
            {l.primary_image_url && (
              <img src={l.primary_image_url} alt="" className="mb-3 h-48 w-full rounded object-cover" />
            )}
            <div className="font-semibold text-white">
              {l.year} {l.make} {l.model}
            </div>
            <div className="text-sm text-brand-muted">{l.location_label ?? 'Location unavailable'}</div>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-bold text-brand-orange">
                {l.asking_price ? '$' + Number(l.asking_price).toLocaleString() : 'Call for Price'}
              </span>
              <span
                className={`rounded px-2 py-1 text-xs font-semibold ${getValueScoreClasses(l.value_score ?? 0)}`}
              >
                {l.value_score?.toFixed(1)}
              </span>
            </div>
            <div className="mt-1 text-xs text-brand-muted">
              {l.total_time_airframe ?? '-'} TT · SMOH {l.time_since_overhaul ?? '-'}
            </div>
            {l.risk_level && (
              <div className={`mt-1 text-xs font-medium ${String(l.risk_level).toLowerCase() === 'critical' ? 'text-red-500' : 'text-brand-burn'}`}>
                {String(l.risk_level).toUpperCase()} RISK
              </div>
            )}
            {l.deferred_total > 0 && (
              <div className="mt-1 text-xs text-brand-orange">${l.deferred_total.toLocaleString()} deferred</div>
            )}
          </a>
        ))}
      </div>
      {!filteredListings.length && (
        <div className="mt-8 rounded-lg border border-brand-dark bg-[#1a1a1a] p-6 text-center text-brand-muted">
          No listings match the current filters.
        </div>
      )}
    </div>
  )
}
