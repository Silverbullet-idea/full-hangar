"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  calculateFlip,
  type AcquisitionItem,
  type FlipCalcInputs,
  type UpgradeItem,
} from "@/lib/dealDesk/calculations";
import type { DealDeskScenarioWithContext, DealDeskSeed } from "../types";

type SaveState = "idle" | "saving" | "saved" | "error";
type TabId = "overview" | "acquisition" | "upgrades" | "carrying" | "financing" | "exit" | "sensitivity";
type AcquisitionCategory = AcquisitionItem["category"];

const TAB_ORDER: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "acquisition", label: "Acquisition" },
  { id: "upgrades", label: "Upgrades" },
  { id: "carrying", label: "Carrying Costs" },
  { id: "financing", label: "Financing" },
  { id: "exit", label: "Exit" },
  { id: "sensitivity", label: "Sensitivity" },
];

const ACQUISITION_CATEGORY_META: Record<AcquisitionCategory, { title: string; icon: string }> = {
  prebuy: { title: "Pre-Buy", icon: "🔍" },
  closing: { title: "Closing", icon: "📋" },
  airworthiness: { title: "Immediate Airworthiness", icon: "🔧" },
  paperwork: { title: "Paperwork", icon: "📄" },
};

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "$0";
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

function profitColor(value: number): string {
  if (value < 0) return "text-red-400";
  if (Math.abs(value) < 3000) return "text-amber-300";
  return "text-emerald-400";
}

function parseCurrencyInput(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, "");
  return Number(digits || "0");
}

function toCurrencyDisplay(value: number): string {
  return Math.round(Math.max(0, value)).toLocaleString("en-US");
}

function baseAcquisitionDefaults(): AcquisitionItem[] {
  return [
    { id: crypto.randomUUID(), label: "Pre-buy inspection", amount: 800, category: "prebuy" },
    { id: crypto.randomUUID(), label: "Travel to inspection", amount: 400, category: "prebuy" },
    { id: crypto.randomUUID(), label: "Escrow & title", amount: 800, category: "closing" },
    { id: crypto.randomUUID(), label: "Registration", amount: 150, category: "closing" },
  ];
}

function normalizedTab(raw: string | null): TabId {
  const allowed: TabId[] = ["overview", "acquisition", "upgrades", "carrying", "financing", "exit", "sensitivity"];
  if (raw && allowed.includes(raw as TabId)) return raw as TabId;
  return "overview";
}

function extractMakeModelFromLabel(aircraftLabel: string): { make: string; model: string } | null {
  const withoutTail = aircraftLabel.replace(/\s+—\s+.*/, "").trim();
  const tokens = withoutTail.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const hasYear = /^\d{4}$/.test(tokens[0]);
  const make = hasYear ? tokens[1] : tokens[0];
  const modelTokens = hasYear ? tokens.slice(2) : tokens.slice(1);
  const model = modelTokens.join(" ").trim();
  if (!make || !model) return null;
  return { make, model };
}

export default function DealDeskPageClient({ seed }: { seed: DealDeskSeed }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [scenarioLabel, setScenarioLabel] = useState("Base Case");
  const [form, setForm] = useState<FlipCalcInputs>({
    purchase_price: Math.round(seed.askingPrice),
    resale_base: Math.round(seed.askingPrice * 1.12),
    resale_low: Math.round(seed.askingPrice * 1.02),
    resale_stretch: Math.round(seed.askingPrice * 1.22),
    hold_months: 3,
    planned_hours_flown: 0,
    acquisition_items: baseAcquisitionDefaults(),
    upgrade_items: [],
    hangar_monthly: 0,
    insurance_annual_premium: 0,
    subscriptions_monthly: 0,
    annual_inspection_reserve_monthly: 0,
    admin_overhead_monthly: 0,
    fuel_gph: 8,
    fuel_price_per_gallon: 6.5,
    oil_cost_per_hour: 0.5,
    engine_reserve_per_hour:
      typeof seed.engineReservePerHour === "number" && seed.engineReservePerHour > 0
        ? Number(seed.engineReservePerHour.toFixed(2))
        : 15,
    prop_reserve_per_hour: 3,
    misc_maintenance_per_hour: 5,
    financing_enabled: false,
    loan_amount: 0,
    interest_rate_pct: 7.5,
    loan_term_years: 15,
    loan_origination_fees: 0,
    opportunity_cost_rate_pct: 5,
    insurance_hull_value: 0,
    insurance_deductible_pct: 2,
    broker_commission_pct: 5,
    exit_escrow_fees: 500,
    presale_spruce_up: 0,
    buyer_squawk_contingency_pct: 3,
    exit_sales_tax_pct: 0,
    days_to_sell_slow: 180,
    maintenance_contingency_pct: 15,
    target_profit_dollars: 8000,
  });
  const [selectedSensitivityDays, setSelectedSensitivityDays] = useState(180);
  const [resaleUpliftEstimate, setResaleUpliftEstimate] = useState(0);
  const [newAcquisitionDraft, setNewAcquisitionDraft] = useState<
    Record<AcquisitionCategory, { label: string; amount: number }>
  >({
    prebuy: { label: "", amount: 0 },
    closing: { label: "", amount: 0 },
    airworthiness: { label: "", amount: 0 },
    paperwork: { label: "", amount: 0 },
  });
  const [newUpgradeDraft, setNewUpgradeDraft] = useState({
    label: "",
    amount: 0,
    type: "must_do" as UpgradeItem["type"],
    category: "avionics" as UpgradeItem["category"],
  });
  const savePayloadRef = useRef("");
  const makeModel =
    seed.make && seed.model ? { make: seed.make, model: seed.model } : extractMakeModelFromLabel(seed.aircraftLabel);
  const researchHref =
    makeModel != null
      ? `/internal/market-intel?make=${encodeURIComponent(makeModel.make)}&model=${encodeURIComponent(makeModel.model)}`
      : null;
  const suggestedEngineReserve =
    typeof seed.engineReservePerHour === "number" && seed.engineReservePerHour > 0
      ? Number(seed.engineReservePerHour.toFixed(2))
      : null;

  useEffect(() => {
    let active = true;
    fetch(`/api/internal/deal-desk?listing_id=${encodeURIComponent(seed.listingId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as DealDeskScenarioWithContext[];
      })
      .then((rows) => {
        if (!active) return;
        const scenario = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (!scenario) {
          setLoading(false);
          return;
        }
        setScenarioId(scenario.id);
        setScenarioLabel(scenario.label || "Base Case");
        const purchase = Math.round(scenario.asking_price ?? seed.askingPrice);
        const resaleBase = Math.round(scenario.resale_base ?? scenario.estimated_resale_price ?? purchase * 1.12);
        const resaleLow =
          Math.round(scenario.resale_low ?? resaleBase * (1 + (scenario.sale_price_low_pct ?? -10) / 100));
        const resaleStretch =
          Math.round(scenario.resale_stretch ?? resaleBase * (1 + (scenario.sale_price_stretch_pct ?? 10) / 100));
        const acquisitionItems =
          Array.isArray(scenario.acquisition_items) && scenario.acquisition_items.length > 0
            ? scenario.acquisition_items
            : baseAcquisitionDefaults();
        setForm({
          purchase_price: purchase,
          resale_base: resaleBase,
          resale_low: resaleLow,
          resale_stretch: resaleStretch,
          hold_months: Number(scenario.hold_period_months || 3),
          planned_hours_flown: Number(scenario.planned_hours_flown || 0),
          acquisition_items: acquisitionItems,
          upgrade_items: Array.isArray(scenario.upgrade_items) ? scenario.upgrade_items : [],
          hangar_monthly: Number(scenario.hangar_monthly || 0),
          insurance_annual_premium: Number(scenario.insurance_annual_premium || 0),
          subscriptions_monthly: Number(scenario.subscriptions_monthly || 0),
          annual_inspection_reserve_monthly: Number(scenario.annual_inspection_reserve_monthly || 0),
          admin_overhead_monthly: Number(scenario.admin_overhead_monthly || 0),
          fuel_gph: Number(scenario.fuel_gph || 8),
          fuel_price_per_gallon: Number(scenario.fuel_price_per_gallon || 6.5),
          oil_cost_per_hour: Number(scenario.oil_cost_per_hour || 0.5),
          engine_reserve_per_hour: Number(scenario.engine_reserve_per_hour || 15),
          prop_reserve_per_hour: Number(scenario.prop_reserve_per_hour || 3),
          misc_maintenance_per_hour: Number(scenario.misc_maintenance_per_hour || 5),
          financing_enabled: Boolean(scenario.financing_enabled),
          loan_amount: Number(scenario.loan_amount || 0),
          interest_rate_pct: Number(scenario.interest_rate_pct || 7.5),
          loan_term_years: Number(scenario.loan_term_years || 15),
          loan_origination_fees: Number(scenario.loan_origination_fees || 0),
          opportunity_cost_rate_pct: Number(scenario.opportunity_cost_rate_pct || 5),
          insurance_hull_value: Number(scenario.insurance_hull_value || 0),
          insurance_deductible_pct: Number(scenario.insurance_deductible_pct || 2),
          broker_commission_pct: Number(scenario.broker_commission_pct || 5),
          exit_escrow_fees: Number(scenario.exit_escrow_fees || 500),
          presale_spruce_up: Number(scenario.presale_spruce_up || 0),
          buyer_squawk_contingency_pct: Number(scenario.buyer_squawk_contingency_pct || 3),
          exit_sales_tax_pct: Number(scenario.exit_sales_tax_pct || 0),
          days_to_sell_slow: Number(scenario.days_to_sell_slow || 180),
          maintenance_contingency_pct: Number(scenario.maintenance_contingency_pct || 15),
          target_profit_dollars: Number(scenario.target_profit_dollars || 8000),
        });
        setSelectedSensitivityDays(Number(scenario.days_to_sell_slow || 180));
        setResaleUpliftEstimate(Math.max(0, resaleBase - resaleLow));
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [seed.askingPrice, seed.listingId]);

  const tab = normalizedTab(searchParams.get("tab"));
  const setTab = (next: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const outputs = useMemo(() => calculateFlip(form), [form]);
  const insuranceMonthly = form.insurance_annual_premium / 12;
  const fixedMonthly =
    form.hangar_monthly + insuranceMonthly + form.subscriptions_monthly + form.annual_inspection_reserve_monthly + form.admin_overhead_monthly;
  const variablePerHour =
    form.fuel_gph * form.fuel_price_per_gallon +
    form.oil_cost_per_hour +
    form.engine_reserve_per_hour +
    form.prop_reserve_per_hour +
    form.misc_maintenance_per_hour;
  const variableTotal = variablePerHour * form.planned_hours_flown;
  const opportunityCost =
    (form.purchase_price * (form.opportunity_cost_rate_pct / 100) * (Math.max(form.hold_months, 1) / 12)) || 0;
  const loanDownPayment = Math.max(0, form.purchase_price - form.loan_amount);
  const deductibleAmount = form.insurance_hull_value * (form.insurance_deductible_pct / 100);
  const slowSaleCell = outputs.sensitivity_grid.find((cell) => cell.days_to_sell === 180 && cell.sale_price_pct === 0);

  useEffect(() => {
    const payload = {
      label: scenarioLabel,
      asking_price: form.purchase_price,
      hold_period_months: form.hold_months,
      target_profit_dollars: form.target_profit_dollars,
      estimated_resale_price: form.resale_base,
      resale_base: form.resale_base,
      resale_low: form.resale_low,
      resale_stretch: form.resale_stretch,
      acquisition_items: form.acquisition_items,
      upgrade_items: form.upgrade_items,
      hangar_monthly: form.hangar_monthly,
      insurance_annual_premium: form.insurance_annual_premium,
      insurance_hull_value: form.insurance_hull_value,
      insurance_liability_limit: "1M",
      insurance_deductible_pct: form.insurance_deductible_pct,
      subscriptions_monthly: form.subscriptions_monthly,
      annual_inspection_reserve_monthly: form.annual_inspection_reserve_monthly,
      admin_overhead_monthly: form.admin_overhead_monthly,
      planned_hours_flown: form.planned_hours_flown,
      fuel_gph: form.fuel_gph,
      fuel_price_per_gallon: form.fuel_price_per_gallon,
      oil_cost_per_hour: form.oil_cost_per_hour,
      engine_reserve_per_hour: form.engine_reserve_per_hour,
      prop_reserve_per_hour: form.prop_reserve_per_hour,
      misc_maintenance_per_hour: form.misc_maintenance_per_hour,
      financing_enabled: form.financing_enabled,
      loan_amount: form.loan_amount,
      down_payment: loanDownPayment,
      interest_rate_pct: form.interest_rate_pct,
      loan_term_years: form.loan_term_years,
      loan_origination_fees: form.loan_origination_fees,
      opportunity_cost_rate_pct: form.opportunity_cost_rate_pct,
      broker_commission_pct: form.broker_commission_pct,
      exit_escrow_fees: form.exit_escrow_fees,
      presale_spruce_up: form.presale_spruce_up,
      buyer_squawk_contingency_pct: form.buyer_squawk_contingency_pct,
      exit_sales_tax_pct: form.exit_sales_tax_pct,
      days_to_sell_base: Math.round(form.hold_months * 30),
      days_to_sell_slow: form.days_to_sell_slow,
      sale_price_low_pct: form.resale_base > 0 ? ((form.resale_low - form.resale_base) / form.resale_base) * 100 : -10,
      sale_price_stretch_pct: form.resale_base > 0 ? ((form.resale_stretch - form.resale_base) / form.resale_base) * 100 : 10,
      maintenance_contingency_pct: form.maintenance_contingency_pct,
      deferred_maintenance: 0,
      avionics_upgrade_budget: outputs.section_totals.must_do_upgrades,
      paint_interior_budget: outputs.section_totals.value_add_upgrades,
      ferry_flight_cost: 0,
      title_escrow_fees: 0,
      insurance_estimate: insuranceMonthly * form.hold_months,
      total_acquisition_cost: outputs.section_totals.all_in_basis,
      profit_at_ask: outputs.base.net_profit,
      profit_percent_at_ask: outputs.base.roi_pct,
      max_offer_price: outputs.max_purchase_price_for_target,
      all_in_basis: outputs.section_totals.all_in_basis,
      total_carrying_costs: outputs.section_totals.fixed_carrying_total,
      total_variable_costs: outputs.section_totals.variable_operating_total,
      total_financing_cost_over_hold: outputs.section_totals.financing_cost_over_hold,
      net_proceeds_after_exit: outputs.base.net_proceeds,
      net_profit_base: outputs.base.net_profit,
      net_profit_low: outputs.low.net_profit,
      net_profit_stretch: outputs.stretch.net_profit,
      roi_pct_base: outputs.base.roi_pct,
      annualized_roi_pct_base: outputs.base.annualized_roi_pct,
      breakeven_sale_price: outputs.breakeven_sale_price,
      max_purchase_price_for_target_roi: outputs.max_purchase_price_for_target,
      source_listing_url: seed.sourceUrl,
      aircraft_label: seed.aircraftLabel,
    };
    const payloadJson = JSON.stringify(payload);
    if (payloadJson === savePayloadRef.current) return;
    const timeout = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        if (!scenarioId) {
          const response = await fetch("/api/internal/deal-desk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ listing_id: seed.listingId, ...payload }),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const created = (await response.json()) as DealDeskScenarioWithContext;
          setScenarioId(created.id);
        } else {
          const response = await fetch(`/api/internal/deal-desk/${scenarioId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        }
        savePayloadRef.current = payloadJson;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 1500);
    return () => window.clearTimeout(timeout);
  }, [form, insuranceMonthly, outputs, scenarioId, scenarioLabel, seed.aircraftLabel, seed.listingId, seed.sourceUrl]);

  if (loading) {
    return <div className="rounded border border-brand-dark bg-card-bg p-4 text-sm text-brand-muted">Loading Deal Desk scenario...</div>;
  }

  const acquisitionByCategory = (category: AcquisitionCategory) => form.acquisition_items.filter((item) => item.category === category);
  const acquisitionSubtotal = (category: AcquisitionCategory) =>
    acquisitionByCategory(category).reduce((total, item) => total + item.amount, 0);
  const selectedSensitivity = outputs.sensitivity_grid.filter((cell) => cell.days_to_sell === selectedSensitivityDays);

  return (
    <div className="space-y-3">
      {researchHref ? (
        <div className="flex justify-end">
          <Link
            href={researchHref}
            className="rounded border border-brand-dark px-3 py-2 text-xs text-brand-muted hover:border-brand-orange hover:text-brand-orange"
          >
            Research Market →
          </Link>
        </div>
      ) : null}
      <div className="sticky top-2 z-20 rounded border border-brand-dark bg-card-bg/95 p-3 backdrop-blur">
        <div className="grid gap-2 md:grid-cols-5">
          <SummaryStat label="All-in Basis" value={formatCurrency(outputs.section_totals.all_in_basis)} />
          <SummaryStat label="Net Profit (base)" value={formatCurrency(outputs.base.net_profit)} className={profitColor(outputs.base.net_profit)} />
          <SummaryStat label="ROI %" value={formatPercent(outputs.base.roi_pct)} className={profitColor(outputs.base.net_profit)} />
          <SummaryStat label="Annualized ROI" value={formatPercent(outputs.base.annualized_roi_pct)} className={profitColor(outputs.base.net_profit)} />
          <SummaryStat label="Break-even" value={formatCurrency(outputs.breakeven_sale_price)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TAB_ORDER.map((tabOption) => (
          <button
            key={tabOption.id}
            type="button"
            onClick={() => setTab(tabOption.id)}
            className={`rounded border px-3 py-1 text-sm ${
              tab === tabOption.id
                ? "border-brand-orange bg-brand-orange/20 text-brand-orange"
                : "border-brand-dark bg-card-bg text-brand-muted hover:border-brand-orange"
            }`}
          >
            {tabOption.label}
          </button>
        ))}
        <div className="ml-auto text-xs text-brand-muted">{saveState === "saving" ? "Saving..." : saveState === "error" ? "Save failed" : "Saved"}</div>
      </div>

      {tab === "overview" ? (
        <div className="grid gap-3 xl:grid-cols-2">
          <section className="rounded border border-brand-dark bg-card-bg p-4 space-y-3">
            <TextInput label="Scenario Label" value={scenarioLabel} onChange={setScenarioLabel} />
            <CurrencyInput label="Purchase Price" value={form.purchase_price} onChange={(value) => setForm((previous) => ({ ...previous, purchase_price: value }))} />
            <div>
              <p className="mb-1 text-sm text-brand-muted">Resale Price</p>
              <div className="grid gap-2 md:grid-cols-3">
                <CurrencyInput label="Low" value={form.resale_low} onChange={(value) => setForm((p) => ({ ...p, resale_low: value }))} />
                <CurrencyInput label="Base" value={form.resale_base} onChange={(value) => setForm((p) => ({ ...p, resale_base: value }))} />
                <CurrencyInput label="Stretch" value={form.resale_stretch} onChange={(value) => setForm((p) => ({ ...p, resale_stretch: value }))} />
              </div>
              <p className="mt-1 text-xs text-brand-muted">Base case used for headline metrics.</p>
            </div>
            <RangeInput label={`Hold Period: ${Math.round(form.hold_months)} months`} min={1} max={24} step={1} value={Math.round(form.hold_months)} onChange={(value) => setForm((previous) => ({ ...previous, hold_months: value }))} />
            <NumberInput label="Planned Hours Flown" value={form.planned_hours_flown} onChange={(value) => setForm((previous) => ({ ...previous, planned_hours_flown: value }))} />
            <RangeInput label={`Target Profit: ${formatCurrency(form.target_profit_dollars)}`} min={3000} max={25000} step={1000} value={form.target_profit_dollars} onChange={(value) => setForm((previous) => ({ ...previous, target_profit_dollars: value }))} />
          </section>
          <section className="rounded border border-brand-dark bg-card-bg p-4 space-y-3">
            <p className="text-sm text-brand-muted">Monthly burn rate</p>
            <p className="text-2xl font-bold text-brand-orange">{formatCurrency(outputs.monthly_burn_rate)}</p>
            <DonutBreakdown
              values={[
                { label: "Purchase", amount: form.purchase_price, color: "#f97316" },
                { label: "Acquisition", amount: outputs.section_totals.acquisition_capex, color: "#38bdf8" },
                { label: "Must-Do", amount: outputs.section_totals.must_do_upgrades, color: "#3b82f6" },
                { label: "Value-Add", amount: outputs.section_totals.value_add_upgrades, color: "#f59e0b" },
                { label: "Contingency", amount: (outputs.section_totals.must_do_upgrades + outputs.section_totals.value_add_upgrades) * (form.maintenance_contingency_pct / 100), color: "#a78bfa" },
              ]}
            />
            <div className="grid gap-2 md:grid-cols-3">
              <MetricCard label="Low" value={formatCurrency(outputs.low.net_profit)} className={profitColor(outputs.low.net_profit)} />
              <MetricCard label="Base" value={formatCurrency(outputs.base.net_profit)} className={profitColor(outputs.base.net_profit)} />
              <MetricCard label="Stretch" value={formatCurrency(outputs.stretch.net_profit)} className={profitColor(outputs.stretch.net_profit)} />
            </div>
            <div className="rounded border border-brand-dark overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-[#151515] text-brand-muted">
                  <tr><th className="px-2 py-2 text-left">Discount</th><th className="px-2 py-2 text-left">Offer</th><th className="px-2 py-2 text-left">Net Profit</th><th className="px-2 py-2 text-left">ROI</th></tr>
                </thead>
                <tbody>
                  {outputs.negotiation_table.map((row) => (
                    <tr key={row.discount} className="border-t border-brand-dark bg-[#131313]">
                      <td className="px-2 py-2">-{formatCurrency(row.discount)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.offer_price)}</td>
                      <td className={`px-2 py-2 ${profitColor(row.net_profit_base)}`}>{formatCurrency(row.net_profit_base)}</td>
                      <td className={`px-2 py-2 ${profitColor(row.net_profit_base)}`}>{formatPercent(row.roi_pct_base)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "acquisition" ? (
        <section className="rounded border border-brand-dark bg-card-bg p-4 space-y-3">
          {(Object.keys(ACQUISITION_CATEGORY_META) as AcquisitionCategory[]).map((category) => (
            <div key={category} className="rounded border border-brand-dark p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold">{ACQUISITION_CATEGORY_META[category].icon} {ACQUISITION_CATEGORY_META[category].title}</p>
                <p className="text-sm text-brand-muted">Subtotal {formatCurrency(acquisitionSubtotal(category))}</p>
              </div>
              <table className="w-full text-xs">
                <thead className="text-brand-muted"><tr><th className="px-2 py-1 text-left">Label</th><th className="px-2 py-1 text-left">Amount</th><th className="px-2 py-1 text-left">Delete</th></tr></thead>
                <tbody>
                  {acquisitionByCategory(category).map((item) => (
                    <tr key={item.id} className="border-t border-brand-dark">
                      <td className="px-2 py-1">{item.label}</td>
                      <td className="px-2 py-1">{formatCurrency(item.amount)}</td>
                      <td className="px-2 py-1">
                        <button type="button" onClick={() => setForm((previous) => ({ ...previous, acquisition_items: previous.acquisition_items.filter((entry) => entry.id !== item.id) }))} className="rounded border border-brand-dark px-2 py-0.5 text-brand-muted hover:text-red-300">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 grid gap-2 md:grid-cols-[1fr,180px,100px]">
                <input value={newAcquisitionDraft[category].label} onChange={(event) => setNewAcquisitionDraft((previous) => ({ ...previous, [category]: { ...previous[category], label: event.target.value } }))} placeholder="Add item label" className="rounded border border-brand-dark bg-[#121212] px-2 py-1 text-sm text-white outline-none focus:border-brand-orange" />
                <CurrencyInputInline value={newAcquisitionDraft[category].amount} onChange={(value) => setNewAcquisitionDraft((previous) => ({ ...previous, [category]: { ...previous[category], amount: value } }))} />
                <button type="button" onClick={() => { if (!newAcquisitionDraft[category].label.trim()) return; setForm((previous) => ({ ...previous, acquisition_items: [...previous.acquisition_items, { id: crypto.randomUUID(), label: newAcquisitionDraft[category].label.trim(), amount: newAcquisitionDraft[category].amount, category }] })); setNewAcquisitionDraft((previous) => ({ ...previous, [category]: { label: "", amount: 0 } })); }} className="rounded bg-brand-orange px-2 py-1 text-sm font-semibold !text-black hover:bg-brand-burn">Add item</button>
              </div>
            </div>
          ))}
          <p className="text-lg font-semibold text-brand-orange">Total Acquisition Capex: {formatCurrency(outputs.section_totals.acquisition_capex)}</p>
        </section>
      ) : null}

      {tab === "upgrades" ? (
        <section className="rounded border border-brand-dark bg-card-bg p-4 space-y-3">
          <div className="rounded border border-brand-dark p-3">
            <p className="mb-2 font-semibold">Add upgrade line item</p>
            <div className="grid gap-2 md:grid-cols-5">
              <input value={newUpgradeDraft.label} onChange={(event) => setNewUpgradeDraft((previous) => ({ ...previous, label: event.target.value }))} placeholder="Upgrade label" className="rounded border border-brand-dark bg-[#121212] px-2 py-1 text-sm text-white outline-none focus:border-brand-orange md:col-span-2" />
              <CurrencyInputInline value={newUpgradeDraft.amount} onChange={(value) => setNewUpgradeDraft((previous) => ({ ...previous, amount: value }))} />
              <select value={newUpgradeDraft.type} onChange={(event) => setNewUpgradeDraft((previous) => ({ ...previous, type: event.target.value as UpgradeItem["type"] }))} className="rounded border border-brand-dark bg-[#121212] px-2 py-1 text-sm text-white"><option value="must_do">Must Do</option><option value="value_add">Value Add</option></select>
              <select value={newUpgradeDraft.category} onChange={(event) => setNewUpgradeDraft((previous) => ({ ...previous, category: event.target.value as UpgradeItem["category"] }))} className="rounded border border-brand-dark bg-[#121212] px-2 py-1 text-sm text-white"><option value="avionics">Avionics</option><option value="interior">Interior</option><option value="paint">Paint</option><option value="engine">Engine</option><option value="prop">Prop</option><option value="mod">Mod/STC</option></select>
            </div>
            <button type="button" onClick={() => { if (!newUpgradeDraft.label.trim()) return; setForm((previous) => ({ ...previous, upgrade_items: [...previous.upgrade_items, { ...newUpgradeDraft, id: crypto.randomUUID(), label: newUpgradeDraft.label.trim() }] })); setNewUpgradeDraft({ label: "", amount: 0, type: "must_do", category: "avionics" }); }} className="mt-2 rounded bg-brand-orange px-3 py-1 text-sm font-semibold !text-black hover:bg-brand-burn">Add item</button>
          </div>
          <div className="rounded border border-brand-dark overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-[#151515] text-brand-muted"><tr><th className="px-2 py-2 text-left">Label</th><th className="px-2 py-2 text-left">Amount</th><th className="px-2 py-2 text-left">Type</th><th className="px-2 py-2 text-left">Category</th><th className="px-2 py-2 text-left">Delete</th></tr></thead>
              <tbody>
                {form.upgrade_items.map((item) => (
                  <tr key={item.id} className="border-t border-brand-dark bg-[#131313]">
                    <td className="px-2 py-2">{item.label}</td>
                    <td className="px-2 py-2">{formatCurrency(item.amount)}</td>
                    <td className="px-2 py-2"><button type="button" onClick={() => setForm((previous) => ({ ...previous, upgrade_items: previous.upgrade_items.map((entry) => entry.id === item.id ? { ...entry, type: entry.type === "must_do" ? "value_add" : "must_do" } : entry) }))} className={`rounded px-2 py-0.5 text-[11px] font-semibold ${item.type === "must_do" ? "bg-blue-500/20 text-blue-300" : "bg-orange-500/20 text-orange-300"}`}>{item.type === "must_do" ? "Must Do" : "Value Add"}</button></td>
                    <td className="px-2 py-2">{item.category}</td>
                    <td className="px-2 py-2"><button type="button" onClick={() => setForm((previous) => ({ ...previous, upgrade_items: previous.upgrade_items.filter((entry) => entry.id !== item.id) }))} className="rounded border border-brand-dark px-2 py-0.5 text-brand-muted hover:text-red-300">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <SummaryStat label="Must-Do total" value={formatCurrency(outputs.section_totals.must_do_upgrades)} />
            <SummaryStat label="Value-Add total" value={formatCurrency(outputs.section_totals.value_add_upgrades)} />
            <div className="rounded border border-brand-dark p-2"><RangeInput label={`Contingency ${form.maintenance_contingency_pct}%`} min={5} max={25} step={5} value={form.maintenance_contingency_pct} onChange={(value) => setForm((previous) => ({ ...previous, maintenance_contingency_pct: value }))} /></div>
            <SummaryStat label="Grand total + contingency" value={formatCurrency(outputs.section_totals.must_do_upgrades + outputs.section_totals.value_add_upgrades + (outputs.section_totals.must_do_upgrades + outputs.section_totals.value_add_upgrades) * (form.maintenance_contingency_pct / 100))} />
          </div>
          <div className="rounded border border-brand-dark p-3">
            <CurrencyInput label="Resale uplift estimate from value-add" value={resaleUpliftEstimate} onChange={setResaleUpliftEstimate} />
            <p className="mt-2 text-sm text-brand-muted">If value-add work adds {formatCurrency(resaleUpliftEstimate)} to resale, return on {formatCurrency(outputs.section_totals.value_add_upgrades)} invested = {outputs.section_totals.value_add_upgrades > 0 ? formatPercent((resaleUpliftEstimate / outputs.section_totals.value_add_upgrades) * 100) : "0.0%"}</p>
          </div>
        </section>
      ) : null}

      {tab === "carrying" ? (
        <section className="grid gap-3 xl:grid-cols-2">
          <div className="rounded border border-brand-dark bg-card-bg p-4 space-y-2">
            <p className="font-semibold">Fixed (per month)</p>
            <CurrencyInput label="Hangar / Tie-down" value={form.hangar_monthly} onChange={(value) => setForm((p) => ({ ...p, hangar_monthly: value }))} />
            <StaticRow label="Insurance (monthly)" value={formatCurrency(insuranceMonthly)} />
            <CurrencyInput label="Subscriptions" value={form.subscriptions_monthly} onChange={(value) => setForm((p) => ({ ...p, subscriptions_monthly: value }))} />
            <CurrencyInput label="Annual inspection accrual" value={form.annual_inspection_reserve_monthly} onChange={(value) => setForm((p) => ({ ...p, annual_inspection_reserve_monthly: value }))} />
            <CurrencyInput label="Admin / LLC / accounting" value={form.admin_overhead_monthly} onChange={(value) => setForm((p) => ({ ...p, admin_overhead_monthly: value }))} />
            <StaticRow label="Fixed monthly total" value={formatCurrency(fixedMonthly)} />
            <StaticRow label={`× Hold months (${form.hold_months})`} value="" />
            <StaticRow label="Total fixed carrying" value={formatCurrency(outputs.section_totals.fixed_carrying_total)} bold />
          </div>
          <div className="rounded border border-brand-dark bg-card-bg p-4 space-y-2">
            <p className="font-semibold">Insurance detail</p>
            <CurrencyInput label="Annual premium" value={form.insurance_annual_premium} onChange={(value) => setForm((p) => ({ ...p, insurance_annual_premium: value }))} />
            <CurrencyInput label="Hull value insured" value={form.insurance_hull_value} onChange={(value) => setForm((p) => ({ ...p, insurance_hull_value: value }))} />
            <NumberInput label="Deductible %" value={form.insurance_deductible_pct} onChange={(value) => setForm((p) => ({ ...p, insurance_deductible_pct: value }))} />
            <StaticRow label="Deductible amount" value={formatCurrency(deductibleAmount)} />
            <p className="text-xs text-brand-muted">Lender typically requires hull coverage at or above loan amount.</p>
            <p className="mt-2 font-semibold">Variable (if flying)</p>
            <div className="grid gap-2 md:grid-cols-2"><NumberInput label="Fuel GPH" value={form.fuel_gph} onChange={(value) => setForm((p) => ({ ...p, fuel_gph: value }))} /><CurrencyInput label="Fuel price per gallon" value={form.fuel_price_per_gallon} onChange={(value) => setForm((p) => ({ ...p, fuel_price_per_gallon: value }))} /></div>
            <CurrencyInput label="Oil per hour" value={form.oil_cost_per_hour} onChange={(value) => setForm((p) => ({ ...p, oil_cost_per_hour: value }))} />
            <CurrencyInput label="Engine reserve per hour" value={form.engine_reserve_per_hour} onChange={(value) => setForm((p) => ({ ...p, engine_reserve_per_hour: value }))} />
            {suggestedEngineReserve !== null ? (
              <div className="rounded border border-brand-dark bg-[var(--surface-muted)] px-3 py-2 text-xs text-brand-muted">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-brand-dark text-[11px] text-brand-orange"
                    title="Based on AirPower exchange pricing. Adjust to your actual maintenance reserve."
                    aria-label="Engine reserve suggestion details"
                  >
                    i
                  </span>
                  <span>{`Suggested reserve: ${formatCurrency(suggestedEngineReserve)}/h`}</span>
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, engine_reserve_per_hour: suggestedEngineReserve }))}
                    className="rounded border border-brand-dark px-2 py-0.5 text-[11px] text-brand-white hover:border-brand-orange hover:text-brand-orange"
                  >
                    Use suggestion
                  </button>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-brand-muted/90">
                  Advisory only. Update this to match your maintenance program assumptions.
                </p>
              </div>
            ) : null}
            <CurrencyInput label="Prop reserve per hour" value={form.prop_reserve_per_hour} onChange={(value) => setForm((p) => ({ ...p, prop_reserve_per_hour: value }))} />
            <CurrencyInput label="Misc maintenance per hour" value={form.misc_maintenance_per_hour} onChange={(value) => setForm((p) => ({ ...p, misc_maintenance_per_hour: value }))} />
            <StaticRow label="Hourly operating cost" value={formatCurrency(variablePerHour)} />
            <StaticRow label={`× Planned hours (${form.planned_hours_flown})`} value="" />
            <StaticRow label="Total variable" value={formatCurrency(variableTotal)} bold />
          </div>
        </section>
      ) : null}

      {tab === "financing" ? (
        <section className="rounded border border-brand-dark bg-card-bg p-4 space-y-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm((previous) => ({ ...previous, financing_enabled: false }))} className={`rounded border px-3 py-1 text-sm ${!form.financing_enabled ? "border-brand-orange bg-brand-orange/20 text-brand-orange" : "border-brand-dark text-brand-muted"}`}>Cash Deal</button>
            <button type="button" onClick={() => setForm((previous) => ({ ...previous, financing_enabled: true }))} className={`rounded border px-3 py-1 text-sm ${form.financing_enabled ? "border-brand-orange bg-brand-orange/20 text-brand-orange" : "border-brand-dark text-brand-muted"}`}>Financed</button>
          </div>
          {!form.financing_enabled ? (
            <div className="space-y-2"><NumberInput label="Opportunity cost rate %" value={form.opportunity_cost_rate_pct} onChange={(value) => setForm((previous) => ({ ...previous, opportunity_cost_rate_pct: value }))} /><p className="text-sm text-brand-muted">Opportunity cost over hold: {formatCurrency(opportunityCost)} (not included in profit calculation).</p></div>
          ) : (
            <div className="space-y-2">
              <CurrencyInput label="Loan amount" value={form.loan_amount} onChange={(value) => setForm((previous) => ({ ...previous, loan_amount: value }))} />
              <StaticRow label="Down payment" value={formatCurrency(loanDownPayment)} />
              <NumberInput label="Interest rate %" value={form.interest_rate_pct} onChange={(value) => setForm((previous) => ({ ...previous, interest_rate_pct: value }))} />
              <label className="block"><p className="mb-1 text-sm text-brand-muted">Loan term</p><select value={form.loan_term_years} onChange={(event) => setForm((previous) => ({ ...previous, loan_term_years: Number(event.target.value) }))} className="w-full rounded border border-brand-dark bg-[#121212] px-2 py-2 text-sm text-white"><option value={10}>10 years</option><option value={15}>15 years</option><option value={20}>20 years</option></select></label>
              <CurrencyInput label="Origination / doc fees" value={form.loan_origination_fees} onChange={(value) => setForm((previous) => ({ ...previous, loan_origination_fees: value }))} />
              <StaticRow label="Total financing cost over hold" value={formatCurrency(outputs.section_totals.financing_cost_over_hold)} bold />
              <p className="text-xs text-brand-muted">Required hull coverage minimum: {formatCurrency(form.loan_amount)}</p>
            </div>
          )}
        </section>
      ) : null}

      {tab === "exit" ? (
        <section className="rounded border border-brand-dark bg-card-bg p-4 space-y-2">
          <NumberInput label="Broker commission %" value={form.broker_commission_pct} onChange={(value) => setForm((previous) => ({ ...previous, broker_commission_pct: value }))} />
          <p className="text-xs text-brand-muted">{formatCurrency((form.resale_base * form.broker_commission_pct) / 100)} at base resale price.</p>
          <CurrencyInput label="Exit escrow & title" value={form.exit_escrow_fees} onChange={(value) => setForm((previous) => ({ ...previous, exit_escrow_fees: value }))} />
          <CurrencyInput label="Pre-sale spruce-up" value={form.presale_spruce_up} onChange={(value) => setForm((previous) => ({ ...previous, presale_spruce_up: value }))} />
          <NumberInput label="Buyer squawk contingency %" value={form.buyer_squawk_contingency_pct} onChange={(value) => setForm((previous) => ({ ...previous, buyer_squawk_contingency_pct: value }))} />
          <p className="text-xs text-brand-muted">{formatCurrency(outputs.section_totals.all_in_basis * (form.buyer_squawk_contingency_pct / 100))} contingency.</p>
          <NumberInput label="Sales / use tax %" value={form.exit_sales_tax_pct} onChange={(value) => setForm((previous) => ({ ...previous, exit_sales_tax_pct: value }))} />
          <p className="text-xs text-brand-muted">Check your state's resale exemption rules.</p>
          <StaticRow label="Net sale proceeds (base)" value={formatCurrency(outputs.base.net_proceeds)} bold />
          <p className="text-xs text-brand-muted">Low {formatCurrency(outputs.low.net_proceeds)} · Stretch {formatCurrency(outputs.stretch.net_proceeds)}</p>
        </section>
      ) : null}

      {tab === "sensitivity" ? (
        <section className="rounded border border-brand-dark bg-card-bg p-4 space-y-3">
          <RangeInput label={`Days-to-sell: ${selectedSensitivityDays}`} min={90} max={270} step={90} value={selectedSensitivityDays} onChange={(value) => { setSelectedSensitivityDays(value); setForm((previous) => ({ ...previous, days_to_sell_slow: value })); }} />
          <RangeInput label={`Contingency: ${form.maintenance_contingency_pct}%`} min={5} max={25} step={5} value={form.maintenance_contingency_pct} onChange={(value) => setForm((previous) => ({ ...previous, maintenance_contingency_pct: value }))} />
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-xs">
              <thead className="bg-[#151515] text-brand-muted"><tr><th className="px-2 py-2 text-left">Days</th><th className="px-2 py-2 text-left">Low -10%</th><th className="px-2 py-2 text-left">Base</th><th className="px-2 py-2 text-left">Stretch +10%</th></tr></thead>
              <tbody>
                {[90, 180, 270].map((days) => (
                  <tr key={days} className="border-t border-brand-dark">
                    <td className="px-2 py-2 font-semibold">{days}</td>
                    {[-10, 0, 10].map((salePct) => {
                      const cell = outputs.sensitivity_grid.find((entry) => entry.days_to_sell === days && entry.sale_price_pct === salePct);
                      const profit = cell?.net_profit ?? 0;
                      const color = profit < 0 ? "bg-red-500/20" : profit < form.target_profit_dollars ? "bg-amber-500/20" : "bg-emerald-500/20";
                      const activeBorder = days === selectedSensitivityDays && salePct === 0 ? "ring-1 ring-brand-orange" : "";
                      return <td key={`${days}-${salePct}`} className={`px-2 py-2 ${color} ${activeBorder}`}><p className={profitColor(profit)}>{formatCurrency(profit)}</p><p className="text-brand-muted">{formatPercent(cell?.roi_pct ?? 0)}</p></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <SummaryStat label="Break-even sale price" value={formatCurrency(outputs.breakeven_sale_price)} />
            <SummaryStat label={`Max purchase for ${formatCurrency(form.target_profit_dollars)} target`} value={formatCurrency(outputs.max_purchase_price_for_target)} />
            <SummaryStat label="At current purchase, break-even" value={formatCurrency(outputs.breakeven_sale_price)} />
          </div>
          <div className="space-y-2">
            {slowSaleCell && slowSaleCell.net_profit < 0 && outputs.base.net_profit > 0 ? <WarningCard text="Slow sale (+90 days) turns this deal negative." /> : null}
            {(resaleUpliftEstimate <= 0 || outputs.section_totals.value_add_upgrades > resaleUpliftEstimate) && outputs.section_totals.value_add_upgrades > 0 ? <WarningCard text="Value-add ROI is negative — upgrades cost more than they add." /> : null}
            {outputs.monthly_burn_rate > 1500 ? <WarningCard text="Monthly burn exceeds $1,500 — time kills this deal." /> : null}
          </div>
          {selectedSensitivity.length > 0 ? <p className="text-xs text-brand-muted">Selected days scenario: {selectedSensitivity.map((cell) => `${cell.sale_price_pct}%: ${formatCurrency(cell.net_profit)}`).join(" · ")}</p> : null}
        </section>
      ) : null}
    </div>
  );
}

function SummaryStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded border border-brand-dark bg-[#121212] p-2">
      <p className="text-[11px] uppercase tracking-wide text-brand-muted">{label}</p>
      <p className={`text-sm font-semibold ${className ?? ""}`}>{value}</p>
    </div>
  );
}

function MetricCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded border border-brand-dark p-2">
      <p className="text-xs text-brand-muted">{label}</p>
      <p className={`text-lg font-semibold ${className ?? ""}`}>{value}</p>
    </div>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <p className="mb-1 text-sm text-brand-muted">{label}</p>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded border border-brand-dark bg-[#121212] px-2 py-2 text-sm text-white outline-none focus:border-brand-orange" />
    </label>
  );
}

function CurrencyInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <p className="mb-1 text-sm text-brand-muted">{label}</p>
      <div className="flex items-center rounded border border-brand-dark bg-[#121212] px-2">
        <span className="text-sm text-brand-muted">$</span>
        <input inputMode="numeric" value={toCurrencyDisplay(value)} onChange={(event) => onChange(parseCurrencyInput(event.target.value))} className="w-full bg-transparent px-2 py-2 text-sm text-white outline-none" />
      </div>
    </label>
  );
}

function CurrencyInputInline({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center rounded border border-brand-dark bg-[#121212] px-2">
      <span className="text-sm text-brand-muted">$</span>
      <input inputMode="numeric" value={toCurrencyDisplay(value)} onChange={(event) => onChange(parseCurrencyInput(event.target.value))} className="w-full bg-transparent px-2 py-1 text-sm text-white outline-none" />
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <p className="mb-1 text-sm text-brand-muted">{label}</p>
      <input type="number" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value || "0"))} className="w-full rounded border border-brand-dark bg-[#121212] px-2 py-2 text-sm text-white outline-none focus:border-brand-orange" />
    </label>
  );
}

function RangeInput({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <p className="mb-1 text-sm text-brand-muted">{label}</p>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-brand-orange" />
    </label>
  );
}

function StaticRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-brand-muted">{label}</span>
      <span className={bold ? "font-semibold text-brand-orange" : ""}>{value}</span>
    </div>
  );
}

function WarningCard({ text }: { text: string }) {
  return <div className="rounded border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">⚠️ {text}</div>;
}

function DonutBreakdown({ values }: { values: Array<{ label: string; amount: number; color: string }> }) {
  const total = values.reduce((sum, item) => sum + Math.max(0, item.amount), 0);
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width="130" height="130" viewBox="0 0 42 42">
        <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#222" strokeWidth="7" />
        {values.map((item) => {
          const normalized = total > 0 ? (Math.max(0, item.amount) / total) * 100 : 0;
          const segment = <circle key={item.label} cx="21" cy="21" r="15.915" fill="transparent" stroke={item.color} strokeWidth="7" strokeDasharray={`${normalized} ${100 - normalized}`} strokeDashoffset={-offset} transform="rotate(-90 21 21)" />;
          offset += normalized;
          return segment;
        })}
      </svg>
      <div className="space-y-1 text-xs">
        {values.map((item) => (
          <p key={item.label}><span style={{ color: item.color }}>●</span> {item.label}: {formatCurrency(item.amount)}</p>
        ))}
      </div>
    </div>
  );
}
