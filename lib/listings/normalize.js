/**
 * Normalize row shape differences across scraper versions.
 * Keeps UI resilient while ingestion schema is still evolving.
 * @param {Record<string, any>} row
 */
export function normalizeListingRow(row) {
  const askingPrice = toNumber(row.asking_price) ?? toNumber(row.price_asking)
  const source = toText(row.source) ?? toText(row.source_site)
  const listingUrl = toText(row.listing_url) ?? toText(row.source_url) ?? toText(row.url)
  const city = toText(row.location_city)
  const state = toText(row.location_state)
  const locationRaw = toText(row.location_raw)
  const locationLabel = toText(row.location_label) ?? locationRaw ?? [city, state].filter(Boolean).join(", ") || null
  const year = toNumber(row.year)
  const make = toText(row.make)
  const model = toText(row.model)
  const title = toText(row.title) ?? [year, make, model].filter(Boolean).join(" ").trim() || "Untitled Listing"

  return {
    id: String(row.id ?? row.source_id ?? ""),
    title,
    year,
    make,
    model,
    source,
    sourceId: toText(row.source_id),
    listingUrl,
    askingPrice,
    deferredTotal: toNumber(row.deferred_total),
    trueCost: toNumber(row.true_cost),
    valueScore: toNumber(row.value_score),
    engineScore: toNumber(row.engine_score),
    propScore: toNumber(row.prop_score),
    llpScore: toNumber(row.llp_score),
    riskLevel: toText(row.risk_level),
    intelligenceVersion: toText(row.intelligence_version),
    primaryImageUrl: toText(row.primary_image_url),
    locationLabel,
    nNumber: toText(row.n_number),
    description: toText(row.description),
    descriptionFull: toText(row.description_full),
    totalTimeAirframe: toNumber(row.total_time_airframe),
    timeSinceOverhaul: toNumber(row.time_since_overhaul),
    timeSinceNewEngine: toNumber(row.time_since_new_engine),
    timeSincePropOverhaul: toNumber(row.time_since_prop_overhaul),
  }
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toText(value) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}
