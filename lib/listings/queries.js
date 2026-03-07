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
  "url:listing_url",
  "price_asking:asking_price",
  "value_score",
  "engine_score",
  "prop_score",
  "llp_score",
  "avionics_score",
  "avionics_installed_value",
  "risk_level",
  "deal_rating",
  "deal_tier",
  "vs_median_price",
  "comps_sample_size",
  "deferred_total",
  "true_cost",
  "intelligence_version",
  "location_label",
  "n_number",
  "primary_image_url",
].join(",")

const DETAIL_COLUMNS = `${LIST_COLUMNS},description,description_full,total_time_airframe,engine_time_since_overhaul:time_since_overhaul,time_since_new_engine,time_since_prop_overhaul`

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
    query.set("asking_price", `gte.${minPrice}`)
  }
  if (maxPrice > 0) {
    query.set("asking_price", `lte.${maxPrice}`)
  }
  query.set("offset", String(offset))
  query.set("limit", String(pageSize))

  switch (sort) {
    case "deferred_desc":
      query.set("order", "deferred_total.desc.nullslast")
      break
    case "price_asc":
      query.set("order", "asking_price.asc.nullslast")
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
  /** @type {AircraftListing[]} */
  let rows = []
  const idLooksUuid = isUuid(id)

  if (idLooksUuid) {
    const query = new URLSearchParams()
    query.set("select", DETAIL_COLUMNS)
    query.set("id", `eq.${id}`)
    query.set("limit", "1")
    rows = await fetchRows(`/rest/v1/${TABLE_NAME}?${query.toString()}`, { cache: "no-store" })
  } else {
    const sourceQuery = new URLSearchParams()
    sourceQuery.set("select", DETAIL_COLUMNS)
    sourceQuery.set("source_id", `eq.${id}`)
    sourceQuery.set("limit", "1")
    rows = await fetchRows(`/rest/v1/${TABLE_NAME}?${sourceQuery.toString()}`, { cache: "no-store" })
  }

  // Fallback to the opposite lookup path.
  if (!rows.length) {
    const fallbackQuery = new URLSearchParams()
    fallbackQuery.set("select", DETAIL_COLUMNS)
    fallbackQuery.set(idLooksUuid ? "source_id" : "id", `eq.${id}`)
    fallbackQuery.set("limit", "1")
    rows = await fetchRows(`/rest/v1/${TABLE_NAME}?${fallbackQuery.toString()}`, { cache: "no-store" })
  }

  if (!rows.length) return null
  return rows[0]
}

export async function getListingRawById(id) {
  /** @type {AircraftListing[]} */
  let rows = []
  const idLooksUuid = isUuid(id)
  const baseTable = "aircraft_listings"
  const fallbackTable = TABLE_NAME

  try {
    if (idLooksUuid) {
      const query = new URLSearchParams()
      query.set("select", "*")
      query.set("id", `eq.${id}`)
      query.set("limit", "1")
      rows = await fetchRows(`/rest/v1/${baseTable}?${query.toString()}`, { cache: "no-store" })
    } else {
      const sourceQuery = new URLSearchParams()
      sourceQuery.set("select", "*")
      sourceQuery.set("source_id", `eq.${id}`)
      sourceQuery.set("limit", "1")
      rows = await fetchRows(`/rest/v1/${baseTable}?${sourceQuery.toString()}`, { cache: "no-store" })
    }

    if (!rows.length) {
      const fallbackQuery = new URLSearchParams()
      fallbackQuery.set("select", "*")
      fallbackQuery.set(idLooksUuid ? "source_id" : "id", `eq.${id}`)
      fallbackQuery.set("limit", "1")
      rows = await fetchRows(`/rest/v1/${baseTable}?${fallbackQuery.toString()}`, { cache: "no-store" })
    }
  } catch (error) {
    if (!isPermissionDeniedError(error)) throw error
  }

  // If raw table is not readable with anon key, use the public view so detail pages still load.
  if (!rows.length) {
    if (idLooksUuid) {
      const query = new URLSearchParams()
      query.set("select", "*")
      query.set("id", `eq.${id}`)
      query.set("limit", "1")
      rows = await fetchRows(`/rest/v1/${fallbackTable}?${query.toString()}`, { cache: "no-store" })
    } else {
      const sourceQuery = new URLSearchParams()
      sourceQuery.set("select", "*")
      sourceQuery.set("source_id", `eq.${id}`)
      sourceQuery.set("limit", "1")
      rows = await fetchRows(`/rest/v1/${fallbackTable}?${sourceQuery.toString()}`, { cache: "no-store" })
    }

    if (!rows.length) {
      const fallbackQuery = new URLSearchParams()
      fallbackQuery.set("select", "*")
      fallbackQuery.set(idLooksUuid ? "source_id" : "id", `eq.${id}`)
      fallbackQuery.set("limit", "1")
      rows = await fetchRows(`/rest/v1/${fallbackTable}?${fallbackQuery.toString()}`, { cache: "no-store" })
    }
  }
  const row = rows[0] || null
  if (!row) return null

  const nNumber = typeof row.n_number === "string" ? row.n_number.trim() : ""
  const serialNumber = typeof row.serial_number === "string" ? row.serial_number.trim() : ""
  let merged = row

  if (nNumber && needsFaaSnapshotFallback(row)) {
    try {
      const snapshot = await fetchFaaSnapshotByNNumber(nNumber)
      if (hasFaaSnapshotData(snapshot)) {
        merged = { ...merged, ...snapshot }
      } else if (serialNumber) {
        const serialSnapshot = await fetchFaaSnapshotBySerial(serialNumber)
        if (hasFaaSnapshotData(serialSnapshot)) {
          merged = { ...merged, ...serialSnapshot }
        }
      }
    } catch {
      // Ignore snapshot fallback failures.
    }
  }

  try {
    const registryDetails = await fetchFaaRegistryDetails(nNumber, serialNumber)
    if (registryDetails) {
      merged = { ...merged, ...registryDetails }
    }
  } catch {
    // Ignore FAA detail lookup failures to preserve baseline listing rendering.
  }

  return merged
}

export async function getListingPriceHistory(sourceSite, sourceId, days = 365) {
  if (!sourceSite || !sourceId) return []
  const safeDays = Number.isFinite(Number(days)) ? Math.max(14, Math.min(3650, Number(days))) : 365
  const query = new URLSearchParams()
  query.set("select", "observed_on,observed_at,asking_price,is_active")
  query.set("source_site", `eq.${encodeTerm(sourceSite)}`)
  query.set("source_id", `eq.${encodeTerm(sourceId)}`)
  query.set("order", "observed_on.asc")
  query.set("limit", String(safeDays))
  return fetchRows(`/rest/v1/public_listing_observations?${query.toString()}`)
}

/**
 * @param {string | null | undefined} make
 * @param {string | null | undefined} model
 * @param {number | string | null | undefined} [year]
 */
export async function getSimilarMarketPricing(make, model, year = null) {
  if (!make || !model) return null

  const query = new URLSearchParams()
  query.set("select", "asking_price,year")
  query.set("make", `eq.${encodeTerm(make)}`)
  query.set("model", `eq.${encodeTerm(model)}`)
  query.set("asking_price", "gt.0")
  query.set("is_active", "eq.true")
  query.set("limit", "250")

  /** @type {Array<{ asking_price?: number | string | null, year?: number | string | null }>} */
  const rows = await fetchRows(`/rest/v1/${TABLE_NAME}?${query.toString()}`)
  const allPrices = rows
    .map((row) => Number(row.asking_price))
    .filter((value) => Number.isFinite(value) && value > 0)

  if (!allPrices.length) return null

  let yearMatchedPrices = allPrices
  const numericYear = Number(year)
  if (Number.isFinite(numericYear)) {
    yearMatchedPrices = rows
      .filter((row) => {
        const rowYear = Number(row.year)
        return Number.isFinite(rowYear) && Math.abs(rowYear - numericYear) <= 10
      })
      .map((row) => Number(row.asking_price))
      .filter((value) => Number.isFinite(value) && value > 0)
  }

  const priced = yearMatchedPrices.length >= 5 ? yearMatchedPrices : allPrices
  priced.sort((a, b) => a - b)
  const low = percentile(priced, 0.25)
  const median = percentile(priced, 0.5)
  const high = percentile(priced, 0.75)

  return {
    sampleSize: priced.length,
    low,
    median,
    high,
    usedYearWindow: yearMatchedPrices.length >= 5 && Number.isFinite(numericYear),
  }
}

async function fetchRows(path, options = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  const fetchOptions = {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
  }
  if (options.cache === "no-store") {
    fetchOptions.cache = "no-store"
  } else {
    fetchOptions.next = { revalidate: options.revalidate ?? 60 }
  }

  const res = await fetch(`${url}${path}`, fetchOptions)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase request failed (${res.status}): ${text}`)
  }
  return res.json()
}

async function fetchRpcRow(functionName, payload, options = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  const fetchOptions = {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  }
  if (options.cache === "no-store") {
    fetchOptions.cache = "no-store"
  } else {
    fetchOptions.next = { revalidate: options.revalidate ?? 300 }
  }

  const res = await fetch(`${url}/rest/v1/rpc/${functionName}`, fetchOptions)

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase RPC failed (${res.status}): ${text}`)
  }

  const rows = await res.json()
  if (!Array.isArray(rows) || rows.length === 0) {
    return null
  }
  return rows[0]
}

async function fetchFaaSnapshotByNNumber(nNumber) {
  return fetchRpcRow("get_faa_snapshot", { n_number_input: nNumber })
}

async function fetchFaaSnapshotBySerial(serialNumber) {
  return fetchRpcRow("get_faa_snapshot_by_serial", { serial_number_input: serialNumber })
}

function getField(record, candidates) {
  if (!record || typeof record !== "object") return null
  for (const key of candidates) {
    const value = record[key]
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (!text) continue
    return text
  }
  return null
}

async function fetchOneRow(path) {
  const rows = await fetchRows(path)
  if (!Array.isArray(rows) || rows.length === 0) return null
  return rows[0]
}

async function fetchFaaRegistryDetails(nNumber, serialNumber) {
  const normalizedN = typeof nNumber === "string" ? nNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase() : ""
  const normalizedSerial = typeof serialNumber === "string" ? serialNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase() : ""

  /** @type {Record<string, any> | null} */
  let registryRow = null

  if (normalizedN) {
    const nCandidates = Array.from(new Set([
      normalizedN,
      normalizedN.replace(/^N/, ""),
      `N${normalizedN.replace(/^N/, "")}`,
    ].filter(Boolean)))

    for (const candidate of nCandidates) {
      const query = new URLSearchParams()
      query.set("select", "*")
      query.set("n_number", `eq.${encodeTerm(candidate)}`)
      query.set("limit", "1")
      registryRow = await fetchOneRow(`/rest/v1/faa_registry?${query.toString()}`)
      if (registryRow) break
    }
  }

  if (!registryRow && normalizedSerial) {
    const query = new URLSearchParams()
    query.set("select", "*")
    query.set("serial_number", `eq.${encodeTerm(normalizedSerial)}`)
    query.set("limit", "1")
    registryRow = await fetchOneRow(`/rest/v1/faa_registry?${query.toString()}`)
  }

  if (!registryRow) return null

  const mfrMdlCode = getField(registryRow, ["mfr_mdl_code", "mfr_model_code"])
  const engMfrMdlCode = getField(registryRow, ["eng_mfr_mdl_code", "eng_mfr_mdl"])
  let aircraftRef = null
  let engineRef = null

  if (mfrMdlCode) {
    const query = new URLSearchParams()
    query.set("select", "*")
    query.set("mfr_mdl_code", `eq.${encodeTerm(mfrMdlCode)}`)
    query.set("limit", "1")
    aircraftRef = await fetchOneRow(`/rest/v1/faa_aircraft_ref?${query.toString()}`)
  }

  if (engMfrMdlCode) {
    const query = new URLSearchParams()
    query.set("select", "*")
    query.set("eng_mfr_mdl_code", `eq.${encodeTerm(engMfrMdlCode)}`)
    query.set("limit", "1")
    engineRef = await fetchOneRow(`/rest/v1/faa_engine_ref?${query.toString()}`)
  }

  return {
    faa_serial_number_detail: getField(registryRow, ["serial_number", "serial_no", "serial"]),
    faa_registered_owner_name: getField(registryRow, ["owner_name", "name", "registrant_name"]),
    faa_registered_owner_street: getField(registryRow, ["street", "street1", "address_1"]),
    faa_registered_owner_city: getField(registryRow, ["city"]),
    faa_registered_owner_state: getField(registryRow, ["state"]),
    faa_registered_owner_county: getField(registryRow, ["county"]),
    faa_registered_owner_zip: getField(registryRow, ["zip_code", "zip", "zipcode"]),
    faa_registered_owner_country: getField(registryRow, ["country"]),
    faa_cert_issue_date_detail: getField(registryRow, ["cert_date", "cert_issue_date"]),
    faa_expiration_date_detail: getField(registryRow, ["expiration_date", "exp_date"]),
    faa_status_code_detail: getField(registryRow, ["status_code", "status"]),
    faa_type_registration_detail: getField(registryRow, ["type_registration", "registrant_type"]),
    faa_dealer_detail: getField(registryRow, ["dealer"]),
    faa_mode_s_code_base8: getField(registryRow, ["mode_s_code", "mode_s_code_base8"]),
    faa_mode_s_code_base16: getField(registryRow, ["mode_s_code_hex", "mode_s_code_base16"]),
    faa_type_aircraft_detail:
      getField(aircraftRef, ["type_aircraft_description", "type_aircraft"]) ||
      getField(registryRow, ["type_aircraft"]),
    faa_type_engine_detail: getField(registryRow, ["type_engine"]),
    faa_engine_manufacturer_detail:
      getField(engineRef, ["eng_mfr_name", "engine_manufacturer", "manufacturer", "eng_manufacturer"]) ||
      getField(registryRow, ["engine_manufacturer"]),
    faa_engine_model_detail:
      getField(engineRef, ["eng_model_name", "model_name", "engine_model", "model", "eng_model"]) ||
      getField(registryRow, ["engine_model"]),
    faa_airworthiness_category_detail:
      getField(registryRow, ["category", "airworthiness_category"]) ||
      getField(engineRef, ["category"]),
    faa_airworthiness_classification_detail:
      getField(registryRow, ["classification", "airworthiness_classification"]) ||
      getField(engineRef, ["classification"]),
    faa_aw_date_detail: getField(registryRow, ["aw_date", "airworthiness_date"]),
  }
}

function hasFaaSnapshotData(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false
  if (snapshot.faa_matched === true) return true
  const maybeText = [
    snapshot.faa_owner,
    snapshot.faa_status,
    snapshot.faa_city,
    snapshot.faa_state,
    snapshot.faa_cert_date,
    snapshot.faa_registration_alert,
  ]
  return maybeText.some((value) => typeof value === "string" && value.trim().length > 0)
}

function needsFaaSnapshotFallback(row) {
  const maybeText = [
    row.faa_owner,
    row.faa_status,
    row.faa_city,
    row.faa_state,
    row.faa_cert_date,
    row.faa_registration_alert,
  ]
  const hasText = maybeText.some((value) => typeof value === "string" && value.trim().length > 0)
  if (hasText) return false

  const maybeNumber = [
    row.faa_num_seats,
    row.faa_num_engines,
    row.faa_engine_horsepower,
    row.faa_cruising_speed,
    row.faa_aircraft_weight,
  ]
  const hasNumber = maybeNumber.some((value) => Number.isFinite(Number(value)))
  if (hasNumber) return false

  if (row.faa_matched === true) return false
  return true
}

function encodeTerm(input) {
  return input.replace(/[^a-zA-Z0-9 _-]/g, "").trim()
}

function isUuid(value) {
  if (typeof value !== "string") return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

function isPermissionDeniedError(error) {
  if (!error) return false
  const message = String(error?.message || "").toLowerCase()
  return message.includes("permission denied") || message.includes("42501")
}

function percentile(values, ratio) {
  if (!values.length) return null
  if (values.length === 1) return values[0]
  const index = (values.length - 1) * ratio
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return values[lower]
  const weight = index - lower
  return values[lower] + (values[upper] - values[lower]) * weight
}
