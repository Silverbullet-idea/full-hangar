import { NextRequest, NextResponse } from "next/server"
import {
  createPrivilegedServerClient,
  createServerClient,
} from "../../../../../lib/supabase/server"

type CompRow = {
  id: string | null
  title: string | null
  price: number | null
  year: number | null
  make: string | null
  model: string | null
  total_time_hours: number | null
  engine_smoh: number | null
  /** @deprecated Prefer flip_score for UI; retained for older clients */
  value_score: number | null
  flip_score: number | null
  risk_level: string | null
  listing_url: string | null
  source: string | null
  days_on_market: number | null
  location_label: string | null
  primary_image_url: string | null
  deal_tier: string | null
  flip_tier: string | null
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", "").trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function deriveModelFamily(model: string | null | undefined): string | null {
  const text = typeof model === "string" ? model.trim() : ""
  if (!text) return null
  const match = text.match(/^[A-Za-z0-9-]+/)
  return (match?.[0] ?? text.split(/\s+/)[0] ?? "").trim() || null
}

function toCompRow(raw: Record<string, unknown>): CompRow {
  return {
    id: typeof raw.id === "string" ? raw.id : null,
    title: typeof raw.title === "string" ? raw.title : null,
    price: numberOrNull(raw.asking_price ?? raw.price_asking),
    year: numberOrNull(raw.year),
    make: typeof raw.make === "string" ? raw.make : null,
    model: typeof raw.model === "string" ? raw.model : null,
    total_time_hours: numberOrNull(raw.total_time_airframe),
    engine_smoh: numberOrNull(raw.engine_time_since_overhaul ?? raw.time_since_overhaul),
    value_score: numberOrNull(raw.value_score),
    flip_score: numberOrNull(raw.flip_score),
    risk_level: typeof raw.risk_level === "string" ? raw.risk_level : null,
    listing_url:
      (typeof raw.listing_url === "string" && raw.listing_url) ||
      (typeof raw.url === "string" && raw.url) ||
      null,
    source: typeof raw.source === "string" ? raw.source : null,
    days_on_market: numberOrNull(raw.days_on_market),
    location_label: typeof raw.location_label === "string" ? raw.location_label : null,
    primary_image_url: typeof raw.primary_image_url === "string" ? raw.primary_image_url : null,
    deal_tier: typeof raw.deal_tier === "string" ? raw.deal_tier : null,
    flip_tier: typeof raw.flip_tier === "string" ? raw.flip_tier : null,
  }
}

function dedupeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>()
  const deduped: Record<string, unknown>[] = []
  for (const row of rows) {
    const id = String(row.id ?? row.source_id ?? `${row.make}-${row.model}-${row.year}-${row.asking_price}`)
    if (seen.has(id)) continue
    seen.add(id)
    deduped.push(row)
  }
  return deduped
}

type QueryResult = {
  data: Record<string, unknown>[] | null
  error: { message: string } | null
}

type ListingsTableName = "aircraft_listings" | "public_listings"

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function runListingsQueryWithFallback(
  run: (
    client: ReturnType<typeof createServerClient>,
    table: ListingsTableName
  ) => Promise<QueryResult>
): Promise<Record<string, unknown>[]> {
  let privilegedError: Error | null = null

  try {
    const privilegedClient = createPrivilegedServerClient()
    const privilegedResult = await run(privilegedClient, "aircraft_listings")
    if (privilegedResult.error) {
      throw new Error(privilegedResult.error.message)
    }
    return privilegedResult.data ?? []
  } catch (error) {
    privilegedError = error instanceof Error ? error : new Error(String(error ?? "Unknown query error"))
  }

  const publicClient = createServerClient()
  const publicResult = await run(publicClient, "public_listings")
  if (publicResult.error) {
    throw new Error(
      `Privileged query failed (${privilegedError?.message ?? "unknown"}) and public query failed (${publicResult.error.message}).`
    )
  }
  return publicResult.data ?? []
}

async function getListingByIdPublic(id: string): Promise<Record<string, unknown> | null> {
  if (isUuid(id)) {
    const byId = await runListingsQueryWithFallback(async (client, table) => {
      return (await client.from(table).select("*").eq("id", id).limit(1)) as unknown as QueryResult
    })
    if (byId.length > 0) {
      return byId[0]
    }
  }

  const bySource = await runListingsQueryWithFallback(async (client, table) => {
    return (await client.from(table).select("*").eq("source_id", id).limit(1)) as unknown as QueryResult
  })
  return bySource[0] ?? null
}

async function getComparableListingsPublic(
  make: string,
  model: string,
  maxPrice?: number,
  opts: { minYear?: number; maxYear?: number; excludeId?: string; limit?: number } = {}
): Promise<Record<string, unknown>[]> {
  const { minYear, maxYear, excludeId, limit = 20 } = opts
  const rows = await runListingsQueryWithFallback(async (client, table) => {
    let query = client
      .from(table)
      .select("*")
      .eq("make", make)
      .eq("model", model)
      .eq("is_active", true)
      .limit(limit)

    if (typeof minYear === "number") query = query.gte("year", minYear)
    if (typeof maxYear === "number") query = query.lte("year", maxYear)
    if (typeof maxPrice === "number") query = query.lte("asking_price", maxPrice)
    return (await query) as unknown as QueryResult
  })
  if (!excludeId) return rows
  return rows.filter((row) => row?.id !== excludeId && row?.source_id !== excludeId)
}

async function getComparableListingsByModelFamilyPublic(
  make: string,
  modelFamily: string,
  maxPrice?: number,
  opts: { minYear?: number; maxYear?: number; excludeId?: string; limit?: number } = {}
): Promise<Record<string, unknown>[]> {
  const { minYear, maxYear, excludeId, limit = 20 } = opts
  const rows = await runListingsQueryWithFallback(async (client, table) => {
    let query = client
      .from(table)
      .select("*")
      .eq("make", make)
      .ilike("model", `${modelFamily}%`)
      .eq("is_active", true)
      .limit(limit)

    if (typeof minYear === "number") query = query.gte("year", minYear)
    if (typeof maxYear === "number") query = query.lte("year", maxYear)
    if (typeof maxPrice === "number") query = query.lte("asking_price", maxPrice)
    return (await query) as unknown as QueryResult
  })
  if (!excludeId) return rows
  return rows.filter((row) => row?.id !== excludeId && row?.source_id !== excludeId)
}

async function getComparableListingsByCategoryPublic(
  make: string,
  category: string,
  maxPrice?: number,
  opts: { excludeId?: string; limit?: number } = {}
): Promise<Record<string, unknown>[]> {
  const { excludeId, limit = 20 } = opts
  const rows = await runListingsQueryWithFallback(async (client, table) => {
    let query = client
      .from(table)
      .select("*")
      .eq("make", make)
      .eq("aircraft_category", category)
      .eq("is_active", true)
      .limit(limit)

    if (typeof maxPrice === "number") query = query.lte("asking_price", maxPrice)
    return (await query) as unknown as QueryResult
  })
  if (!excludeId) return rows
  return rows.filter((row) => row?.id !== excludeId && row?.source_id !== excludeId)
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params)
    const id = String(params.id ?? "").trim()
    if (!id) {
      return NextResponse.json({ data: null, error: "Missing listing id." }, { status: 400 })
    }

    const submodelOnly = request.nextUrl.searchParams.get("submodelOnly") === "1"
    const targetRaw = await getListingByIdPublic(id)
    if (!targetRaw) {
      return NextResponse.json({ data: null, error: "Listing not found." }, { status: 404 })
    }

    const target = toCompRow(targetRaw)
    const make = typeof targetRaw.make === "string" ? targetRaw.make : ""
    const model = typeof targetRaw.model === "string" ? targetRaw.model : ""
    const category = typeof targetRaw.aircraft_category === "string" ? targetRaw.aircraft_category : ""
    const year = numberOrNull(targetRaw.year)
    const modelFamily = deriveModelFamily(model)

    const yearMin = typeof year === "number" ? year - 10 : undefined
    const yearMax = typeof year === "number" ? year + 10 : undefined
    const baseOpts = { minYear: yearMin, maxYear: yearMax, excludeId: id, limit: 20 }

    let comps: Record<string, unknown>[] = []
    let searchCriteria = "same make + category fallback"

    if (make && model && submodelOnly) {
      comps = await getComparableListingsPublic(make, model, undefined, baseOpts)
      searchCriteria = "same make/model within ±10 years"
    } else if (make && modelFamily) {
      comps = await getComparableListingsByModelFamilyPublic(make, modelFamily, undefined, baseOpts)
      searchCriteria = `same make/model family (${modelFamily}) within ±10 years`
    }

    if (comps.length < 3 && make && model) {
      const exact = await getComparableListingsPublic(make, model, undefined, baseOpts)
      comps = dedupeRows([...comps, ...exact])
      if (exact.length > 0) searchCriteria = "same make/model within ±10 years"
    }

    if (comps.length < 5 && make && category) {
      const fallback = await getComparableListingsByCategoryPublic(make, category, undefined, {
        excludeId: id,
        limit: 20,
      })
      comps = dedupeRows([...comps, ...fallback])
      if (fallback.length > 0) searchCriteria = `same make + ${category} fallback`
    }

    const trimmed = comps.slice(0, 20).map(toCompRow)
    const prices = trimmed
      .map((row) => row.price)
      .filter((value): value is number => typeof value === "number" && value > 0)
    const timeValues = trimmed
      .map((row) => row.total_time_hours)
      .filter((value): value is number => typeof value === "number" && value > 0)

    const payload = {
      target,
      comps: trimmed,
      metadata: {
        comp_count: trimmed.length,
        search_criteria_used: searchCriteria,
        model_family: modelFamily,
        submodel_only: submodelOnly,
        price_range: {
          min: prices.length ? Math.min(...prices) : null,
          max: prices.length ? Math.max(...prices) : null,
          median: median(prices),
        },
        time_range: {
          min_tt: timeValues.length ? Math.min(...timeValues) : null,
          max_tt: timeValues.length ? Math.max(...timeValues) : null,
          median_tt: median(timeValues),
        },
      },
    }

    return NextResponse.json({ data: payload, error: null }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load comparable listings."
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
}
