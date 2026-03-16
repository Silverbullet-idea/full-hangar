import type { PresetKey, SortKey } from '../types'

type DealsControlsBarProps = {
  activeTab: 'all' | 'priority' | 'watchlist'
  setActiveTab: (tab: 'all' | 'priority' | 'watchlist') => void
  filteredCount: number
  priorityCount: number
  watchlistCount: number
  sortKey: SortKey
  setSortKey: (sort: SortKey) => void
  activePreset: PresetKey
  applyPreset: (preset: PresetKey) => void
}

export default function DealsControlsBar({
  activeTab,
  setActiveTab,
  filteredCount,
  priorityCount,
  watchlistCount,
  sortKey,
  setSortKey,
  activePreset,
  applyPreset,
}: DealsControlsBarProps) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setActiveTab('all')}
        className={`rounded px-2 py-1 text-xs font-bold ${activeTab === 'all' ? 'bg-brand-orange text-black' : 'bg-[#222] text-brand-muted'}`}
      >
        All Deals ({filteredCount})
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('priority')}
        className={`rounded px-2 py-1 text-xs font-bold ${activeTab === 'priority' ? 'bg-brand-orange text-black' : 'bg-[#222] text-brand-muted'}`}
      >
        Priority ({priorityCount})
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('watchlist')}
        className={`rounded px-2 py-1 text-xs font-bold ${activeTab === 'watchlist' ? 'bg-brand-orange text-black' : 'bg-[#222] text-brand-muted'}`}
      >
        Watchlist ({watchlistCount})
      </button>
      <select
        value={sortKey}
        onChange={(event) => setSortKey(event.target.value as SortKey)}
        className="rounded border border-[#3A4454] bg-[#141922] px-2 py-1 text-xs text-white"
      >
        <option value="deal_rating">Sort: Deal score</option>
        <option value="vs_median_price">Sort: % below market</option>
        <option value="days_on_market">Sort: Days listed</option>
        <option value="price_reduction_amount">Sort: Price reduction</option>
        <option value="component_gap_value">Sort: Component gap</option>
      </select>
      <button
        type="button"
        onClick={() => applyPreset('flip_fast')}
        className={`rounded px-2 py-1 text-xs font-bold ${activePreset === 'flip_fast' ? 'bg-[#FF9900] text-black' : 'bg-[#222] text-brand-muted'}`}
      >
        Preset: Flip Fast
      </button>
      <button
        type="button"
        onClick={() => applyPreset('motivated_sellers')}
        className={`rounded px-2 py-1 text-xs font-bold ${activePreset === 'motivated_sellers' ? 'bg-[#FF9900] text-black' : 'bg-[#222] text-brand-muted'}`}
      >
        Preset: Motivated
      </button>
      <button
        type="button"
        onClick={() => applyPreset('price_call_followup')}
        className={`rounded px-2 py-1 text-xs font-bold ${activePreset === 'price_call_followup' ? 'bg-[#FF9900] text-black' : 'bg-[#222] text-brand-muted'}`}
      >
        Preset: Call/Reduce
      </button>
      <button
        type="button"
        onClick={() => applyPreset('none')}
        className="rounded border border-[#3A4454] px-2 py-1 text-xs text-brand-muted hover:border-[#FF9900] hover:text-[#FF9900]"
      >
        Reset Preset
      </button>
      <a
        href="/internal/deal-desk"
        className="rounded border border-brand-dark px-2 py-1 text-xs text-brand-muted hover:border-brand-orange hover:text-brand-orange"
      >
        🧮 Deal Desk
      </a>
      <a
        href="/internal/market-intel"
        className="rounded border border-brand-dark px-2 py-1 text-xs text-brand-muted hover:border-brand-orange hover:text-brand-orange"
      >
        📈 Market Intel
      </a>
    </div>
  )
}
