const TABLE_NAME = "public_listings"
/** @typedef {import("../types").AircraftListing} AircraftListing */

const LIST_COLUMNS = [
  "id",
  "title",
  "year",
  "make",
  "model",
  "source",
  "source_id",
  "url",
  "price_asking",
  "value_score",
  "engine_score",
  "prop_score",
  "llp_score",
  "risk_level",
  "deferred_total",
  "true_cost",
  "intelligence_version",
  "location_label",
  "location_city",
  "location_state",
  "n_number",
  "serial_number",
  "primary_image_url",
  "faa_registration_alert",
].join(",")

const DETAIL_COLUMNS = `${LIST_COLUMNS},description,description_full,total_time_airframe,engine_time_since_overhaul,engine_tbo_hours,time_since_new_engine,time_since_prop_overhaul`

/**
 * @param {URLSearchParams} params
 */
function toInt(params, key, fallback) {
  const value = Number(params.get(key))
  return Number.isFinite(value) ? value : fallback
}

export async function getListings(searchParams) {
  const page = Math.max(1, toInt(searchParams, "page", 1))
  const pageSize = Math.min(48, Math.max(12, toInt(searchParams, "pageSize", 24)))
  const minScore = toInt(searchParams, "minScore", 0)
  const minPrice = toInt(searchParams, "minPrice", 0)
  const maxPrice = toInt(searchParams, "maxPrice", 0)
  const make = searchParams.get("make") || ""
  const risk = (searchParams.get("risk") || "").toUpperCase()
  const sort = searchParams.get("sort") || "value_desc"

  const offset = (page - 1) * pageSize
  const end = offset + pageSize - 1
  const query = new URLSearchParams()
  query.set("select", LIST_COLUMNS)
  query.set("value_score", "not.is.null")
  if (minScore > 0) {
    query.set("value_score", `gte.${minScore}`)
  }
  if (make) {
    query.set("make", `ilike.*${encodeTerm(make)}*`)
  }
  if (risk) {
    query.set("risk_level", `eq.${encodeTerm(risk)}`)
  }
  if (minPrice > 0) {
    query.set("price_asking", `gte.${minPrice}`)
  }
  if (maxPrice > 0) {
    query.set("price_asking", `lte.${maxPrice}`)
  }
  query.set("offset", String(offset))
  query.set("limit", String(pageSize))

  switch (sort) {
    case "deferred_desc":
      query.set("order", "deferred_total.desc.nullslast")
      break
    case "price_asc":
      query.set("order", "price_asking.asc.nullslast")
      break
    case "newest":
      query.set("order", "id.desc")
      break
    default:
      query.set("order", "value_score.desc.nullslast")
      break
  }

  /** @type {AircraftListing[]} */
  const rows = await fetchRows(`/rest/v1/${TABLE_NAME}?${query.toString()}`)
  const items = rows.filter((item) => item.id)
  return {
    items,
    page,
    pageSize,
    hasNextPage: items.length === pageSize,
  }
}

export async function getListingById(id) {
  const query = new URLSearchParams()
  query.set("select", DETAIL_COLUMNS)
  query.set("id", `eq.${id}`)
  query.set("limit", "1")
  /** @type {AircraftListing[]} */
  let rows = await fetchRows(`/rest/v1/${TABLE_NAME}?${query.toString()}`)

  // Support route links based on source_id values from listing cards.
  if (!rows.length) {
    const sourceQuery = new URLSearchParams()
    sourceQuery.set("select", DETAIL_COLUMNS)
    sourceQuery.set("source_id", `eq.${id}`)
    sourceQuery.set("limit", "1")
    rows = await fetchRows(`/rest/v1/${TABLE_NAME}?${sourceQuery.toString()}`)
  }

  if (!rows.length) return null
  return rows[0]
}

export async function getListingRawById(id) {
  const query = new URLSearchParams()
  query.set("select", "*")
  query.set("id", `eq.${id}`)
  query.set("limit", "1")
  /** @type {AircraftListing[]} */
  const rows = await fetchRows(`/rest/v1/${TABLE_NAME}?${query.toString()}`)
  return rows[0] || null
}

async function fetchRows(path) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  const res = await fetch(`${url}${path}`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
    next: { revalidate: 60 },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase request failed (${res.status}): ${text}`)
  }
  return res.json()
}

function encodeTerm(input) {
  return input.replace(/[^a-zA-Z0-9 _-]/g, "").trim()
}
