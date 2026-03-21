import type { ReactNode } from 'react'

export type DealListing = {
  id: string
  source_id: string | null
  year: number | null
  make: string | null
  model: string | null
  asking_price: number | null
  price_asking: number | null
  deal_rating: number | null
  deal_tier: string | null
  vs_median_price: number | null
  total_time_airframe: number | null
  time_since_overhaul: number | null
  avionics_score: number | null
  avionics_installed_value: number | null
  location_city: string | null
  location_state: string | null
  location_label: string | null
  days_on_market: number | null
  price_reduced: boolean | null
  price_reduction_amount: number | null
  faa_registration_alert: string | null
  listing_url: string | null
  url: string | null
  n_number: string | null
  comps_sample_size: number | null
  deal_comparison_source: string | null
  risk_level: string | null
  description: string | null
  description_full: string | null
  created_at?: string | null
  scraped_at?: string | null
  listing_date?: string | null
  updated_at?: string | null
  normalized_engine_value?: number | null
  sold_engine_median_price?: number | null
  engine_remaining_time_factor?: number | null
  avionics_bundle_multiplier?: number | null
  avionics_bundle_adjusted_value?: number | null
  estimated_component_value?: number | null
  component_gap_value?: number | null
  flip_candidate_triggered?: boolean | null
  flip_candidate_threshold?: number | null
  deferred_total?: number | null
  engine_hours_smoh?: number | null
  engine_tbo_hours?: number | null
  ev_hours_smoh?: number | null
  ev_tbo_hours?: number | null
  ev_hours_remaining?: number | null
  ev_pct_life_remaining?: number | null
  ev_engine_overrun_liability?: number | null
  ev_engine_reserve_per_hour?: number | null
  ev_data_quality?: string | null
}

export type WatchlistEntry = {
  note: string
}

export type RecentSoldRecord = {
  id: string
  n_number: string | null
  listing_id: string | null
  old_owner: string | null
  new_owner: string | null
  old_cert_date: string | null
  new_cert_date: string | null
  detected_at: string | null
  asking_price_at_detection: number | null
  estimated_sale_price: number | null
  estimation_method: string | null
  notes: string | null
  listing?: {
    id: string
    make: string | null
    model: string | null
    year: number | null
    days_on_market: number | null
  } | null
}

export type SortKey =
  | 'deal_rating'
  | 'vs_median_price'
  | 'days_on_market'
  | 'price_reduction_amount'
  | 'component_gap_value'
  | 'engine_life_desc'
  | 'engine_life_asc'

export type PresetKey = 'none' | 'flip_fast' | 'motivated_sellers' | 'price_call_followup'

export type DealExplanation = {
  price: string
  engine: string
  avionics: string
  component: string
  deferred: string
  risk: string
  recommendation: string
}

export type VsMarketRenderer = (value: number | null) => ReactNode
