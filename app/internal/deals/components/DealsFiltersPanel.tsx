const DEAL_TIERS = ['EXCEPTIONAL_DEAL', 'GOOD_DEAL', 'FAIR_MARKET', 'ABOVE_MARKET', 'OVERPRICED'] as const

type DealsFiltersPanelProps = {
  maxPrice: number
  setMaxPrice: (value: number) => void
  selectedTiers: Set<string>
  toggleTier: (tier: string) => void
  selectedMakes: string[]
  setSelectedMakes: (makes: string[]) => void
  makeOptions: string[]
  minAvionicsScore: number
  setMinAvionicsScore: (value: number) => void
  excludeNoPrice: boolean
  setExcludeNoPrice: (value: boolean) => void
  hasNNumberOnly: boolean
  setHasNNumberOnly: (value: boolean) => void
  faaAlertsOnly: boolean
  setFaaAlertsOnly: (value: boolean) => void
  highPriorityOnly: boolean
  setHighPriorityOnly: (value: boolean) => void
  toTierBadgeText: (tier: string) => string
}

export default function DealsFiltersPanel({
  maxPrice,
  setMaxPrice,
  selectedTiers,
  toggleTier,
  selectedMakes,
  setSelectedMakes,
  makeOptions,
  minAvionicsScore,
  setMinAvionicsScore,
  excludeNoPrice,
  setExcludeNoPrice,
  hasNNumberOnly,
  setHasNNumberOnly,
  faaAlertsOnly,
  setFaaAlertsOnly,
  highPriorityOnly,
  setHighPriorityOnly,
  toTierBadgeText,
}: DealsFiltersPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-2 text-xs text-brand-muted md:grid-cols-2 lg:grid-cols-3">
      <label className="rounded border border-brand-dark bg-[#171717] p-2">
        Max price: <span className="font-bold text-white">${maxPrice.toLocaleString()}</span>
        <input
          type="range"
          min={0}
          max={60000}
          step={500}
          value={maxPrice}
          onChange={(event) => setMaxPrice(Number(event.target.value))}
          className="mt-1 w-full"
        />
      </label>

      <fieldset className="rounded border border-brand-dark bg-[#171717] p-2">
        <legend className="px-1 text-xs text-brand-muted">Deal tier</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {DEAL_TIERS.map((tier) => (
            <label key={tier} className="inline-flex items-center gap-1">
              <input type="checkbox" checked={selectedTiers.has(tier)} onChange={() => toggleTier(tier)} />
              <span>{toTierBadgeText(tier)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="rounded border border-brand-dark bg-[#171717] p-2">
        Make (multi-select)
        <select
          multiple
          value={selectedMakes}
          onChange={(event) => {
            const options = Array.from(event.target.selectedOptions).map((option) => option.value)
            setSelectedMakes(options)
          }}
          className="mt-1 block h-24 w-full rounded border border-brand-dark bg-[#0f0f0f] p-1 text-xs text-white"
        >
          {makeOptions.map((make) => (
            <option key={make} value={make}>
              {make}
            </option>
          ))}
        </select>
      </label>

      <label className="rounded border border-brand-dark bg-[#171717] p-2">
        Min avionics score: <span className="font-bold text-white">{minAvionicsScore}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={minAvionicsScore}
          onChange={(event) => setMinAvionicsScore(Number(event.target.value))}
          className="mt-1 w-full"
        />
      </label>

      <label className="inline-flex items-center gap-2 rounded border border-brand-dark bg-[#171717] p-2">
        <input type="checkbox" checked={excludeNoPrice} onChange={(event) => setExcludeNoPrice(event.target.checked)} />
        Exclude no-price listings
      </label>

      <label className="inline-flex items-center gap-2 rounded border border-brand-dark bg-[#171717] p-2">
        <input type="checkbox" checked={hasNNumberOnly} onChange={(event) => setHasNNumberOnly(event.target.checked)} />
        Has N-number
      </label>

      <label className="inline-flex items-center gap-2 rounded border border-brand-dark bg-[#171717] p-2">
        <input type="checkbox" checked={faaAlertsOnly} onChange={(event) => setFaaAlertsOnly(event.target.checked)} />
        FAA alerts only
      </label>

      <label className="inline-flex items-center gap-2 rounded border border-brand-dark bg-[#171717] p-2">
        <input type="checkbox" checked={highPriorityOnly} onChange={(event) => setHighPriorityOnly(event.target.checked)} />
        High-priority only (reduced or 90+ days listed)
      </label>
    </div>
  )
}
