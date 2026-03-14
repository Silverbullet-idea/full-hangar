import { NextRequest, NextResponse } from "next/server";
import { ensureInternalApiAccess } from "@/lib/internal/auth";
import { createPrivilegedServerClient } from "@/lib/supabase/server";

type ListingRow = Record<string, unknown>;
type SupabaseRow = Record<string, unknown>;

const COMPLETENESS_FIELDS = [
  "year",
  "make",
  "model",
  "asking_price",
  "n_number",
  "description",
  "total_time_airframe",
  "time_since_overhaul",
  "time_since_prop_overhaul",
  "location_raw",
  "state",
  "seller_name",
  "seller_type",
  "primary_image_url",
  "aircraft_type",
] as const;

const CRITICAL_COMPLETENESS_FIELDS = ["year", "make", "model", "asking_price", "n_number", "total_time_airframe", "location_raw"] as const;

const SOURCE_ORDER = ["tradaplane", "controller", "barnstormers", "aso", "aerotrader", "afs", "globalair", "avbuyer"];
const DOMAIN_SOURCE_HINTS: Array<[string, string]> = [
  ["aerotrader", "aerotrader"],
  ["controller", "controller"],
  ["trade-a-plane", "tradaplane"],
  ["tradeaplane", "tradaplane"],
  ["barnstormers", "barnstormers"],
  ["globalair", "globalair"],
  ["aircraftforsale", "afs"],
  ["aso", "aso"],
  ["avbuyer", "avbuyer"],
];
const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);
const US_LIKELY_SOURCES = new Set(["tradaplane", "controller", "aso", "aerotrader", "barnstormers", "afs"]);
const NON_US_LOCATION_MARKERS = [
  "canada", "united kingdom", "uk", "england", "france", "germany", "mexico", "brazil", "australia", "new zealand",
];

function normalizeSource(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "unknown";
  if (raw === "tap" || raw === "trade-a-plane" || raw === "tradeaplane" || raw === "trade_a_plane") return "tradaplane";
  if (raw.startsWith("controller")) return "controller";
  if (raw === "aircraftforsale") return "afs";
  if (raw === "aero_trader") return "aerotrader";
  if (raw === "global_air") return "globalair";
  return raw;
}

function inferSource(row: ListingRow): string {
  const candidates = [row.source_site, row.listing_source, row.source];
  for (const candidate of candidates) {
    const normalized = normalizeSource(candidate);
    if (normalized !== "unknown") return normalized;
  }
  const domain = parseDomain(row.source_url ?? row.url ?? null);
  if (domain) {
    for (const [needle, source] of DOMAIN_SOURCE_HINTS) {
      if (domain.includes(needle)) return source;
    }
  }
  return "unknown";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return false;
}

function registrationScheme(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function hasAnyRegistration(row: ListingRow): boolean {
  return hasValue(row.registration_normalized) || hasValue(row.registration_raw) || hasValue(row.n_number);
}

function hasUsRegistration(row: ListingRow): boolean {
  const scheme = registrationScheme(row.registration_scheme);
  if (scheme === "US_N") return true;
  return hasValue(row.n_number);
}

function hasNonUsRegistration(row: ListingRow): boolean {
  const scheme = registrationScheme(row.registration_scheme);
  if (!hasAnyRegistration(row)) return false;
  if (!scheme) return false;
  return scheme !== "US_N" && scheme !== "UNKNOWN";
}

function hasUnclassifiedRegistration(row: ListingRow): boolean {
  if (!hasAnyRegistration(row)) return false;
  const scheme = registrationScheme(row.registration_scheme);
  return !scheme || scheme === "UNKNOWN";
}

function inferUsExpected(row: ListingRow, source: string): boolean {
  const countryCode = String(row.registration_country_code ?? "").trim().toUpperCase();
  if (countryCode && countryCode !== "US") return false;

  const scheme = registrationScheme(row.registration_scheme);
  if (scheme && scheme !== "US_N" && scheme !== "UNKNOWN") return false;
  if (scheme === "US_N") return true;

  const stateCode = String(row.state ?? "").trim().toUpperCase();
  if (US_STATE_CODES.has(stateCode)) return true;
  const rawLocation = String(row.location_raw ?? "").trim().toLowerCase();
  if (rawLocation.includes("usa") || rawLocation.includes("united states")) return true;
  if (NON_US_LOCATION_MARKERS.some((marker) => rawLocation.includes(marker))) return false;

  return US_LIKELY_SOURCES.has(source);
}

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function parseTimestamp(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : null;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatDelta(value: number): number {
  return Number(value.toFixed(1));
}

function parseDomain(sourceUrl: unknown): string | null {
  const raw = String(sourceUrl ?? "").trim();
  if (!raw) return null;
  try {
    const withProtocol = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
    const hostname = new URL(withProtocol).hostname.toLowerCase();
    return hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function sanitizeErrorMessage(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Source quality request failed.";
  const withoutTags = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const normalized = withoutTags || "Source quality request failed.";
  const lower = normalized.toLowerCase();
  if (
    lower.includes("doctype html") ||
    lower.includes("cloudflare") ||
    lower.includes("error 522") ||
    lower.includes("connection timed out")
  ) {
    return "Source quality is temporarily unavailable due to an upstream timeout.";
  }
  return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized;
}

export async function GET(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  try {
    const supabase = createPrivilegedServerClient();
    const columnsWithRegistration =
      "source,source_site,listing_source,source_url,url,value_score,asking_price,n_number,registration_raw,registration_normalized,registration_scheme,registration_country_code,registration_confidence,total_time_airframe,time_since_overhaul,engine_model,location_raw,year,make,model,description,time_since_prop_overhaul,state,seller_name,seller_type,primary_image_url,aircraft_type,created_at,updated_at,last_seen_date,scraped_at,first_seen_date,listing_date";
    const columnsLegacy =
      "source,source_site,listing_source,source_url,url,value_score,asking_price,n_number,total_time_airframe,time_since_overhaul,engine_model,location_raw,year,make,model,description,time_since_prop_overhaul,state,seller_name,seller_type,primary_image_url,aircraft_type,created_at,updated_at,last_seen_date,scraped_at,first_seen_date,listing_date";
    const pageSize = 1000;
    const rows: ListingRow[] = [];
    let from = 0;
    let selectedColumns = columnsWithRegistration;
    while (true) {
      const to = from + pageSize - 1;
      const result = await supabase
        .from("aircraft_listings")
        .select(selectedColumns)
        .eq("is_active", true)
        .range(from, to);
      if (result.error) {
        if (selectedColumns === columnsWithRegistration) {
          selectedColumns = columnsLegacy;
          continue;
        }
        throw new Error(sanitizeErrorMessage(result.error.message));
      }
      const pageRows = ((result.data ?? []) as unknown as SupabaseRow[]).map((row) => row as ListingRow);
      rows.push(...pageRows);
      if (pageRows.length < pageSize) break;
      from += pageSize;
    }
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const recent7Start = now - 7 * dayMs;
    const prev7Start = now - 14 * dayMs;
    const bySource = new Map<string, ListingRow[]>();
    for (const knownSource of SOURCE_ORDER) {
      bySource.set(knownSource, []);
    }
    bySource.set("unknown", []);
    for (const row of rows) {
      const source = inferSource(row);
      if (!bySource.has(source)) bySource.set(source, []);
      bySource.get(source)!.push(row);
    }

    const sources = Array.from(bySource.entries())
      .map(([source, sourceRows]) => {
        const total = sourceRows.length;

        let withPrice = 0;
        let withNNumber = 0;
        let withRegistrationAny = 0;
        let withUsRegistration = 0;
        let withNonUsRegistration = 0;
        let withUnclassifiedRegistration = 0;
        let usExpected = 0;
        let usExpectedWithUsRegistration = 0;
        let nonUsExpected = 0;
        let nonUsExpectedWithNonUsRegistration = 0;
        let withTotalTime = 0;
        let withSmoh = 0;
        let withEngineModel = 0;
        let withLocation = 0;
        let maxComplete = 0;
        let criticalComplete = 0;
        let scoreCount = 0;
        let scoreTotal = 0;
        let tierHigh = 0;
        let tierMid = 0;
        let tierLow = 0;
        let fullCompletenessTotal = 0;
        let criticalCompletenessTotal = 0;
        const scoreRecent7: number[] = [];
        const scorePrev7: number[] = [];
        const fullRecent7: number[] = [];
        const fullPrev7: number[] = [];
        let addedRecent7 = 0;
        let addedPrev7 = 0;
        let seen24h = 0;
        let seen72h = 0;
        let seen7d = 0;
        const seenAgeDays: number[] = [];
        const unknownDomainCounts = new Map<string, number>();
        const fieldCounts: Record<string, number> = {};
        for (const field of COMPLETENESS_FIELDS) fieldCounts[field] = 0;

        for (const row of sourceRows) {
          if (hasValue(row.asking_price)) withPrice += 1;
          if (hasValue(row.n_number)) withNNumber += 1;
          if (hasAnyRegistration(row)) withRegistrationAny += 1;
          if (hasUsRegistration(row)) withUsRegistration += 1;
          if (hasNonUsRegistration(row)) withNonUsRegistration += 1;
          if (hasUnclassifiedRegistration(row)) withUnclassifiedRegistration += 1;
          const isUsExpected = inferUsExpected(row, source);
          if (isUsExpected) {
            usExpected += 1;
            if (hasUsRegistration(row)) usExpectedWithUsRegistration += 1;
          } else {
            nonUsExpected += 1;
            if (hasNonUsRegistration(row)) nonUsExpectedWithNonUsRegistration += 1;
          }
          if (hasValue(row.total_time_airframe)) withTotalTime += 1;
          if (hasValue(row.time_since_overhaul)) withSmoh += 1;
          if (hasValue(row.engine_model)) withEngineModel += 1;
          if (hasValue(row.location_raw)) withLocation += 1;

          let filled = 0;
          let criticalFilled = 0;
          for (const field of COMPLETENESS_FIELDS) {
            if (hasValue(row[field])) {
              fieldCounts[field] += 1;
              filled += 1;
            }
          }
          for (const field of CRITICAL_COMPLETENESS_FIELDS) {
            if (hasValue(row[field])) criticalFilled += 1;
          }
          const completenessPct = (filled / COMPLETENESS_FIELDS.length) * 100;
          const criticalCompletenessPct = (criticalFilled / CRITICAL_COMPLETENESS_FIELDS.length) * 100;
          fullCompletenessTotal += completenessPct;
          criticalCompletenessTotal += criticalCompletenessPct;
          if (completenessPct >= 90) tierHigh += 1;
          else if (completenessPct >= 70) tierMid += 1;
          else tierLow += 1;
          if (filled === COMPLETENESS_FIELDS.length) maxComplete += 1;
          if (criticalFilled === CRITICAL_COMPLETENESS_FIELDS.length) criticalComplete += 1;

          const score = asNumber(row.value_score);
          if (score !== null) {
            scoreCount += 1;
            scoreTotal += score;
          }

          const createdAtTs =
            parseTimestamp(row.first_seen_date) ??
            parseTimestamp(row.created_at) ??
            parseTimestamp(row.listing_date) ??
            parseTimestamp(row.scraped_at);
          if (createdAtTs !== null) {
            if (createdAtTs >= recent7Start) {
              addedRecent7 += 1;
              fullRecent7.push(completenessPct);
              if (score !== null) scoreRecent7.push(score);
            } else if (createdAtTs >= prev7Start && createdAtTs < recent7Start) {
              addedPrev7 += 1;
              fullPrev7.push(completenessPct);
              if (score !== null) scorePrev7.push(score);
            }
          }

          const seenTs =
            parseTimestamp(row.last_seen_date) ??
            parseTimestamp(row.updated_at) ??
            parseTimestamp(row.scraped_at) ??
            parseTimestamp(row.created_at);
          if (seenTs !== null) {
            const ageMs = now - seenTs;
            if (ageMs <= 1 * dayMs) seen24h += 1;
            if (ageMs <= 3 * dayMs) seen72h += 1;
            if (ageMs <= 7 * dayMs) seen7d += 1;
            if (ageMs >= 0) seenAgeDays.push(ageMs / dayMs);
          }

          if (source === "unknown") {
            const domain = parseDomain(row.source_url ?? row.url ?? null);
            if (domain) unknownDomainCounts.set(domain, (unknownDomainCounts.get(domain) ?? 0) + 1);
          }
        }

        const unknownDomains = source === "unknown"
          ? Array.from(unknownDomainCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([domain, count]) => ({ domain, count }))
          : [];

        const fieldCoverage: Record<string, number> = {};
        for (const field of COMPLETENESS_FIELDS) {
          fieldCoverage[field] = toPercent(fieldCounts[field], total);
        }

        const avgFullCompletenessPct = total > 0 ? Number((fullCompletenessTotal / total).toFixed(1)) : 0;
        const avgCriticalCompletenessPct = total > 0 ? Number((criticalCompletenessTotal / total).toFixed(1)) : 0;
        const scoreAvgRecent7 = scoreRecent7.length > 0 ? Number(avg(scoreRecent7).toFixed(1)) : null;
        const scoreAvgPrev7 = scorePrev7.length > 0 ? Number(avg(scorePrev7).toFixed(1)) : null;
        const fullAvgRecent7 = fullRecent7.length > 0 ? Number(avg(fullRecent7).toFixed(1)) : null;
        const fullAvgPrev7 = fullPrev7.length > 0 ? Number(avg(fullPrev7).toFixed(1)) : null;

        const addedDeltaPct = addedPrev7 > 0 ? formatDelta(((addedRecent7 - addedPrev7) / addedPrev7) * 100) : null;
        const fullCompletenessDeltaPct =
          fullAvgRecent7 !== null && fullAvgPrev7 !== null ? formatDelta(fullAvgRecent7 - fullAvgPrev7) : null;
        const scoreDelta =
          scoreAvgRecent7 !== null && scoreAvgPrev7 !== null ? formatDelta(scoreAvgRecent7 - scoreAvgPrev7) : null;

        const freshnessSeen24h = toPercent(seen24h, total);
        const freshnessSeen72h = toPercent(seen72h, total);
        const freshnessSeen7d = toPercent(seen7d, total);
        const medianDaysSinceSeen = Number(median(seenAgeDays).toFixed(1));

        const avgScoreValue = scoreCount > 0 ? Number((scoreTotal / scoreCount).toFixed(1)) : null;
        const healthScoreRaw =
          avgCriticalCompletenessPct * 0.35 +
          avgFullCompletenessPct * 0.25 +
          freshnessSeen7d * 0.2 +
          toPercent(withPrice, total) * 0.1 +
          (avgScoreValue ?? 50) * 0.1;
        const healthScore = Number(clamp(healthScoreRaw, 0, 100).toFixed(1));

        const alerts: Array<{ level: "critical" | "warning"; label: string; detail: string }> = [];
        if (avgCriticalCompletenessPct < 65) {
          alerts.push({
            level: "critical",
            label: "Critical fields weak",
            detail: `Critical completeness is ${avgCriticalCompletenessPct.toFixed(1)}%.`,
          });
        }
        if (freshnessSeen72h < 35) {
          alerts.push({
            level: "warning",
            label: "Refresh lag",
            detail: `Only ${freshnessSeen72h.toFixed(1)}% seen in last 72h.`,
          });
        }
        if (fullCompletenessDeltaPct !== null && fullCompletenessDeltaPct <= -5) {
          alerts.push({
            level: "warning",
            label: "Completeness down",
            detail: `7d full completeness delta is ${fullCompletenessDeltaPct.toFixed(1)} pts.`,
          });
        }
        if (addedPrev7 >= 20 && addedDeltaPct !== null && addedDeltaPct <= -30) {
          alerts.push({
            level: "warning",
            label: "Volume drop",
            detail: `Added listings changed ${addedDeltaPct.toFixed(1)}% vs previous week.`,
          });
        }
        if (source === "unknown") {
          alerts.push({
            level: "warning",
            label: "Unknown source needs mapping",
            detail: "Review top source_url domains to classify this source.",
          });
        }
        if (toPercent(withUnclassifiedRegistration, total) >= 15) {
          alerts.push({
            level: "warning",
            label: "Registration classification weak",
            detail: `${toPercent(withUnclassifiedRegistration, total).toFixed(1)}% registrations are unclassified.`,
          });
        }

        return {
          source,
          active_listings: total,
          pct_with_price: toPercent(withPrice, total),
          pct_with_n_number: toPercent(withNNumber, total),
          pct_with_registration_any: toPercent(withRegistrationAny, total),
          pct_with_us_n_number: toPercent(withUsRegistration, total),
          pct_with_non_us_registration: toPercent(withNonUsRegistration, total),
          pct_unclassified_registration: toPercent(withUnclassifiedRegistration, total),
          pct_us_expected: toPercent(usExpected, total),
          pct_with_us_n_number_when_us_expected: toPercent(usExpectedWithUsRegistration, usExpected),
          pct_with_non_us_registration_when_non_us_expected: toPercent(nonUsExpectedWithNonUsRegistration, nonUsExpected),
          pct_with_total_time: toPercent(withTotalTime, total),
          pct_with_smoh: toPercent(withSmoh, total),
          pct_with_engine_model: toPercent(withEngineModel, total),
          pct_with_location: toPercent(withLocation, total),
          critical_completeness_pct: toPercent(criticalComplete, total),
          max_completeness_pct: toPercent(maxComplete, total),
          avg_score: avgScoreValue,
          avg_full_completeness_pct: avgFullCompletenessPct,
          avg_critical_completeness_pct: avgCriticalCompletenessPct,
          tiers: {
            pct_90_100: toPercent(tierHigh, total),
            pct_70_89: toPercent(tierMid, total),
            pct_under_70: toPercent(tierLow, total),
          },
          trend: {
            added_last_7d: addedRecent7,
            added_prev_7d: addedPrev7,
            added_delta_pct: addedDeltaPct,
            full_completeness_last_7d_pct: fullAvgRecent7,
            full_completeness_prev_7d_pct: fullAvgPrev7,
            full_completeness_delta_pct: fullCompletenessDeltaPct,
            avg_score_last_7d: scoreAvgRecent7,
            avg_score_prev_7d: scoreAvgPrev7,
            avg_score_delta: scoreDelta,
          },
          freshness: {
            seen_last_24h_pct: freshnessSeen24h,
            seen_last_72h_pct: freshnessSeen72h,
            seen_last_7d_pct: freshnessSeen7d,
            median_days_since_seen: medianDaysSinceSeen,
          },
          source_health_score: healthScore,
          alerts,
          field_coverage: fieldCoverage,
          unknown_domains: unknownDomains,
        };
      })
      .sort((a, b) => {
        const ai = SOURCE_ORDER.indexOf(a.source);
        const bi = SOURCE_ORDER.indexOf(b.source);
        if (ai === -1 && bi === -1) return b.active_listings - a.active_listings;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

    return NextResponse.json({
      computed_at: new Date().toISOString(),
      completeness_fields: COMPLETENESS_FIELDS,
      critical_fields: CRITICAL_COMPLETENESS_FIELDS,
      sources,
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeErrorMessage(error instanceof Error ? error.message : "Failed to compute source quality.") },
      { status: 500 }
    );
  }
}
