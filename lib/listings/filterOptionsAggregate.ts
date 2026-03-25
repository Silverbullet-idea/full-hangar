/**
 * Shared filter-options aggregation for /listings (SSR, API route, RPC fallback).
 * Keep in sync with app/api/listings/options/route.ts source normalization.
 */

import { mergeCanonicalMakeInFilterOptions } from './canonicalMake'
export type ListingFilterOptionInput = {
  make: string | null
  model: string | null
  state: string | null
  source: string | null
  dealTier: string | null
  valueScore: number | null
}

export type ListingsFilterOptionsClientShape = {
  makes: string[]
  models: string[]
  states: string[]
  modelPairs: Array<{ make: string; model: string }>
  makeCounts: Record<string, number>
  modelCounts: Record<string, number>
  modelPairCounts: Record<string, number>
  sourceCounts: Record<string, number>
  dealTierCounts: {
    all: number
    TOP_DEALS: number
    HOT: number
    GOOD: number
    FAIR: number
    PASS: number
  }
  minimumValueScoreCounts: {
    any: number
    '60': number
    '80': number
  }
}

export function normalizeListingSourceKey(sourceRaw: string): string {
  const value = sourceRaw.trim().toLowerCase()
  if (!value) return 'unknown'
  if (value === 'tap' || value === 'trade-a-plane' || value === 'tradaplane') return 'trade-a-plane'
  if (value === 'controller_cdp') return 'controller_cdp'
  if (value === 'controller' || value === 'ctrl' || value.startsWith('controller_')) return 'controller'
  if (value === 'aerotrader' || value === 'aero_trader') return 'aerotrader'
  if (value === 'aircraftforsale' || value === 'aircraft_for_sale' || value === 'afs') return 'aircraftforsale'
  if (value === 'aso') return 'aso'
  if (value === 'globalair' || value === 'global_air') return 'globalair'
  if (value === 'barnstormers') return 'barnstormers'
  return value
}

export function aggregateListingFilterOptionsFromRows(
  rows: ListingFilterOptionInput[]
): ListingsFilterOptionsClientShape {
  const makes = new Set<string>()
  const models = new Set<string>()
  const states = new Set<string>()
  const modelPairs = new Set<string>()
  const makeCounts = new Map<string, number>()
  const modelCounts = new Map<string, number>()
  const modelPairCounts = new Map<string, number>()
  const sourceCounts = new Map<string, number>()
  const dealTierCounts = new Map<string, number>()
  let score60Count = 0
  let score80Count = 0

  for (const row of rows) {
    const make = String(row.make ?? '').trim()
    const model = String(row.model ?? '').trim()
    const state = String(row.state ?? '').trim().toUpperCase()
    const source = normalizeListingSourceKey(String(row.source ?? ''))
    const dealTier = String(row.dealTier ?? '').trim().toUpperCase()
    const valueScore = typeof row.valueScore === 'number' ? row.valueScore : null
    const normalizedMake = make.toUpperCase()
    const isValidMake =
      make.length > 0 && normalizedMake !== '-' && normalizedMake !== 'N/A' && normalizedMake !== 'UNKNOWN'
    if (isValidMake) makes.add(make)
    if (model) models.add(model)
    if (state) states.add(state)
    if (isValidMake && model) modelPairs.add(`${make}|||${model}`)
    if (isValidMake) makeCounts.set(make, (makeCounts.get(make) ?? 0) + 1)
    if (model) modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1)
    if (isValidMake && model) {
      const pairKey = `${make}|||${model}`
      modelPairCounts.set(pairKey, (modelPairCounts.get(pairKey) ?? 0) + 1)
    }
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1)
    if (dealTier) dealTierCounts.set(dealTier, (dealTierCounts.get(dealTier) ?? 0) + 1)
    if (typeof valueScore === 'number') {
      if (valueScore >= 60) score60Count += 1
      if (valueScore >= 80) score80Count += 1
    }
  }

  const hot = dealTierCounts.get('HOT') ?? 0
  const good = dealTierCounts.get('GOOD') ?? 0
  const fair = dealTierCounts.get('FAIR') ?? 0
  const pass = dealTierCounts.get('PASS') ?? 0
  const allCount = rows.length

  return mergeCanonicalMakeInFilterOptions({
    makes: Array.from(makes).sort((a, b) => a.localeCompare(b)),
    models: Array.from(models).sort((a, b) => a.localeCompare(b)),
    states: Array.from(states).sort((a, b) => a.localeCompare(b)),
    modelPairs: Array.from(modelPairs)
      .map((entry) => {
        const [mk, md] = entry.split('|||')
        return { make: mk, model: md }
      })
      .sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model)),
    makeCounts: Object.fromEntries(makeCounts),
    modelCounts: Object.fromEntries(modelCounts),
    modelPairCounts: Object.fromEntries(modelPairCounts),
    sourceCounts: Object.fromEntries(sourceCounts),
    dealTierCounts: {
      all: allCount,
      TOP_DEALS: hot + good,
      HOT: hot,
      GOOD: good,
      FAIR: fair,
      PASS: pass,
    },
    minimumValueScoreCounts: {
      any: allCount,
      '60': score60Count,
      '80': score80Count,
    },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseListingFilterOptionsRpcPayload(raw: unknown): ListingsFilterOptionsClientShape | null {
  if (!isRecord(raw)) return null
  const makes = raw.makes
  const models = raw.models
  const states = raw.states
  const modelPairs = raw.modelPairs
  if (!Array.isArray(makes) || !Array.isArray(models) || !Array.isArray(states) || !Array.isArray(modelPairs)) {
    return null
  }
  if (!isRecord(raw.makeCounts) || !isRecord(raw.modelCounts) || !isRecord(raw.modelPairCounts)) return null
  if (!isRecord(raw.sourceCounts) || !isRecord(raw.dealTierCounts)) return null
  if (!isRecord(raw.minimumValueScoreCounts)) return null
  const dt = raw.dealTierCounts
  const ms = raw.minimumValueScoreCounts
  const num = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null
  const dAll = num(dt.all)
  const dTop = num(dt.TOP_DEALS)
  const dHot = num(dt.HOT)
  const dGood = num(dt.GOOD)
  const dFair = num(dt.FAIR)
  const dPass = num(dt.PASS)
  const mAny = num(ms.any)
  const m60 = num(ms['60'])
  const m80 = num(ms['80'])
  if (
    dAll === null ||
    dTop === null ||
    dHot === null ||
    dGood === null ||
    dFair === null ||
    dPass === null ||
    mAny === null ||
    m60 === null ||
    m80 === null
  ) {
    return null
  }
  for (const pair of modelPairs) {
    if (!isRecord(pair) || typeof pair.make !== 'string' || typeof pair.model !== 'string') return null
  }
  return mergeCanonicalMakeInFilterOptions({
    makes: makes.map((m) => String(m)),
    models: models.map((m) => String(m)),
    states: states.map((m) => String(m)),
    modelPairs: modelPairs as Array<{ make: string; model: string }>,
    makeCounts: { ...raw.makeCounts } as Record<string, number>,
    modelCounts: { ...raw.modelCounts } as Record<string, number>,
    modelPairCounts: { ...raw.modelPairCounts } as Record<string, number>,
    sourceCounts: { ...raw.sourceCounts } as Record<string, number>,
    dealTierCounts: {
      all: dAll,
      TOP_DEALS: dTop,
      HOT: dHot,
      GOOD: dGood,
      FAIR: dFair,
      PASS: dPass,
    },
    minimumValueScoreCounts: {
      any: mAny,
      '60': m60,
      '80': m80,
    },
  })
}
