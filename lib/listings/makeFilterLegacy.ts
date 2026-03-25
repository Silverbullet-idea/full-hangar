/**
 * Legacy `?make=` URL tokens that matched a wrong manufacturer column before identity backfill.
 * Keeps bookmarks working: e.g. make=Comanche also matches Piper + model containing Comanche.
 *
 * Curated list — extend alongside `scraper/data/identity/make_model_rules.json` → legacy_make_url_filters.
 */

import { canonicalMakeOrPostgrestFilter } from './canonicalMake'

type LegacyClause = { make_contains: string; model_contains?: string };

const LEGACY_MAKE_FILTERS: { tokenNorm: string; clauses: LegacyClause[] }[] = [
  {
    tokenNorm: "comanche",
    clauses: [{ make_contains: "Comanche" }, { make_contains: "Piper", model_contains: "Comanche" }],
  },
  {
    tokenNorm: "cheyenne",
    clauses: [{ make_contains: "Cheyenne" }, { make_contains: "Piper", model_contains: "Cheyenne" }],
  },
  {
    tokenNorm: "505",
    clauses: [{ make_contains: "505" }, { make_contains: "Bell", model_contains: "505" }],
  },
  {
    tokenNorm: "bonanza",
    clauses: [{ make_contains: "Bonanza" }, { make_contains: "Beechcraft", model_contains: "Bonanza" }],
  },
  {
    tokenNorm: "citation",
    clauses: [{ make_contains: "Citation" }, { make_contains: "Cessna", model_contains: "Citation" }],
  },
  {
    tokenNorm: "caravan",
    clauses: [{ make_contains: "Caravan" }, { make_contains: "Cessna", model_contains: "Caravan" }],
  },
  {
    tokenNorm: "cherokee",
    clauses: [{ make_contains: "Cherokee" }, { make_contains: "Piper", model_contains: "Cherokee" }],
  },
  {
    tokenNorm: "archer",
    clauses: [{ make_contains: "Archer" }, { make_contains: "Piper", model_contains: "Archer" }],
  },
  {
    tokenNorm: "arrow",
    clauses: [{ make_contains: "Arrow" }, { make_contains: "Piper", model_contains: "Arrow" }],
  },
  {
    tokenNorm: "challenger",
    clauses: [{ make_contains: "Challenger" }, { make_contains: "Bombardier", model_contains: "Challenger" }],
  },
  {
    tokenNorm: "learjet",
    clauses: [{ make_contains: "Learjet" }, { make_contains: "Bombardier", model_contains: "Learjet" }],
  },
  {
    tokenNorm: "global",
    clauses: [{ make_contains: "Global" }, { make_contains: "Bombardier", model_contains: "Global" }],
  },
  {
    tokenNorm: "falcon",
    clauses: [{ make_contains: "Falcon" }, { make_contains: "Dassault", model_contains: "Falcon" }],
  },
  {
    tokenNorm: "phenom",
    clauses: [{ make_contains: "Phenom" }, { make_contains: "Embraer", model_contains: "Phenom" }],
  },
];

function clauseToFilterPart(c: LegacyClause): string {
  if (c.model_contains) {
    return `and(make.ilike.%${c.make_contains}%,model.ilike.%${c.model_contains}%)`;
  }
  return `make.ilike.%${c.make_contains}%`;
}

/** PostgREST `or=(...)` string for legacy make filter, or null to use default make ilike only. */
export function legacyMakeOrFilterString(makeParam: string): string | null {
  const trimmed = makeParam.trim();
  if (!trimmed) return null;
  const entry = LEGACY_MAKE_FILTERS.find((e) => e.tokenNorm === trimmed.toLowerCase());
  if (!entry) return null;
  return entry.clauses.map(clauseToFilterPart).join(",");
}

/** Apply sidebar / URL make filter with legacy OR expansion when applicable. */
export function applyLegacyMakeFilter(query: any, makeParam: string): any {
  const trimmed = makeParam.trim();
  if (!trimmed) return query;
  const ors = legacyMakeOrFilterString(trimmed);
  if (ors) return query.or(ors);
  const canonOr = canonicalMakeOrPostgrestFilter(trimmed);
  if (canonOr) return query.or(canonOr);
  return query.ilike("make", `%${trimmed}%`);
}
