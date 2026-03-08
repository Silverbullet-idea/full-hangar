import { NextRequest, NextResponse } from "next/server";
import { ensureInternalApiAccess } from "@/lib/internal/auth";
import { createPrivilegedServerClient } from "@/lib/supabase/server";

type ListingRow = Record<string, unknown>;

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

const SOURCE_ORDER = ["tradaplane", "controller", "barnstormers", "aso", "aerotrader", "afs", "globalair", "avbuyer"];

function normalizeSource(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "unknown";
  if (raw === "tap" || raw === "trade-a-plane" || raw === "tradeaplane") return "tradaplane";
  if (raw.startsWith("controller")) return "controller";
  if (raw === "aircraftforsale") return "afs";
  if (raw === "aero_trader") return "aerotrader";
  if (raw === "global_air") return "globalair";
  return raw;
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

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
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

export async function GET(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  try {
    const supabase = createPrivilegedServerClient();
    const result = await supabase
      .from("aircraft_listings")
      .select(
        "source,source_url,value_score,asking_price,n_number,total_time_airframe,time_since_overhaul,engine_model,location_raw,year,make,model,description,time_since_prop_overhaul,state,seller_name,seller_type,primary_image_url,aircraft_type"
      )
      .eq("is_active", true)
      .limit(15000);

    if (result.error) {
      throw new Error(result.error.message);
    }

    const rows = (result.data ?? []) as ListingRow[];
    const bySource = new Map<string, ListingRow[]>();
    for (const row of rows) {
      const source = normalizeSource(row.source);
      if (!bySource.has(source)) bySource.set(source, []);
      bySource.get(source)!.push(row);
    }

    const sources = Array.from(bySource.entries())
      .map(([source, sourceRows]) => {
        const total = sourceRows.length;

        let withPrice = 0;
        let withNNumber = 0;
        let withTotalTime = 0;
        let withSmoh = 0;
        let withEngineModel = 0;
        let withLocation = 0;
        let maxComplete = 0;
        let scoreCount = 0;
        let scoreTotal = 0;
        let tierHigh = 0;
        let tierMid = 0;
        let tierLow = 0;
        const unknownDomainCounts = new Map<string, number>();
        const fieldCounts: Record<string, number> = {};
        for (const field of COMPLETENESS_FIELDS) fieldCounts[field] = 0;

        for (const row of sourceRows) {
          if (hasValue(row.asking_price)) withPrice += 1;
          if (hasValue(row.n_number)) withNNumber += 1;
          if (hasValue(row.total_time_airframe)) withTotalTime += 1;
          if (hasValue(row.time_since_overhaul)) withSmoh += 1;
          if (hasValue(row.engine_model)) withEngineModel += 1;
          if (hasValue(row.location_raw)) withLocation += 1;

          let filled = 0;
          for (const field of COMPLETENESS_FIELDS) {
            if (hasValue(row[field])) {
              fieldCounts[field] += 1;
              filled += 1;
            }
          }
          const completenessPct = (filled / COMPLETENESS_FIELDS.length) * 100;
          if (completenessPct >= 90) tierHigh += 1;
          else if (completenessPct >= 70) tierMid += 1;
          else tierLow += 1;
          if (filled === COMPLETENESS_FIELDS.length) maxComplete += 1;

          const score = asNumber(row.value_score);
          if (score !== null) {
            scoreCount += 1;
            scoreTotal += score;
          }

          if (source === "unknown") {
            const domain = parseDomain(row.source_url);
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

        return {
          source,
          active_listings: total,
          pct_with_price: toPercent(withPrice, total),
          pct_with_n_number: toPercent(withNNumber, total),
          pct_with_total_time: toPercent(withTotalTime, total),
          pct_with_smoh: toPercent(withSmoh, total),
          pct_with_engine_model: toPercent(withEngineModel, total),
          pct_with_location: toPercent(withLocation, total),
          max_completeness_pct: toPercent(maxComplete, total),
          avg_score: scoreCount > 0 ? Number((scoreTotal / scoreCount).toFixed(1)) : null,
          tiers: {
            pct_90_100: toPercent(tierHigh, total),
            pct_70_89: toPercent(tierMid, total),
            pct_under_70: toPercent(tierLow, total),
          },
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
      sources,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute source quality." },
      { status: 500 }
    );
  }
}
