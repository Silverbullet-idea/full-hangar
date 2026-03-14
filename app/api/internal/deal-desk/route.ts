import { NextRequest, NextResponse } from "next/server";
import { ensureInternalApiAccess } from "@/lib/internal/auth";
import { createPrivilegedServerClient } from "@/lib/supabase/server";

type ScenarioRow = Record<string, unknown>;
type ListingRow = Record<string, unknown>;

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapListingContext(row: ListingRow | null) {
  if (!row) return null;
  return {
    id: asString(row.id),
    asking_price: asNullableNumber(row.asking_price),
    deferred_total: asNullableNumber(row.deferred_total),
    make: asString(row.make),
    model: asString(row.model),
    year: asNullableNumber(row.year),
    n_number: asString(row.n_number),
    source_url: asString(row.listing_url) || asString(row.source_url) || asString(row.url),
  };
}

function buildAircraftLabelFromContext(context: ReturnType<typeof mapListingContext> | null, listingId: string): string | null {
  if (!context) return null;
  const year = typeof context.year === "number" ? String(Math.round(context.year)) : "";
  const make = context.make ?? "";
  const model = context.model ?? "";
  const nNumber = context.n_number ?? "";
  const base = [year, make, model].filter(Boolean).join(" ").trim();
  if (base && nNumber) return `${base} — ${nNumber}`;
  if (base) return base;
  return listingId || null;
}

function mapScenario(row: ScenarioRow) {
  return {
    id: String(row.id ?? ""),
    listing_id: String(row.listing_id ?? ""),
    label: asString(row.label) || "Base Case",
    asking_price: asNullableNumber(row.asking_price),
    deferred_maintenance: asNumber(row.deferred_maintenance, 0),
    avionics_upgrade_budget: asNumber(row.avionics_upgrade_budget, 0),
    paint_interior_budget: asNumber(row.paint_interior_budget, 0),
    ferry_flight_cost: asNumber(row.ferry_flight_cost, 0),
    hold_period_months: asNumber(row.hold_period_months, 3),
    title_escrow_fees: asNumber(row.title_escrow_fees, 800),
    insurance_estimate: asNumber(row.insurance_estimate, 0),
    total_acquisition_cost: asNullableNumber(row.total_acquisition_cost),
    estimated_resale_price: asNullableNumber(row.estimated_resale_price),
    profit_at_ask: asNullableNumber(row.profit_at_ask),
    profit_percent_at_ask: asNullableNumber(row.profit_percent_at_ask),
    target_profit_dollars: asNumber(row.target_profit_dollars, 8000),
    max_offer_price: asNullableNumber(row.max_offer_price),
    source_listing_url: asString(row.source_listing_url),
    aircraft_label: asString(row.aircraft_label),
    created_at: asString(row.created_at) || new Date().toISOString(),
    updated_at: asString(row.updated_at) || new Date().toISOString(),
  };
}

async function getListingContexts(listingIds: string[]) {
  if (listingIds.length === 0) return new Map<string, ReturnType<typeof mapListingContext>>();
  const supabase = createPrivilegedServerClient();
  const { data, error } = await supabase
    .from("public_listings")
    .select("*")
    .in("id", listingIds);

  if (error) throw new Error(error.message);

  const map = new Map<string, ReturnType<typeof mapListingContext>>();
  for (const row of (data ?? []) as ListingRow[]) {
    const id = asString(row.id);
    if (!id) continue;
    map.set(id, mapListingContext(row));
  }
  return map;
}

async function getListingContextById(listingId: string) {
  const map = await getListingContexts([listingId]);
  return map.get(listingId) ?? null;
}

export async function GET(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  try {
    const listingId = request.nextUrl.searchParams.get("listing_id");
    const supabase = createPrivilegedServerClient();
    let query = supabase.from("deal_desk_scenarios").select("*").order("updated_at", { ascending: false });
    if (listingId) query = query.eq("listing_id", listingId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as ScenarioRow[];
    const scenarios = rows.map(mapScenario);
    const listingIds = Array.from(new Set(scenarios.map((row) => row.listing_id).filter(Boolean)));
    const listingMap = await getListingContexts(listingIds);

    return NextResponse.json(
      scenarios.map((scenario) => ({
        ...scenario,
        listing_context: listingMap.get(scenario.listing_id) ?? null,
      }))
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Deal Desk scenarios" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const listingId = asString(body?.listing_id);
    if (!listingId) {
      return NextResponse.json({ error: "listing_id is required" }, { status: 400 });
    }

    const listingContext = await getListingContextById(listingId);
    const insertPayload = {
      listing_id: listingId,
      label: asString(body?.label) || "Base Case",
      asking_price: asNullableNumber(body?.asking_price) ?? listingContext?.asking_price ?? null,
      deferred_maintenance: asNullableNumber(body?.deferred_maintenance) ?? listingContext?.deferred_total ?? 0,
      avionics_upgrade_budget: asNumber(body?.avionics_upgrade_budget, 0),
      paint_interior_budget: asNumber(body?.paint_interior_budget, 0),
      ferry_flight_cost: asNumber(body?.ferry_flight_cost, 0),
      hold_period_months: asNumber(body?.hold_period_months, 3),
      title_escrow_fees: asNumber(body?.title_escrow_fees, 800),
      insurance_estimate: asNumber(body?.insurance_estimate, 0),
      total_acquisition_cost: asNullableNumber(body?.total_acquisition_cost),
      estimated_resale_price: asNullableNumber(body?.estimated_resale_price),
      profit_at_ask: asNullableNumber(body?.profit_at_ask),
      profit_percent_at_ask: asNullableNumber(body?.profit_percent_at_ask),
      target_profit_dollars: asNumber(body?.target_profit_dollars, 8000),
      max_offer_price: asNullableNumber(body?.max_offer_price),
      source_listing_url: asString(body?.source_listing_url) ?? listingContext?.source_url ?? null,
      aircraft_label: asString(body?.aircraft_label) ?? buildAircraftLabelFromContext(listingContext, listingId),
      updated_at: new Date().toISOString(),
    };

    const supabase = createPrivilegedServerClient();
    const { data, error } = await supabase.from("deal_desk_scenarios").insert(insertPayload).select("*").single();
    if (error) throw new Error(error.message);

    const scenario = mapScenario((data ?? {}) as ScenarioRow);
    const listingMap = await getListingContexts([scenario.listing_id]);
    return NextResponse.json({
      ...scenario,
      listing_context: listingMap.get(scenario.listing_id) ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Deal Desk scenario" },
      { status: 500 }
    );
  }
}
