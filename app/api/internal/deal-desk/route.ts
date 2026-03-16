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

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function asJsonArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((entry) => entry && typeof entry === "object") as Record<string, unknown>[];
  return [];
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
    acquisition_items: asJsonArray(row.acquisition_items),
    upgrade_items: asJsonArray(row.upgrade_items),
    hangar_monthly: asNumber(row.hangar_monthly, 0),
    insurance_annual_premium: asNumber(row.insurance_annual_premium, 0),
    insurance_hull_value: asNumber(row.insurance_hull_value, 0),
    insurance_liability_limit: asString(row.insurance_liability_limit) || "1M",
    insurance_deductible_pct: asNumber(row.insurance_deductible_pct, 2),
    subscriptions_monthly: asNumber(row.subscriptions_monthly, 0),
    annual_inspection_reserve_monthly: asNumber(row.annual_inspection_reserve_monthly, 0),
    admin_overhead_monthly: asNumber(row.admin_overhead_monthly, 0),
    planned_hours_flown: asNumber(row.planned_hours_flown, 0),
    fuel_gph: asNumber(row.fuel_gph, 8),
    fuel_price_per_gallon: asNumber(row.fuel_price_per_gallon, 6.5),
    oil_cost_per_hour: asNumber(row.oil_cost_per_hour, 0.5),
    engine_reserve_per_hour: asNumber(row.engine_reserve_per_hour, 15),
    prop_reserve_per_hour: asNumber(row.prop_reserve_per_hour, 3),
    misc_maintenance_per_hour: asNumber(row.misc_maintenance_per_hour, 5),
    financing_enabled: asBoolean(row.financing_enabled, false),
    loan_amount: asNumber(row.loan_amount, 0),
    down_payment: asNumber(row.down_payment, 0),
    interest_rate_pct: asNumber(row.interest_rate_pct, 7.5),
    loan_term_years: asNumber(row.loan_term_years, 15),
    loan_origination_fees: asNumber(row.loan_origination_fees, 0),
    opportunity_cost_rate_pct: asNumber(row.opportunity_cost_rate_pct, 5),
    broker_commission_pct: asNumber(row.broker_commission_pct, 5),
    exit_escrow_fees: asNumber(row.exit_escrow_fees, 500),
    presale_spruce_up: asNumber(row.presale_spruce_up, 0),
    buyer_squawk_contingency_pct: asNumber(row.buyer_squawk_contingency_pct, 3),
    exit_sales_tax_pct: asNumber(row.exit_sales_tax_pct, 0),
    days_to_sell_base: asNumber(row.days_to_sell_base, 90),
    days_to_sell_slow: asNumber(row.days_to_sell_slow, 180),
    sale_price_low_pct: asNumber(row.sale_price_low_pct, -10),
    sale_price_stretch_pct: asNumber(row.sale_price_stretch_pct, 10),
    maintenance_contingency_pct: asNumber(row.maintenance_contingency_pct, 15),
    resale_base: asNullableNumber(row.resale_base),
    resale_low: asNullableNumber(row.resale_low),
    resale_stretch: asNullableNumber(row.resale_stretch),
    all_in_basis: asNullableNumber(row.all_in_basis),
    total_carrying_costs: asNullableNumber(row.total_carrying_costs),
    total_variable_costs: asNullableNumber(row.total_variable_costs),
    total_financing_cost_over_hold: asNullableNumber(row.total_financing_cost_over_hold),
    net_proceeds_after_exit: asNullableNumber(row.net_proceeds_after_exit),
    net_profit_base: asNullableNumber(row.net_profit_base),
    net_profit_low: asNullableNumber(row.net_profit_low),
    net_profit_stretch: asNullableNumber(row.net_profit_stretch),
    roi_pct_base: asNullableNumber(row.roi_pct_base),
    annualized_roi_pct_base: asNullableNumber(row.annualized_roi_pct_base),
    breakeven_sale_price: asNullableNumber(row.breakeven_sale_price),
    max_purchase_price_for_target_roi: asNullableNumber(row.max_purchase_price_for_target_roi),
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
      acquisition_items: asJsonArray(body?.acquisition_items),
      upgrade_items: asJsonArray(body?.upgrade_items),
      hangar_monthly: asNumber(body?.hangar_monthly, 0),
      insurance_annual_premium: asNumber(body?.insurance_annual_premium, 0),
      insurance_hull_value: asNumber(body?.insurance_hull_value, 0),
      insurance_liability_limit: asString(body?.insurance_liability_limit) || "1M",
      insurance_deductible_pct: asNumber(body?.insurance_deductible_pct, 2),
      subscriptions_monthly: asNumber(body?.subscriptions_monthly, 0),
      annual_inspection_reserve_monthly: asNumber(body?.annual_inspection_reserve_monthly, 0),
      admin_overhead_monthly: asNumber(body?.admin_overhead_monthly, 0),
      planned_hours_flown: asNumber(body?.planned_hours_flown, 0),
      fuel_gph: asNumber(body?.fuel_gph, 8),
      fuel_price_per_gallon: asNumber(body?.fuel_price_per_gallon, 6.5),
      oil_cost_per_hour: asNumber(body?.oil_cost_per_hour, 0.5),
      engine_reserve_per_hour: asNumber(body?.engine_reserve_per_hour, 15),
      prop_reserve_per_hour: asNumber(body?.prop_reserve_per_hour, 3),
      misc_maintenance_per_hour: asNumber(body?.misc_maintenance_per_hour, 5),
      financing_enabled: asBoolean(body?.financing_enabled, false),
      loan_amount: asNumber(body?.loan_amount, 0),
      down_payment: asNumber(body?.down_payment, 0),
      interest_rate_pct: asNumber(body?.interest_rate_pct, 7.5),
      loan_term_years: asNumber(body?.loan_term_years, 15),
      loan_origination_fees: asNumber(body?.loan_origination_fees, 0),
      opportunity_cost_rate_pct: asNumber(body?.opportunity_cost_rate_pct, 5),
      broker_commission_pct: asNumber(body?.broker_commission_pct, 5),
      exit_escrow_fees: asNumber(body?.exit_escrow_fees, 500),
      presale_spruce_up: asNumber(body?.presale_spruce_up, 0),
      buyer_squawk_contingency_pct: asNumber(body?.buyer_squawk_contingency_pct, 3),
      exit_sales_tax_pct: asNumber(body?.exit_sales_tax_pct, 0),
      days_to_sell_base: asNumber(body?.days_to_sell_base, 90),
      days_to_sell_slow: asNumber(body?.days_to_sell_slow, 180),
      sale_price_low_pct: asNumber(body?.sale_price_low_pct, -10),
      sale_price_stretch_pct: asNumber(body?.sale_price_stretch_pct, 10),
      maintenance_contingency_pct: asNumber(body?.maintenance_contingency_pct, 15),
      resale_base: asNullableNumber(body?.resale_base),
      resale_low: asNullableNumber(body?.resale_low),
      resale_stretch: asNullableNumber(body?.resale_stretch),
      all_in_basis: asNullableNumber(body?.all_in_basis),
      total_carrying_costs: asNullableNumber(body?.total_carrying_costs),
      total_variable_costs: asNullableNumber(body?.total_variable_costs),
      total_financing_cost_over_hold: asNullableNumber(body?.total_financing_cost_over_hold),
      net_proceeds_after_exit: asNullableNumber(body?.net_proceeds_after_exit),
      net_profit_base: asNullableNumber(body?.net_profit_base),
      net_profit_low: asNullableNumber(body?.net_profit_low),
      net_profit_stretch: asNullableNumber(body?.net_profit_stretch),
      roi_pct_base: asNullableNumber(body?.roi_pct_base),
      annualized_roi_pct_base: asNullableNumber(body?.annualized_roi_pct_base),
      breakeven_sale_price: asNullableNumber(body?.breakeven_sale_price),
      max_purchase_price_for_target_roi: asNullableNumber(body?.max_purchase_price_for_target_roi),
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
