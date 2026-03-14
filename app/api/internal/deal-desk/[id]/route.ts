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

async function withListingContext(scenario: ReturnType<typeof mapScenario>) {
  const supabase = createPrivilegedServerClient();
  const { data } = await supabase
    .from("public_listings")
    .select("*")
    .eq("id", scenario.listing_id)
    .maybeSingle();

  return {
    ...scenario,
    listing_context: mapListingContext((data ?? null) as ListingRow | null),
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  try {
    const { id } = await params;
    const supabase = createPrivilegedServerClient();
    const { data, error } = await supabase.from("deal_desk_scenarios").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(await withListingContext(mapScenario(data as ScenarioRow)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Deal Desk scenario" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const { id } = await params;
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const numericFields = [
      "asking_price",
      "deferred_maintenance",
      "avionics_upgrade_budget",
      "paint_interior_budget",
      "ferry_flight_cost",
      "hold_period_months",
      "title_escrow_fees",
      "insurance_estimate",
      "total_acquisition_cost",
      "estimated_resale_price",
      "profit_at_ask",
      "profit_percent_at_ask",
      "target_profit_dollars",
      "max_offer_price",
    ];

    for (const key of numericFields) {
      if (!(key in (body ?? {}))) continue;
      updates[key] = body?.[key] == null ? null : asNullableNumber(body?.[key]);
    }

    if (body && "label" in body) updates.label = asString(body.label) || "Base Case";
    if (body && "source_listing_url" in body) updates.source_listing_url = asString(body.source_listing_url);
    if (body && "aircraft_label" in body) updates.aircraft_label = asString(body.aircraft_label);

    const supabase = createPrivilegedServerClient();
    const { data, error } = await supabase
      .from("deal_desk_scenarios")
      .update(updates)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(await withListingContext(mapScenario(data as ScenarioRow)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update Deal Desk scenario" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  try {
    const { id } = await params;
    const supabase = createPrivilegedServerClient();
    const { error } = await supabase.from("deal_desk_scenarios").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete Deal Desk scenario" },
      { status: 500 }
    );
  }
}
