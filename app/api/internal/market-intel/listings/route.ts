import { NextRequest, NextResponse } from "next/server";
import { ensureInternalApiAccess } from "@/lib/internal/auth";
import { createPrivilegedServerClient, createServerClient } from "@/lib/supabase/server";

type ListingsTable = "aircraft_listings" | "public_listings";
type GenericRow = Record<string, unknown>;

type QueryResult = {
  data: GenericRow[] | null;
  error: { message: string } | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2;
  return sorted[middle];
}

function deriveModelFamily(model: string): string {
  const cleaned = model.trim().toUpperCase();
  if (!cleaned) return "";
  const firstToken = cleaned.split(/\s+/)[0] ?? "";
  return firstToken.replace(/[A-Z]+$/g, "");
}

async function runWithFallback(
  run: (client: ReturnType<typeof createServerClient>, table: ListingsTable) => Promise<QueryResult>
): Promise<GenericRow[]> {
  try {
    const privilegedClient = createPrivilegedServerClient();
    const privilegedResult = await run(privilegedClient, "aircraft_listings");
    if (privilegedResult.error) throw new Error(privilegedResult.error.message);
    return privilegedResult.data ?? [];
  } catch {
    const publicClient = createServerClient();
    const publicResult = await run(publicClient, "public_listings");
    if (publicResult.error) throw new Error(publicResult.error.message);
    return publicResult.data ?? [];
  }
}

function hasAdsb(row: GenericRow): boolean {
  const textParts = [toString(row.description_intelligence), toString(row.description), toString(row.avionics_notes)]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  if (textParts.includes("ads-b")) return true;
  const scoreData = row.score_data;
  if (scoreData && typeof scoreData === "object" && !Array.isArray(scoreData)) {
    const value = (scoreData as Record<string, unknown>).adsb;
    if (value === true) return true;
  }
  return false;
}

function mapRow(row: GenericRow) {
  const scoreData =
    row.score_data && typeof row.score_data === "object" && !Array.isArray(row.score_data)
      ? (row.score_data as Record<string, unknown>)
      : {};

  return {
    id: toString(row.id) ?? "",
    year: toNumber(row.year),
    make: toString(row.make),
    model: toString(row.model),
    asking_price: toNumber(row.asking_price),
    value_score: toNumber(row.value_score),
    flip_score: toNumber(row.flip_score),
    flip_tier: toString(row.flip_tier),
    ttaf: toNumber(row.ttaf ?? row.total_time_airframe),
    smoh: toNumber(row.smoh ?? row.time_since_overhaul),
    avionics_value: toNumber(scoreData.avionics_value),
    state: toString(row.state ?? row.location_state),
    days_on_market: toNumber(row.days_on_market),
    source_site: toString(row.source_site ?? row.source),
    price_reduced: toBoolean(row.price_reduced),
    primary_image_url: toString(row.primary_image_url),
    is_active: toBoolean(row.is_active),
    has_adsb: hasAdsb(row),
  };
}

function sortRows(
  rows: ReturnType<typeof mapRow>[],
  sort: string,
  direction: "asc" | "desc"
): ReturnType<typeof mapRow>[] {
  const dir = direction === "asc" ? 1 : -1;
  const getSortValue = (row: ReturnType<typeof mapRow>): number => {
    if (sort === "price") return row.asking_price ?? Number.POSITIVE_INFINITY;
    if (sort === "days_on_market") return row.days_on_market ?? Number.POSITIVE_INFINITY;
    if (sort === "ttaf") return row.ttaf ?? Number.POSITIVE_INFINITY;
    if (sort === "flip_score") return row.flip_score ?? Number.NEGATIVE_INFINITY;
    if (sort === "value_score") return row.value_score ?? Number.NEGATIVE_INFINITY;
    return row.flip_score ?? row.value_score ?? Number.NEGATIVE_INFINITY;
  };
  return [...rows].sort((a, b) => {
    const aVal = getSortValue(a);
    const bVal = getSortValue(b);
    if (aVal === bVal) {
      return (a.asking_price ?? Number.POSITIVE_INFINITY) - (b.asking_price ?? Number.POSITIVE_INFINITY);
    }
    return (aVal - bVal) * dir;
  });
}

export async function GET(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok === false) return access.response;

  try {
    const params = request.nextUrl.searchParams;
    const optionsOnly = params.get("options") === "1";
    if (optionsOnly) {
      const optionRows = await runWithFallback(async (client, table) => {
        return (await client
          .from(table)
          .select("make, model")
          .eq("is_active", true)
          .gt("asking_price", 0)
          .limit(8000)) as unknown as QueryResult;
      });
      const groupedModels = new Map<string, Set<string>>();
      for (const row of optionRows) {
        const make = toString(row.make);
        const model = toString(row.model);
        if (!make || !model) continue;
        const makeKey = make.trim();
        const existing = groupedModels.get(makeKey) ?? new Set<string>();
        existing.add(model.trim());
        groupedModels.set(makeKey, existing);
      }

      const makes = Array.from(groupedModels.keys()).sort((a, b) => a.localeCompare(b));
      const modelsByMake: Record<string, string[]> = {};
      for (const [make, models] of groupedModels.entries()) {
        modelsByMake[make] = Array.from(models).sort((a, b) => a.localeCompare(b));
      }

      return NextResponse.json({ makes, models_by_make: modelsByMake });
    }

    const make = (params.get("make") ?? "").trim();
    const model = (params.get("model") ?? "").trim();
    const requestedFamily = (params.get("model_family") ?? "").trim();
    const modelFamily = requestedFamily || deriveModelFamily(model);
    const includeRelated = Boolean(requestedFamily);

    if (!make || !model) {
      return NextResponse.json({ error: "make and model are required" }, { status: 400 });
    }

    const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
    const sort = (params.get("sort") ?? "flip_score").trim();
    const directionParam = (params.get("direction") ?? "desc").toLowerCase();
    const direction: "asc" | "desc" = directionParam === "asc" ? "asc" : "desc";

    const showBelowMedian = params.get("below_median") === "1";
    const showFreshEngine = params.get("fresh_engine") === "1";
    const showHasAdsb = params.get("has_adsb") === "1";
    const showPriceReduced = params.get("price_reduced") === "1";

    const rows = await runWithFallback(async (client, table) => {
      let query = client
        .from(table)
        .select("*")
        .eq("is_active", true)
        .ilike("make", make)
        .gt("asking_price", 0)
        .limit(5000);
      query = includeRelated ? query.ilike("model", `${modelFamily}%`) : query.ilike("model", model);
      return (await query) as unknown as QueryResult;
    });

    const mapped = rows.map(mapRow).filter((row) => row.id.length > 0);
    const modelPrices = mapped.map((row) => row.asking_price).filter((v): v is number => v != null && v > 0);
    const modelMedian = median(modelPrices);

    const filtered = mapped.filter((row) => {
      if (showBelowMedian && modelMedian != null) {
        if (row.asking_price == null || row.asking_price >= modelMedian) return false;
      }
      if (showFreshEngine && (row.smoh == null || row.smoh >= 500)) return false;
      if (showHasAdsb && !row.has_adsb) return false;
      if (showPriceReduced && !row.price_reduced) return false;
      return true;
    });

    const sorted = sortRows(filtered, sort, direction);
    const pageSize = 20;
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const pagedRows = sorted.slice(start, start + pageSize);

    return NextResponse.json({
      page: safePage,
      page_size: pageSize,
      total,
      total_pages: totalPages,
      median_price: modelMedian,
      rows: pagedRows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load market intel listings" },
      { status: 500 }
    );
  }
}
