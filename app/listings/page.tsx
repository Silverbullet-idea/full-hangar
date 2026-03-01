import Link from "next/link"
import { getSupabaseServerClient } from "../../lib/supabase/server"
import type { AircraftListing } from "../../lib/types"

type SearchParams = Record<string, string | string[] | undefined>

const MAKE_OPTIONS = ["All", "Cessna", "Piper", "Beechcraft", "Cirrus", "Mooney"] as const
const RISK_OPTIONS = ["All", "LOW", "MODERATE", "HIGH", "CRITICAL"] as const

export const metadata = {
  title: "Listings | Full-Hangar",
}

function getParamValue(params: SearchParams, key: string) {
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

function parsePositiveNumber(value: string | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normalizeMake(value: string | undefined) {
  if (!value) return "All"
  const matched = MAKE_OPTIONS.find((option) => option.toLowerCase() === value.toLowerCase())
  return matched ?? "All"
}

function normalizeRisk(value: string | undefined) {
  if (!value) return "All"
  const normalized = value.toUpperCase()
  return RISK_OPTIONS.includes(normalized as (typeof RISK_OPTIONS)[number]) ? normalized : "All"
}

function formatPrice(value: number | null) {
  if (typeof value !== "number") return "Call for Price"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
}

function formatDeferred(value: number | null) {
  if (typeof value !== "number" || value <= 0) return null
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
}

function formatHours(value: number | null) {
  if (typeof value !== "number") return "N/A"
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)} hrs`
}

function getValueScoreBadgeClass(score: number | null) {
  if (typeof score !== "number") return "bg-slate-200 text-slate-700"
  if (score >= 80) return "bg-emerald-100 text-emerald-800"
  if (score >= 60) return "bg-yellow-100 text-yellow-800"
  if (score >= 40) return "bg-orange-100 text-orange-800"
  return "bg-red-100 text-red-800"
}

function getRiskBadgeClass(riskLevel: string | null) {
  const risk = (riskLevel || "").toUpperCase()
  if (risk === "LOW") return "bg-emerald-100 text-emerald-800"
  if (risk === "MODERATE") return "bg-yellow-100 text-yellow-800"
  if (risk === "HIGH") return "bg-orange-100 text-orange-800"
  if (risk === "CRITICAL") return "bg-red-100 text-red-800"
  return "bg-slate-200 text-slate-700"
}

export default async function ListingsPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams || {}
  const selectedMake = normalizeMake(getParamValue(params, "make"))
  const selectedRisk = normalizeRisk(getParamValue(params, "risk"))
  const maxPrice = parsePositiveNumber(getParamValue(params, "maxPrice"))
  const sort = getParamValue(params, "sort") || "value_desc"

  const supabase = getSupabaseServerClient()
  let query = supabase.from("public_listings").select(
    "id,source_id,year,make,model,price_asking,value_score,risk_level,total_time_airframe,location_city,location_state,location_label,primary_image_url,deferred_total",
    { count: "exact" }
  )

  if (selectedMake !== "All") query = query.eq("make", selectedMake)
  if (selectedRisk !== "All") query = query.eq("risk_level", selectedRisk)
  if (maxPrice !== null) query = query.lte("price_asking", maxPrice)

  if (sort === "price_asc") {
    query = query.order("price_asking", { ascending: true, nullsFirst: false })
  } else if (sort === "year_desc") {
    query = query.order("year", { ascending: false, nullsFirst: false })
  } else {
    query = query.order("value_score", { ascending: false, nullsFirst: false })
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Failed to fetch listings: ${error.message}`)
  }

  const listings = (data || []) as AircraftListing[]

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Aircraft Listings</h1>
        <p className="mt-2 text-sm text-slate-600">
          {count ?? listings.length} listing{(count ?? listings.length) === 1 ? "" : "s"} matching current filters
        </p>
      </div>

      <form method="get" className="mb-8 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Make</span>
          <select name="make" defaultValue={selectedMake} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900">
            {MAKE_OPTIONS.map((make) => (
              <option key={make} value={make}>
                {make}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Risk Level</span>
          <select name="risk" defaultValue={selectedRisk} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900">
            {RISK_OPTIONS.map((risk) => (
              <option key={risk} value={risk}>
                {risk}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Max Price</span>
          <input
            type="number"
            name="maxPrice"
            min={0}
            step={1000}
            defaultValue={maxPrice ?? ""}
            placeholder="No max"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sort By</span>
          <select name="sort" defaultValue={sort} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900">
            <option value="value_desc">Value Score (desc)</option>
            <option value="price_asc">Price (asc)</option>
            <option value="year_desc">Year (desc)</option>
          </select>
        </label>

        <div className="md:col-span-4 flex items-center gap-3">
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Apply Filters
          </button>
          <Link href="/listings" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Reset
          </Link>
        </div>
      </form>

      {listings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">No listings found for the selected filters.</div>
      ) : (
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => {
            const title = [listing.year, listing.make, listing.model].filter(Boolean).join(" ") || "Unknown Aircraft"
            const location =
              [listing.location_city, listing.location_state].filter(Boolean).join(", ") || listing.location_label || "Location unavailable"
            const deferred = formatDeferred(listing.deferred_total)
            const href = `/listings/${listing.source_id || listing.id}`

            return (
              <Link
                key={`${listing.id ?? "listing"}-${listing.source_id ?? "source"}`}
                href={href}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {listing.primary_image_url ? (
                  <img src={listing.primary_image_url} alt={title} className="h-48 w-full bg-slate-100 object-cover" />
                ) : (
                  <div className="flex h-48 w-full items-center justify-center bg-slate-100 text-sm font-medium text-slate-400">No image available</div>
                )}

                <div className="space-y-3 p-4">
                  <h2 className="line-clamp-2 text-lg font-semibold text-slate-900">{title}</h2>
                  <p className="text-xl font-bold text-slate-900">{formatPrice(listing.price_asking)}</p>

                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getValueScoreBadgeClass(listing.value_score)}`}>
                      Value {typeof listing.value_score === "number" ? Math.round(listing.value_score) : "N/A"}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getRiskBadgeClass(listing.risk_level)}`}>
                      Risk {(listing.risk_level || "N/A").toUpperCase()}
                    </span>
                  </div>

                  <dl className="space-y-1 text-sm text-slate-600">
                    <div className="flex justify-between gap-3">
                      <dt>Total Time Airframe</dt>
                      <dd className="font-medium text-slate-900">{formatHours(listing.total_time_airframe)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Location</dt>
                      <dd className="text-right font-medium text-slate-900">{location}</dd>
                    </div>
                    {deferred ? (
                      <div className="flex justify-between gap-3">
                        <dt>Deferred Maintenance</dt>
                        <dd className="font-medium text-slate-900">{deferred}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              </Link>
            )
          })}
        </section>
      )}
    </main>
  )
}
