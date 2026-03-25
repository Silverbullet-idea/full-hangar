/**
 * Canonical aircraft make labels for /listings filter UI + make filter query expansion.
 * Rules mirror scraper/data/identity/make_model_rules.json (extended with optional exact_only + prefix matching in TS).
 */

import type { ListingsFilterOptionsClientShape } from './filterOptionsAggregate'
import rules from '../../scraper/data/identity/make_model_rules.json'

type DisplayAlias = {
  match: string
  canonical: string
  exact_only?: boolean
}

type PrefixRule = {
  prefix: string
  canonical_make: string
}

type ModelAsMake = {
  wrong_make: string
  canonical_make: string
}

function titleCaseWords(s: string): string {
  const out: string[] = []
  for (const w of s.trim().split(/\s+/)) {
    if (!w) continue
    if (/^[\dA-Z]{2,}[\d\-A-Z]*$/i.test(w)) {
      out.push(w)
    } else if (w.includes('-')) {
      out.push(
        w
          .split('-')
          .map((x) => (x ? x.charAt(0).toUpperCase() + x.slice(1).toLowerCase() : x))
          .join('-')
      )
    } else {
      out.push(w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    }
  }
  return out.join(' ').trim()
}

function titleCaseSlashSegments(s: string): string {
  return s
    .split('/')
    .map((seg) => titleCaseWords(seg.trim()))
    .join('/')
}

const CORP_TAIL =
  /\s+(INC\.?|LLC|L\.L\.C\.?|CO\.?|COMPANY|CORP\.?|CORPORATION|AIRCRAFT(\s+(INC\.?|CO\.?|COMPANY))?|AVIATION|HELICOPTERS?)\s*$/i

function stripCorporateSuffixes(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ')
  let prev = ''
  while (s !== prev && CORP_TAIL.test(s)) {
    prev = s
    s = s.replace(CORP_TAIL, '').trim()
  }
  return s
}

function sortedPrefixRules(): PrefixRule[] {
  const list = (rules.make_prefix_merge ?? []) as PrefixRule[]
  return [...list].sort((a, b) => String(b.prefix ?? '').length - String(a.prefix ?? '').length)
}

function sortedDisplayAliases(): DisplayAlias[] {
  const list = (rules.make_display_aliases ?? []) as DisplayAlias[]
  return [...list].sort((a, b) => String(b.match ?? '').length - String(a.match ?? '').length)
}

/**
 * Curated display / bucket key for a raw manufacturer string (matches filter dropdown labels).
 */
export function canonicalListingMake(raw: string): string {
  const m = raw.trim()
  if (!m) return m

  const mLower = m.toLowerCase()
  for (const e of rules.model_as_make ?? []) {
    const entry = e as ModelAsMake
    const wrong = String(entry.wrong_make ?? '').trim().toLowerCase()
    if (wrong && mLower === wrong) {
      return titleCaseWords(String(entry.canonical_make ?? '').trim() || m)
    }
  }

  for (const pr of sortedPrefixRules()) {
    const p = String(pr.prefix ?? '').trim()
    if (p && mLower.startsWith(p.toLowerCase())) {
      return titleCaseWords(String(pr.canonical_make ?? '').trim() || m)
    }
  }

  const mu = m.toUpperCase()
  for (const a of sortedDisplayAliases()) {
    const mat = String(a.match ?? '').trim().toUpperCase()
    if (!mat) continue
    if (a.exact_only) {
      if (mu === mat) return String(a.canonical)
      continue
    }
    if (mu === mat || mu.startsWith(`${mat} `) || mu.startsWith(`${mat},`) || mu.startsWith(`${mat}-`)) {
      return String(a.canonical)
    }
  }

  if (m.includes('/')) {
    return titleCaseSlashSegments(m)
  }

  const stripped = stripCorporateSuffixes(m)
  return titleCaseWords(stripped)
}

/**
 * PostgREST `.or(...)` clauses so choosing a canonical make matches all raw spellings in the DB.
 * Beechcraft uses exact short tokens so we do not pull in Beechjet via `%beech%`.
 */
const EXTRA_OR_BY_CANONICAL_LOWER = new Map<string, string[]>([
  [
    'beechcraft',
    [
      'make.ilike.%Beechcraft%',
      'make.ilike.%BEECHCRAFT%',
      'make.ilike.BEECH',
      'make.ilike.Beech',
      'make.ilike.%Raytheon%',
    ],
  ],
])

export function canonicalMakeOrPostgrestFilter(makeParam: string): string | null {
  const trimmed = makeParam.trim()
  if (!trimmed) return null
  const canon = canonicalListingMake(trimmed)
  const extra = EXTRA_OR_BY_CANONICAL_LOWER.get(canon.toLowerCase())
  if (extra?.length) return extra.join(',')
  const safe = canon.replace(/\\/g, '\\\\').replace(/%/g, '\\%')
  return `make.ilike.%${safe}%`
}

export function mergeCanonicalMakeInFilterOptions(
  shape: ListingsFilterOptionsClientShape
): ListingsFilterOptionsClientShape {
  const makeCounts = new Map<string, number>()
  for (const [raw, n] of Object.entries(shape.makeCounts)) {
    const c = canonicalListingMake(raw)
    const add = typeof n === 'number' && Number.isFinite(n) ? n : 0
    makeCounts.set(c, (makeCounts.get(c) ?? 0) + add)
  }

  const modelPairCounts = new Map<string, number>()
  for (const [key, n] of Object.entries(shape.modelPairCounts)) {
    const idx = key.indexOf('|||')
    if (idx === -1) continue
    const mk = key.slice(0, idx)
    const md = key.slice(idx + 3)
    const canon = canonicalListingMake(mk)
    const nk = `${canon}|||${md}`
    const add = typeof n === 'number' && Number.isFinite(n) ? n : 0
    modelPairCounts.set(nk, (modelPairCounts.get(nk) ?? 0) + add)
  }

  const modelPairs = Array.from(modelPairCounts.keys())
    .map((k) => {
      const i = k.indexOf('|||')
      return { make: k.slice(0, i), model: k.slice(i + 3) }
    })
    .sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model))

  const makes = Array.from(makeCounts.keys()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

  return {
    ...shape,
    makes,
    makeCounts: Object.fromEntries(makeCounts),
    modelPairs,
    modelPairCounts: Object.fromEntries(modelPairCounts),
  }
}
