import type { SellerFormData } from "@/lib/sell/sellerFormTypes"

export type PlatformStatus =
  | "queued"
  | "posting"
  | "live"
  | "failed"
  | "removed"
  | "unsupported"

export type ListingStatus = "active" | "sold" | "expired" | "taken_down"

export type Platform = "controller" | "tradaplane" | "aso" | "barnstormers" | "avbuyer"

export const PLATFORMS: Platform[] = [
  "controller",
  "tradaplane",
  "aso",
  "barnstormers",
  "avbuyer",
]

export const PLATFORM_LABELS: Record<Platform, string> = {
  controller: "Controller",
  tradaplane: "Trade-A-Plane",
  aso: "ASO",
  barnstormers: "Barnstormers",
  avbuyer: "AvBuyer",
}

export interface PlatformStatusRow {
  platform: Platform
  status: PlatformStatus
  external_listing_url: string | null
  error_message: string | null
  last_confirmed_at: string | null
}

export interface SellerListingSummary {
  id: string
  year: number | null
  make: string | null
  model: string | null
  model_suffix: string | null
  n_number: string | null
  city: string | null
  state: string | null
  airport_id: string | null
  asking_price: number | null
  currency: string
  call_for_price: boolean
  listing_status: ListingStatus
  sold_price: number | null
  sold_date: string | null
  sold_via_platform: string | null
  created_at: string
  taken_down_at: string | null
  platform_statuses: PlatformStatusRow[]
  days_on_market: number
  aircraft_label: string
}

export interface SellerListingDetail {
  id: string
  year: number | null
  make: string | null
  model: string | null
  model_suffix: string | null
  n_number: string | null
  city: string | null
  state: string | null
  airport_id: string | null
  asking_price: number | null
  currency: string
  call_for_price: boolean
  listing_status: ListingStatus
  sold_price: number | null
  sold_date: string | null
  sold_via_platform: string | null
  created_at: string
  taken_down_at: string | null
  form_payload: SellerFormData | null
  description_intelligence: Record<string, unknown> | null
  platform_statuses: PlatformStatusRow[]
  days_on_market: number
  aircraft_label: string
}
