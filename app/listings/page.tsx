'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CATEGORIES = [
  { label: 'All Aircraft', value: null },
  { label: 'Single Engine', value: 'single' },
  { label: 'Multi-Engine', value: 'multi' },
  { label: 'Turboprop', value: 'turboprop' },
  { label: 'Jet', value: 'jet' },
  { label: 'Helicopter', value: 'helicopter' },
  { label: 'Light Sport', value: 'lsp' },
  { label: 'Amphibian / Sea', value: 'sea' },
] as const

type CategoryValue = (typeof CATEGORIES)[number]['value']

const containsAny = (text: string, terms: string[]) => {
  const normalizedText = text.toLowerCase()
  return terms.some((term) => normalizedText.includes(term.toLowerCase()))
}

const makeIsAny = (make: string, makes: string[]) => {
  const normalizedMake = make.trim().toLowerCase()
  return makes.some((m) => normalizedMake === m.toLowerCase())
}

const matchesAircraftCategory = (listing: any, category: Exclude<CategoryValue, null>) => {
  const make = String(listing.make ?? '')
  const model = String(listing.model ?? '')
  const faaType = String(listing.faa_type_aircraft ?? '').trim()

  // Prefer FAA classification when available for the categories we can map directly.
  if (faaType) {
    if (category === 'single') return faaType === '4'
    if (category === 'multi') return faaType === '5'
    if (category === 'helicopter') return faaType === '6'
    if (category === 'lsp') return faaType === '9'
  }

  if (category === 'single') {
    return !containsAny(make, [
      'Citation',
      'King Air',
      'TBM',
      'Pilatus',
      'Caravan',
      'Phenom',
      'HondaJet',
      'Robinson',
      'Bell',
      'Sikorsky',
      'Eurocopter',
    ])
  }

  if (category === 'multi') {
    return containsAny(model, ['Twin', 'Seneca', 'Aztec', 'Baron', 'Bonanza A36TC', '310', '340', '402', '414', '421'])
  }

  if (category === 'turboprop') {
    return (
      containsAny(make, ['Pilatus', 'TBM', 'Daher']) ||
      containsAny(model, ['King Air', 'Caravan', 'Meridian', 'Kodiak'])
    )
  }

  if (category === 'jet') {
    return containsAny(make, ['Citation']) || containsAny(model, ['Citation', 'Phenom', 'HondaJet', 'Eclipse', 'Premier'])
  }

  if (category === 'helicopter') {
    return makeIsAny(make, ['Robinson', 'Bell', 'Sikorsky', 'Eurocopter', 'Airbus Helicopter', 'MD Helicopters', 'Schweizer'])
  }

  if (category === 'lsp') {
    return containsAny(model, ['LSA', 'Light Sport']) || makeIsAny(make, ['Flight Design', 'Tecnam', 'Jabiru', 'Pipistrel'])
  }

  return containsAny(model, ['Sea', 'Float', 'Amphibian', 'Seaplane'])
}

export default function ListingsPage() {
  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [riskFilter, setRiskFilter] = useState('all')
  const [dealFilter, setDealFilter] = useState('all')
  const [minimumScore, setMinimumScore] = useState(0)
  const [categoryFilter, setCategoryFilter] = useState<CategoryValue>(null)

  useEffect(() => {
    supabase
      .from('public_listings')
      .select(
        'id, source_id, make, model, year, asking_price, value_score, avionics_score, avionics_installed_value, risk_level, total_time_airframe, location_label, deferred_total, primary_image_url, time_since_overhaul, faa_type_aircraft, deal_rating, deal_tier, vs_median_price, is_active'
      )
      .not('value_score', 'is', null)
      .eq('is_active', true)
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

    if (categoryFilter && !matchesAircraftCategory(listing, categoryFilter)) return false

    if (riskFilter !== 'all' && (listing.risk_level ?? '').toLowerCase() !== riskFilter) return false
    if (dealFilter !== 'all' && (listing.deal_tier ?? '').toUpperCase() !== dealFilter) return false
    return true
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
      <div className="mb-6 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Aircraft For Sale</h1>
          <p className="text-sm text-brand-muted">
            Premium market intelligence across {filteredListings.length} of {listings.length} listings
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
          {CATEGORIES.map((category) => {
            const isActive = categoryFilter === category.value
            return (
              <button
                key={category.label}
                type="button"
                onClick={() => setCategoryFilter(category.value)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-[#FF9900] font-bold text-black'
                    : 'border border-[#333333] bg-transparent text-[#B2B2B2] hover:border-[#FF9900] hover:text-[#FF9900]'
                }`}
              >
                {category.label}
              </button>
            )
          })}
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
            Deal Rating
            <select
              value={dealFilter}
              onChange={(e) => setDealFilter(e.target.value)}
              className="mt-1 block w-full rounded border border-brand-dark bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
            >
              <option value="all">All</option>
              <option value="EXCEPTIONAL_DEAL">Exceptional Deals</option>
              <option value="GOOD_DEAL">Good Deals</option>
              <option value="FAIR_MARKET">Fair Market</option>
              <option value="ABOVE_MARKET">Above Market</option>
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
            className={`relative block rounded-lg border border-brand-dark bg-[#1a1a1a] p-4 transition-colors hover:border-brand-burn ${
              String(l.deal_tier ?? '').toUpperCase() === 'EXCEPTIONAL_DEAL' ? 'pt-10' : ''
            }`}
          >
            {String(l.deal_tier ?? '').toUpperCase() === 'EXCEPTIONAL_DEAL' && (
              <div className="absolute left-0 right-0 top-0 rounded-t-lg bg-emerald-700 px-3 py-1 text-center text-xs font-bold tracking-wide text-white">
                🔥 EXCEPTIONAL DEAL
              </div>
            )}
            {l.primary_image_url && (
              <img
                src={`/api/image-proxy?url=${encodeURIComponent(String(l.primary_image_url))}`}
                alt=""
                className={`h-48 w-full rounded object-cover ${String(l.deal_tier ?? '').toUpperCase() === 'EXCEPTIONAL_DEAL' ? 'mb-3 mt-6' : 'mb-3'}`}
              />
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
            {l.avionics_score != null && (
              <div className="mt-1 text-xs text-brand-muted">
                Avionics {Number(l.avionics_score).toFixed(1)}
                {l.avionics_installed_value ? ` · $${Number(l.avionics_installed_value).toLocaleString()} installed` : ""}
              </div>
            )}
            {l.vs_median_price != null && (
              <div className="mt-1 text-xs text-brand-muted">
                {Number(l.vs_median_price) < 0
                  ? `${Math.round(Math.abs(Number(l.vs_median_price)))}% below market median`
                  : `${Math.round(Number(l.vs_median_price))}% above market median`}
              </div>
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
