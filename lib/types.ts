export type AircraftListing = {
  id: string
  title: string | null
  year: number | null
  make: string | null
  model: string | null
  source: string | null
  source_id: string | null
  url: string | null
  listing_url: string | null
  price_asking: number | null
  asking_price: number | null
  value_score: number | null
  engine_score: number | null
  prop_score: number | null
  llp_score: number | null
  risk_level: string | null
  deferred_total: number | null
  true_cost: number | null
  intelligence_version: string | null
  location_city: string | null
  location_state: string | null
  location_label: string | null
  n_number: string | null
  serial_number: string | null
  primary_image_url: string | null
  faa_registration_alert: string | null
  description: string | null
  description_full: string | null
  total_time_airframe: number | null
  engine_time_since_overhaul: number | null
  time_since_overhaul: number | null
  engine_tbo_hours: number | null
  time_since_new_engine: number | null
  time_since_prop_overhaul: number | null
}
