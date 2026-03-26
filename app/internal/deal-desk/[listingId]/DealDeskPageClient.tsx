"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

const WIZARD_STEPS: Array<{ step: number; label: string }> = [
  { step: 1, label: "Aircraft" },
  { step: 2, label: "Acquisition" },
  { step: 3, label: "Upgrades" },
  { step: 4, label: "Carrying" },
  { step: 5, label: "Financing & exit" },
  { step: 6, label: "Sensitivity" },
];

const WIZARD_STEP_META: Record<number, { title: string; subtitle: string }> = {
  1: { title: "Aircraft & scenario", subtitle: "Purchase basis, resale band, hold, hours, and profit target." },
  2: { title: "Acquisition capex", subtitle: "Pre-buy, closing, and immediate airworthiness line items." },
  3: { title: "Upgrades & contingency", subtitle: "Must-do vs value-add work and maintenance contingency." },
  4: { title: "Carrying costs", subtitle: "Fixed monthly burn, insurance, and variable hourly operating cost." },
  5: { title: "Financing & exit", subtitle: "Loan or opportunity cost, then brokerage, escrow, and sale taxes." },
  6: { title: "Sensitivity", subtitle: "Stress days-to-sell and margin before you lock the deal." },
};

const WIZARD_STEP_ICONS: Record<number, string> = {
  1: "✈️",
  2: "📥",
  3: "🔧",
  4: "📅",
  5: "🏁",
  6: "📊",
};

function normalizedEngineLifePercent(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw >= 0 && raw <= 1) return raw * 100;
  if (raw > 1 && raw <= 100) return raw;
  return null;
}

function accordionStepBadge(step: number, wizardStep: number, maxWizardStep: number): { label: string; tone: "orange" | "green" | "slate" } {
  if (step > maxWizardStep) return { label: "LOCKED", tone: "slate" };
  if (step < wizardStep) return { label: "DONE", tone: "green" };
  if (step === wizardStep) return step === 6 ? { label: "WRAP UP", tone: "green" } : { label: "IN PROGRESS", tone: "orange" };
  return { label: "NEXT", tone: "slate" };
}

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

function formatSignedCurrency(value: number): string {
  const n = Math.round(value);
  const core = `$${Math.abs(n).toLocaleString("en-US")}`;
  if (n < 0) return `−${core}`;
  return n > 0 ? core : "$0";
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

function DealDeskChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors min-h-[40px] md:min-h-0 ${
        selected
          ? "border-brand-orange bg-brand-orange/20 text-brand-orange"
          : "border-[var(--fh-border)] bg-[var(--fh-bg3)] text-brand-muted hover:border-brand-orange/40 hover:text-brand-orange"
      }`}
    >
      {children}
    </button>
  );
}

function DealDeskInsight({
  variant,
  title,
  children,
}: {
  variant: "amber" | "blue" | "green" | "red";
  title?: string;
  children: ReactNode;
}) {
  const box =
    variant === "amber"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
      : variant === "blue"
        ? "border-sky-500/35 bg-sky-500/10 text-sky-100"
        : variant === "green"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
          : "border-rose-500/40 bg-rose-500/10 text-rose-100";
  return (
    <div className={`rounded-lg border px-3 py-2 text-[12px] leading-snug ${box}`}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="text-[11px] opacity-95 [&_strong]:font-semibold [&_strong]:text-inherit">{children}</div>
    </div>
  );
}

function DealDeskQuestionBlock({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-5 space-y-2">
      <div>
        <p className="text-xs font-semibold text-brand-white">{label}</p>
        {hint ? <p className="mt-0.5 text-[10px] italic text-brand-muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export default function DealDeskPageClient({ seed }: { seed: DealDeskSeed }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const classicMode = searchParams.get("classic") === "1";
  const [wizardStep, setWizardStep] = useState(1);
  const [maxWizardStep, setMaxWizardStep] = useState(1);
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
  const [financingIntent, setFinancingIntent] = useState<"cash" | "loan" | "partnership">("cash");
  const financingIntentHydrated = useRef(false);
  const [exitChannel, setExitChannel] = useState<string | null>(null);
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

  useEffect(() => {
    if (loading || financingIntentHydrated.current) return;
    financingIntentHydrated.current = true;
    if (form.financing_enabled) setFinancingIntent("loan");
  }, [loading, form.financing_enabled]);

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

  useEffect(() => {
    if (classicMode) return;
    const s = Number(searchParams.get("step"));
    if (Number.isFinite(s) && s >= 1 && s <= 6) {
      setWizardStep(s);
      setMaxWizardStep((m) => Math.max(m, s));
    }
  }, [classicMode, searchParams]);

  const setWizardStepUrl = (n: number, options?: { advanceMax?: boolean }) => {
    const next = Math.min(6, Math.max(1, n));
    if (next > maxWizardStep && !options?.advanceMax) return;
    setWizardStep(next);
    if (options?.advanceMax) {
      setMaxWizardStep((m) => Math.max(m, next));
    }
    if (!classicMode) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("step", String(next));
      params.delete("tab");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  };

  const [accordionPinnedSteps, setAccordionPinnedSteps] = useState<number[]>([]);

  const accordionStepExpanded = (step: number) => {
    if (classicMode) return true;
    if (step === wizardStep) return true;
    if (step < wizardStep) return accordionPinnedSteps.includes(step);
    return false;
  };

  const handleAccordionHeaderClick = (step: number) => {
    if (classicMode) return;
    if (step > maxWizardStep) return;
    if (step === wizardStep) return;
    if (step < wizardStep) {
      setAccordionPinnedSteps((prev) => (prev.includes(step) ? prev.filter((s) => s !== step) : [...prev, step]));
      return;
    }
    setWizardStepUrl(step);
  };

  const showOverview = classicMode ? tab === "overview" : wizardStep === 1;
  const showAcquisition = classicMode ? tab === "acquisition" : wizardStep === 2;
  const showUpgrades = classicMode ? tab === "upgrades" : wizardStep === 3;
  const showCarrying = classicMode ? tab === "carrying" : wizardStep === 4;
  const showFinancing = classicMode ? tab === "financing" : wizardStep === 5;
  const showExit = classicMode ? tab === "exit" : wizardStep === 5;
  const showSensitivity = classicMode ? tab === "sensitivity" : wizardStep === 6;

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
  const dealGrade =
    outputs.base.net_profit >= form.target_profit_dollars
      ? { label: "Strong", className: "text-emerald-400" as const }
      : outputs.base.net_profit >= 0
        ? { label: "Marginal", className: "text-amber-300" as const }
        : { label: "Weak", className: "text-red-400" as const };

  const wizardVerdict =
    outputs.base.net_profit >= form.target_profit_dollars
      ? { key: "GO" as const, box: "border-emerald-500/40 bg-emerald-500/10", text: "text-emerald-300" }
      : outputs.base.net_profit >= 0
        ? { key: "CAUTION" as const, box: "border-amber-500/40 bg-amber-500/10", text: "text-amber-200" }
        : { key: "NO-GO" as const, box: "border-rose-500/40 bg-rose-500/10", text: "text-rose-200" };

  const purchaseVsAsking = form.purchase_price - seed.askingPrice;
  const purchaseVsAskingPct = seed.askingPrice > 0 ? (purchaseVsAsking / seed.askingPrice) * 100 : 0;
  const sellerMotivation =
    Boolean(seed.priceReduced) || (typeof seed.daysOnMarket === "number" && seed.daysOnMarket >= 75);
  const resaleVsAsk = form.resale_base - seed.askingPrice;
  const resaleVsAskPct = seed.askingPrice > 0 ? (resaleVsAsk / seed.askingPrice) * 100 : 0;
  const stretchExitVsAsk = seed.askingPrice > 0 && form.resale_base > seed.askingPrice * 1.1;

  const financingSection = (
    <section className="rounded border border-brand-dark bg-card-bg p-4 space-y-3">
      <DealDeskQuestionBlock
        label="How are you financing?"
        hint="Aviation loans stack interest + fees into carrying cost (see Live P&amp;L and the Carrying step)."
      >
        <div className="flex flex-wrap gap-2">
          <DealDeskChip
            selected={!form.financing_enabled && financingIntent === "cash"}
            onClick={() => {
              setFinancingIntent("cash");
              setForm((previous) => ({ ...previous, financing_enabled: false }));
            }}
          >
            All cash
          </DealDeskChip>
          <DealDeskChip
            selected={form.financing_enabled}
            onClick={() => {
              setFinancingIntent("loan");
              setForm((previous) => ({
                ...previous,
                financing_enabled: true,
                loan_amount:
                  previous.loan_amount > 0 ? previous.loan_amount : Math.round(previous.purchase_price * 0.85),
              }));
            }}
          >
            Aviation loan
          </DealDeskChip>
          <DealDeskChip
            selected={!form.financing_enabled && financingIntent === "partnership"}
            onClick={() => {
              setFinancingIntent("partnership");
              setForm((previous) => ({ ...previous, financing_enabled: false }));
            }}
          >
            Partnership / LLC
          </DealDeskChip>
        </div>
      </DealDeskQuestionBlock>
      {form.financing_enabled ? (
        <DealDeskInsight variant="blue" title="Carrying cost heads-up">
          Interest and origination fees feed <strong>Financing over hold</strong> in the phased P&amp;L. Tune rate, term, and loan amount to stress-test.
        </DealDeskInsight>
      ) : financingIntent === "partnership" ? (
        <DealDeskInsight variant="amber" title="Split equity">
          Keep using purchase + scenario fields for economics; finalize partner splits outside this calculator.
        </DealDeskInsight>
      ) : null}
      {!form.financing_enabled ? (
        <div className="space-y-2">
          <NumberInput label="Opportunity cost rate %" value={form.opportunity_cost_rate_pct} onChange={(value) => setForm((previous) => ({ ...previous, opportunity_cost_rate_pct: value }))} />
          <p className="text-sm text-brand-muted">Opportunity cost over hold: {formatCurrency(opportunityCost)} (not included in profit calculation).</p>
        </div>
      ) : (
        <div className="space-y-2">
          <CurrencyInput label="Loan amount" value={form.loan_amount} onChange={(value) => setForm((previous) => ({ ...previous, loan_amount: value }))} />
          <StaticRow label="Down payment" value={formatCurrency(loanDownPayment)} />
          <NumberInput label="Interest rate %" value={form.interest_rate_pct} onChange={(value) => setForm((previous) => ({ ...previous, interest_rate_pct: value }))} />
          <label className="block">
            <p className="mb-1 text-sm text-brand-muted">Loan term</p>
            <select
              value={form.loan_term_years}
              onChange={(event) => setForm((previous) => ({ ...previous, loan_term_years: Number(event.target.value) }))}
              className="deal-desk-inp w-full py-2"
            >
              <option value={10}>10 years</option>
              <option value={15}>15 years</option>
              <option value={20}>20 years</option>
            </select>
          </label>
          <CurrencyInput label="Origination / doc fees" value={form.loan_origination_fees} onChange={(value) => setForm((previous) => ({ ...previous, loan_origination_fees: value }))} />
          <StaticRow label="Total financing cost over hold" value={formatCurrency(outputs.section_totals.financing_cost_over_hold)} bold />
          <p className="text-xs text-brand-muted">Required hull coverage minimum: {formatCurrency(form.loan_amount)}</p>
        </div>
      )}
    </section>
  );

  const exitSection = (
    <section className="rounded border border-brand-dark bg-card-bg p-4 space-y-3">
      <DealDeskQuestionBlock
        label="Target sale price (base case)"
        hint="This should mirror the exit you are underwriting — it drives headline net profit."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <CurrencyInput label="Base resale target" value={form.resale_base} onChange={(value) => setForm((previous) => ({ ...previous, resale_base: value }))} />
          <div className="flex flex-col justify-center rounded-lg border border-brand-dark bg-[var(--fh-bg3)] px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-brand-muted">vs live ask</p>
            <p className={`text-sm font-semibold ${resaleVsAsk >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {resaleVsAsk >= 0 ? "↑" : "↓"} {formatCurrency(Math.abs(resaleVsAsk))} ({formatPercent(resaleVsAskPct)})
            </p>
            {typeof seed.vsMedianPricePct === "number" && Number.isFinite(seed.vsMedianPricePct) ? (
              <p className="mt-1 text-[10px] text-brand-muted">Listing ask is {formatPercent(seed.vsMedianPricePct)} vs median comp band.</p>
            ) : null}
          </div>
        </div>
      </DealDeskQuestionBlock>
      {stretchExitVsAsk ? (
        <DealDeskInsight variant="amber" title="Stretch exit vs current ask">
          Base resale is more than <strong>10% above</strong> the live ask — budget extra time-on-market and negotiation slack.
        </DealDeskInsight>
      ) : null}
      <DealDeskQuestionBlock label="Where will you market it?" hint="Channel choice is strategic; fees below still drive the math.">
        <div className="flex flex-wrap gap-2">
          {(["Controller / TAP", "Barnstormers / classifieds", "Type club / wholesale", "Broker-managed"] as const).map((label) => (
            <DealDeskChip key={label} selected={exitChannel === label} onClick={() => setExitChannel(label)}>
              {label}
            </DealDeskChip>
          ))}
        </div>
        <p className="text-[10px] text-brand-muted">Tap a lane you are leaning toward — optional note for your deal memo.</p>
      </DealDeskQuestionBlock>
      <DealDeskQuestionBlock
        label="Brokerage model"
        hint="Presets set commission % — override the numeric field anytime for a custom split."
      >
        <div className="flex flex-wrap gap-2">
          <DealDeskChip selected={form.broker_commission_pct < 0.5} onClick={() => setForm((previous) => ({ ...previous, broker_commission_pct: 0 }))}>
            Self-listed (~0%)
          </DealDeskChip>
          <DealDeskChip
            selected={form.broker_commission_pct >= 0.5 && form.broker_commission_pct < 6.5}
            onClick={() => setForm((previous) => ({ ...previous, broker_commission_pct: 5 }))}
          >
            Broker (~5%)
          </DealDeskChip>
          <DealDeskChip
            selected={form.broker_commission_pct >= 6.5 && form.broker_commission_pct <= 10}
            onClick={() => setForm((previous) => ({ ...previous, broker_commission_pct: 8 }))}
          >
            Dealer (~8%)
          </DealDeskChip>
        </div>
        <p className="text-[10px] text-brand-muted">Self-listed: earmark ~$300/yr for photos, ads, or pre-sale spruce in &quot;Pre-sale spruce-up&quot;.</p>
      </DealDeskQuestionBlock>
      <NumberInput label="Broker commission %" value={form.broker_commission_pct} onChange={(value) => setForm((previous) => ({ ...previous, broker_commission_pct: value }))} />
      <p className="text-xs text-brand-muted">{formatCurrency((form.resale_base * form.broker_commission_pct) / 100)} at base resale price.</p>
      <CurrencyInput label="Exit escrow & title" value={form.exit_escrow_fees} onChange={(value) => setForm((previous) => ({ ...previous, exit_escrow_fees: value }))} />
      <CurrencyInput label="Pre-sale spruce-up" value={form.presale_spruce_up} onChange={(value) => setForm((previous) => ({ ...previous, presale_spruce_up: value }))} />
      <NumberInput label="Buyer squawk contingency %" value={form.buyer_squawk_contingency_pct} onChange={(value) => setForm((previous) => ({ ...previous, buyer_squawk_contingency_pct: value }))} />
      <p className="text-xs text-brand-muted">{formatCurrency(outputs.section_totals.all_in_basis * (form.buyer_squawk_contingency_pct / 100))} contingency.</p>
      <NumberInput label="Sales / use tax %" value={form.exit_sales_tax_pct} onChange={(value) => setForm((previous) => ({ ...previous, exit_sales_tax_pct: value }))} />
      <p className="text-xs text-brand-muted">Check your state&apos;s resale exemption rules.</p>
      <StaticRow label="Net sale proceeds (base)" value={formatCurrency(outputs.base.net_proceeds)} bold />
      <p className="text-xs text-brand-muted">
        Low {formatCurrency(outputs.low.net_proceeds)} · Stretch {formatCurrency(outputs.stretch.net_proceeds)}
      </p>
    </section>
  );

  const classicToggleHref =
    `${pathname}?` +
    (classicMode
      ? new URLSearchParams({ step: String(wizardStep) }).toString()
      : new URLSearchParams({ classic: "1", tab }).toString());

  const wizardStepFooterFor = (stepNum: number) =>
    classicMode || wizardStep !== stepNum
      ? null
      : {
          onBack: () => setWizardStepUrl(wizardStep - 1),
          onNext: () => setWizardStepUrl(wizardStep + 1, { advanceMax: true }),
          backDisabled: wizardStep <= 1,
          isLastStep: stepNum === 6,
          onPrintAnalysis: () => window.print(),
        };

  return (
    <div
      id="deal-desk-print-root"
      data-deal-desk-print=""
      className={`deal-desk-print-root pb-[calc(6rem+env(safe-area-inset-bottom,0px))] md:pb-0 ${!classicMode ? "lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-0 print:grid print:grid-cols-[1fr_260px] print:gap-4" : ""}`}
    >
      <div
        className={`space-y-3 ${!classicMode ? "lg:min-w-0 lg:border-r lg:border-brand-dark lg:px-7 lg:pb-12 lg:pt-2 print:border-r-0 print:px-0" : ""}`}
        style={
          !classicMode
            ? {
                backgroundImage: "radial-gradient(rgba(255, 153, 0, 0.035) 1px, transparent 1px)",
                backgroundSize: "48px 48px",
              }
            : undefined
        }
      >
        <div className="deal-desk-print-header hidden print:block print:border-b print:border-neutral-400 print:pb-3 print:text-black">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-600">Full Hangar · Deal Desk</p>
          <h1 className="mt-1 text-lg font-bold leading-tight text-neutral-900">{seed.aircraftLabel}</h1>
          <p className="mt-1 text-sm text-neutral-800">Scenario: {scenarioLabel}</p>
          <p className="mt-0.5 text-xs text-neutral-600">{new Date().toLocaleString()}</p>
        </div>
        {researchHref ? (
          <div className="no-print flex flex-wrap items-center justify-end gap-2">
            <Link
              href={researchHref}
              className="rounded border border-brand-dark px-3 py-2 text-xs text-brand-muted hover:border-brand-orange hover:text-brand-orange"
            >
              Research Market →
            </Link>
            <Link
              href={classicToggleHref}
              className="rounded border border-brand-dark px-3 py-2 text-xs text-brand-muted hover:border-brand-orange hover:text-brand-orange"
              scroll={false}
            >
              {classicMode ? "Guided wizard" : "Classic tabs"}
            </Link>
          </div>
        ) : (
          <div className="no-print flex justify-end">
            <Link
              href={classicToggleHref}
              className="rounded border border-brand-dark px-3 py-2 text-xs text-brand-muted hover:border-brand-orange hover:text-brand-orange"
              scroll={false}
            >
              {classicMode ? "Guided wizard" : "Classic tabs"}
            </Link>
          </div>
        )}
        <div
          className={`no-print sticky top-2 z-20 rounded border border-brand-dark bg-card-bg/95 p-3 backdrop-blur ${!classicMode ? "lg:hidden" : ""}`}
        >
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <SummaryStat label="All-in Basis" value={formatCurrency(outputs.section_totals.all_in_basis)} />
            <SummaryStat label="Net Profit (base)" value={formatCurrency(outputs.base.net_profit)} className={profitColor(outputs.base.net_profit)} />
            <SummaryStat label="ROI %" value={formatPercent(outputs.base.roi_pct)} className={profitColor(outputs.base.net_profit)} />
            <SummaryStat label="Annualized ROI" value={formatPercent(outputs.base.annualized_roi_pct)} className={profitColor(outputs.base.net_profit)} />
            <SummaryStat label="Break-even" value={formatCurrency(outputs.breakeven_sale_price)} />
          </div>
        </div>

        {classicMode ? (
          <div className="no-print flex flex-wrap gap-2">
            {TAB_ORDER.map((tabOption) => (
              <button
                key={tabOption.id}
                type="button"
                onClick={() => setTab(tabOption.id)}
                className={`min-h-[44px] rounded border px-3 py-2 text-sm md:min-h-0 md:py-1 ${
                  tab === tabOption.id
                    ? "border-brand-orange bg-brand-orange/20 text-brand-orange"
                    : "border-brand-dark bg-card-bg text-brand-muted hover:border-brand-orange"
                }`}
              >
                {tabOption.label}
              </button>
            ))}
            <div className="ml-auto text-xs text-brand-muted">
              {saveState === "saving" ? "Saving..." : saveState === "error" ? "Save failed" : "Saved"}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="no-print flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-1">
                {WIZARD_STEPS.map((ws, idx) => {
                  const locked = ws.step > maxWizardStep;
                  const active = ws.step === wizardStep;
                  const done = ws.step < wizardStep;
                  return (
                    <div key={ws.step} className="flex items-center">
                      <button
                        type="button"
                        disabled={locked}
                        title={locked ? "Use Next to unlock this step" : undefined}
                        onClick={() => setWizardStepUrl(ws.step)}
                        className={`flex h-8 min-h-[32px] min-w-[32px] items-center justify-center rounded-full border-2 text-[11px] font-bold transition-[color,background-color,border-color,box-shadow,opacity] ${
                          locked
                            ? "cursor-not-allowed border-brand-dark text-brand-muted opacity-40"
                            : active
                              ? "border-brand-orange bg-brand-orange/20 text-brand-orange shadow-[0_0_0_4px_rgba(249,115,22,0.14)]"
                              : done
                                ? "border-emerald-600 bg-emerald-500/10 text-emerald-400"
                                : "border-brand-dark text-brand-muted hover:border-brand-orange/45 hover:text-brand-orange"
                        }`}
                      >
                        {done ? <span aria-hidden>✓</span> : ws.step}
                      </button>
                      {idx < WIZARD_STEPS.length - 1 ? (
                        <div
                          className={`mx-1 h-0.5 w-3 shrink-0 rounded ${maxWizardStep > ws.step ? "bg-emerald-600" : "bg-brand-dark"}`}
                          aria-hidden
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="shrink-0 text-xs text-brand-muted">
                {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}
              </div>
            </div>
            <p className="no-print text-[10px] uppercase tracking-wide text-brand-muted">
              {WIZARD_STEPS.find((w) => w.step === wizardStep)?.label ?? "Step"}
            </p>
            <div className="rounded-xl border border-brand-orange/40 bg-card-bg/95 px-4 py-3 flex flex-wrap items-center gap-4 print:border-neutral-400 print:bg-white print:text-black">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-emerald-500 text-sm font-bold text-emerald-400">
                {Math.round(Math.min(99, Math.max(0, outputs.base.roi_pct)))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-brand-white print:text-neutral-900">{seed.aircraftLabel}</p>
                <p className="text-xs text-brand-muted print:text-neutral-700">
                  {formatCurrency(form.purchase_price)} basis · {dealGrade.label} · Auto-saves to scenario
                </p>
              </div>
              <Link
                href="/internal/deal-desk"
                className="no-print shrink-0 rounded border border-brand-dark px-2 py-1 text-xs text-brand-muted hover:border-brand-orange hover:text-brand-orange"
              >
                Change aircraft
              </Link>
            </div>
          </div>
        )}

      {((classicMode && showOverview) || !classicMode) ? (
        <DealDeskWizardStep
          classicMode={classicMode}
          step={1}
          wizardStep={wizardStep}
          maxWizardStep={maxWizardStep}
          expanded={classicMode ? true : accordionStepExpanded(1)}
          onAccordionHeaderClick={() => handleAccordionHeaderClick(1)}
          wizardFooter={wizardStepFooterFor(1)}
        >
        {(classicMode && !showOverview) ? null : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <section className="rounded border border-brand-dark bg-card-bg p-4 space-y-3">
            {!classicMode ? (
              <DealDeskInsight variant="green" title="Aircraft context locked">
                Pulled from this listing: <strong>{seed.aircraftLabel}</strong>. Edits below flow to the Live P&amp;L panel and auto-save.
              </DealDeskInsight>
            ) : null}
            <div className="flex flex-wrap gap-2 text-xs">
              <Link
                href="/listings"
                className="rounded-full border border-brand-dark px-3 py-1 text-brand-muted hover:border-brand-orange hover:text-brand-orange"
              >
                Browse listings
              </Link>
              {seed.sourceUrl ? (
                <a
                  href={seed.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-brand-dark px-3 py-1 text-brand-muted hover:border-brand-orange hover:text-brand-orange"
                >
                  Open source ad
                </a>
              ) : null}
            </div>
            <TextInput label="Scenario Label" value={scenarioLabel} onChange={setScenarioLabel} />
            <CurrencyInput label="Purchase Price" value={form.purchase_price} onChange={(value) => setForm((previous) => ({ ...previous, purchase_price: value }))} />
            <div>
              <p className="mb-1 text-sm text-brand-muted">Resale Price</p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
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
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
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
        )}
        </DealDeskWizardStep>
      ) : null}

      {((classicMode && showAcquisition) || !classicMode) ? (
        <DealDeskWizardStep
          classicMode={classicMode}
          step={2}
          wizardStep={wizardStep}
          maxWizardStep={maxWizardStep}
          expanded={classicMode ? true : accordionStepExpanded(2)}
          onAccordionHeaderClick={() => handleAccordionHeaderClick(2)}
          wizardFooter={wizardStepFooterFor(2)}
        >
        {(classicMode && !showAcquisition) ? null : (
        <section className="rounded border border-brand-dark bg-card-bg p-4 space-y-3">
          {!classicMode ? (
            <>
              <DealDeskQuestionBlock
                label="What are you planning to offer?"
                hint="Your modeled purchase versus the live asking price."
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <CurrencyInput label="Planned purchase / basis" value={form.purchase_price} onChange={(value) => setForm((previous) => ({ ...previous, purchase_price: value }))} />
                  <div className="flex flex-col justify-center rounded-lg border border-brand-dark bg-[var(--fh-bg3)] px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-brand-muted">vs asking</p>
                    <p className={`text-sm font-semibold ${purchaseVsAsking <= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {purchaseVsAsking <= 0 ? "↓" : "↑"} {formatCurrency(Math.abs(purchaseVsAsking))} ({formatPercent(purchaseVsAskingPct)})
                    </p>
                    <p className="mt-1 text-[10px] text-brand-muted">Negative = below ask (discount). Positive = premium to ask.</p>
                  </div>
                </div>
              </DealDeskQuestionBlock>
              {sellerMotivation ? (
                <DealDeskInsight variant="amber" title="Seller motivation signal">
                  {seed.priceReduced ? "Price has been reduced on this listing. " : null}
                  {typeof seed.daysOnMarket === "number" && seed.daysOnMarket >= 75
                    ? `On market ~${Math.round(seed.daysOnMarket)} days — watch carrying cost if diligence drags. `
                    : null}
                  Use negotiation table in step 1 / classic Overview to stress offers.
                </DealDeskInsight>
              ) : null}
              {seed.deferredMaintenance > 0 ? (
                <DealDeskInsight variant="red" title="Deferred maintenance (listing estimate)">
                  Scorecard flags about <strong>{formatCurrency(seed.deferredMaintenance)}</strong> of deferred work — fold into must-do upgrades or carrying reserves.
                </DealDeskInsight>
              ) : null}
              <DealDeskQuestionBlock
                label="Annual inspection posture"
                hint="Does not change math automatically — tune monthly accrual on the Carrying step."
              >
                <div className="flex flex-wrap gap-2">
                  <DealDeskChip selected={form.annual_inspection_reserve_monthly <= 0} onClick={() => setForm((p) => ({ ...p, annual_inspection_reserve_monthly: 0 }))}>
                    Current / just done
                  </DealDeskChip>
                  <DealDeskChip selected={form.annual_inspection_reserve_monthly > 0} onClick={() => setForm((p) => ({ ...p, annual_inspection_reserve_monthly: p.annual_inspection_reserve_monthly > 0 ? p.annual_inspection_reserve_monthly : 250 }))}>
                    Budgeting accrual
                  </DealDeskChip>
                </div>
              </DealDeskQuestionBlock>
            </>
          ) : null}
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
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr,180px,100px]">
                <input value={newAcquisitionDraft[category].label} onChange={(event) => setNewAcquisitionDraft((previous) => ({ ...previous, [category]: { ...previous[category], label: event.target.value } }))} placeholder="Add item label" className="deal-desk-inp py-2 text-sm" />
                <CurrencyInputInline value={newAcquisitionDraft[category].amount} onChange={(value) => setNewAcquisitionDraft((previous) => ({ ...previous, [category]: { ...previous[category], amount: value } }))} />
                <button type="button" onClick={() => { if (!newAcquisitionDraft[category].label.trim()) return; setForm((previous) => ({ ...previous, acquisition_items: [...previous.acquisition_items, { id: crypto.randomUUID(), label: newAcquisitionDraft[category].label.trim(), amount: newAcquisitionDraft[category].amount, category }] })); setNewAcquisitionDraft((previous) => ({ ...previous, [category]: { label: "", amount: 0 } })); }} className="fh-cta-on-orange-fill rounded bg-brand-orange px-2 py-1 text-sm font-semibold hover:bg-brand-burn">Add item</button>
              </div>
            </div>
          ))}
          <p className="text-lg font-semibold text-brand-orange">Total Acquisition Capex: {formatCurrency(outputs.section_totals.acquisition_capex)}</p>
        </section>
        )}
        </DealDeskWizardStep>
      ) : null}

      {((classicMode && showUpgrades) || !classicMode) ? (
        <DealDeskWizardStep
          classicMode={classicMode}
          step={3}
          wizardStep={wizardStep}
          maxWizardStep={maxWizardStep}
          expanded={classicMode ? true : accordionStepExpanded(3)}
          onAccordionHeaderClick={() => handleAccordionHeaderClick(3)}
          wizardFooter={wizardStepFooterFor(3)}
        >
        {(classicMode && !showUpgrades) ? null : (
        <section className="rounded border border-brand-dark bg-card-bg p-4 space-y-3">
          {!classicMode ? (
            <>
              <DealDeskQuestionBlock label="Upgrade strategy focus" hint="Sets the category for the next line item you add — mix and match as needed.">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["avionics", "Avionics"],
                      ["paint", "Paint"],
                      ["interior", "Interior"],
                      ["engine", "Engine"],
                      ["prop", "Prop"],
                      ["mod", "Mod / STC"],
                    ] as const
                  ).map(([id, label]) => (
                    <DealDeskChip
                      key={id}
                      selected={newUpgradeDraft.category === id}
                      onClick={() => setNewUpgradeDraft((previous) => ({ ...previous, category: id }))}
                    >
                      {label}
                    </DealDeskChip>
                  ))}
                </div>
              </DealDeskQuestionBlock>
              {seed.isSteamGauge === true && seed.hasGlassCockpit !== true ? (
                <DealDeskInsight variant="blue" title="Panel modernization path">
                  Steam-gauge stack detected — buyers often underwrite <strong>GTN 650-class</strong> glass. Model avionics as must-do or value-add; track ROI with the uplift field below.
                </DealDeskInsight>
              ) : null}
            </>
          ) : null}
          <div className="rounded border border-brand-dark p-3">
            <p className="mb-2 font-semibold">Add upgrade line item</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
              <input value={newUpgradeDraft.label} onChange={(event) => setNewUpgradeDraft((previous) => ({ ...previous, label: event.target.value }))} placeholder="Upgrade label" className="deal-desk-inp py-2 text-sm md:col-span-2" />
              <CurrencyInputInline value={newUpgradeDraft.amount} onChange={(value) => setNewUpgradeDraft((previous) => ({ ...previous, amount: value }))} />
              <select value={newUpgradeDraft.type} onChange={(event) => setNewUpgradeDraft((previous) => ({ ...previous, type: event.target.value as UpgradeItem["type"] }))} className="deal-desk-inp py-2 text-sm"><option value="must_do">Must Do</option><option value="value_add">Value Add</option></select>
              <select value={newUpgradeDraft.category} onChange={(event) => setNewUpgradeDraft((previous) => ({ ...previous, category: event.target.value as UpgradeItem["category"] }))} className="deal-desk-inp py-2 text-sm"><option value="avionics">Avionics</option><option value="interior">Interior</option><option value="paint">Paint</option><option value="engine">Engine</option><option value="prop">Prop</option><option value="mod">Mod/STC</option></select>
            </div>
            <button type="button" onClick={() => { if (!newUpgradeDraft.label.trim()) return; setForm((previous) => ({ ...previous, upgrade_items: [...previous.upgrade_items, { ...newUpgradeDraft, id: crypto.randomUUID(), label: newUpgradeDraft.label.trim() }] })); setNewUpgradeDraft({ label: "", amount: 0, type: "must_do", category: "avionics" }); }} className="fh-cta-on-orange-fill mt-2 rounded bg-brand-orange px-3 py-1 text-sm font-semibold hover:bg-brand-burn">Add item</button>
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
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
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
        )}
        </DealDeskWizardStep>
      ) : null}

      {((classicMode && showCarrying) || !classicMode) ? (
        <DealDeskWizardStep
          classicMode={classicMode}
          step={4}
          wizardStep={wizardStep}
          maxWizardStep={maxWizardStep}
          expanded={classicMode ? true : accordionStepExpanded(4)}
          onAccordionHeaderClick={() => handleAccordionHeaderClick(4)}
          wizardFooter={wizardStepFooterFor(4)}
        >
        {(classicMode && !showCarrying) ? null : (
        <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {!classicMode ? (
            <div className="xl:col-span-2 space-y-3">
              <DealDeskQuestionBlock label="How long will you hold?" hint="Quick presets — fine-tune months in step 1 / Overview if needed.">
                <div className="flex flex-wrap gap-2">
                  <DealDeskChip selected={Math.round(form.hold_months) === 2} onClick={() => setForm((p) => ({ ...p, hold_months: 2 }))}>
                    1–3 mo (2)
                  </DealDeskChip>
                  <DealDeskChip selected={Math.round(form.hold_months) === 5} onClick={() => setForm((p) => ({ ...p, hold_months: 5 }))}>
                    3–6 mo (5)
                  </DealDeskChip>
                  <DealDeskChip selected={Math.round(form.hold_months) === 9} onClick={() => setForm((p) => ({ ...p, hold_months: 9 }))}>
                    6–12 mo (9)
                  </DealDeskChip>
                  <DealDeskChip selected={Math.round(form.hold_months) >= 12} onClick={() => setForm((p) => ({ ...p, hold_months: 15 }))}>
                    12+ mo (15)
                  </DealDeskChip>
                </div>
              </DealDeskQuestionBlock>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <DealDeskInsight variant="green" title="Monthly burn rate">
                  Fixed + variable spread across your hold ≈ <strong>{formatCurrency(outputs.monthly_burn_rate)}</strong> / mo (see Live P&amp;L for detail).
                </DealDeskInsight>
                <DealDeskInsight variant="amber" title="Est. total carry">
                  Fixed carrying for <strong>{Math.round(form.hold_months)}</strong> mo = {formatCurrency(outputs.section_totals.fixed_carrying_total)} · Variable (planned hours) ={" "}
                  {formatCurrency(outputs.section_totals.variable_operating_total)}
                </DealDeskInsight>
              </div>
            </div>
          ) : null}
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
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2"><NumberInput label="Fuel GPH" value={form.fuel_gph} onChange={(value) => setForm((p) => ({ ...p, fuel_gph: value }))} /><CurrencyInput label="Fuel price per gallon" value={form.fuel_price_per_gallon} onChange={(value) => setForm((p) => ({ ...p, fuel_price_per_gallon: value }))} /></div>
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
        )}
        </DealDeskWizardStep>
      ) : null}

      {classicMode && showFinancing ? financingSection : null}
      {classicMode && showExit ? exitSection : null}
      {!classicMode ? (
        <DealDeskWizardStep
          classicMode={false}
          step={5}
          wizardStep={wizardStep}
          maxWizardStep={maxWizardStep}
          expanded={accordionStepExpanded(5)}
          onAccordionHeaderClick={() => handleAccordionHeaderClick(5)}
          wizardFooter={wizardStepFooterFor(5)}
        >
          <>
            {financingSection}
            {exitSection}
          </>
        </DealDeskWizardStep>
      ) : null}

      {((classicMode && showSensitivity) || !classicMode) ? (
        <DealDeskWizardStep
          classicMode={classicMode}
          step={6}
          wizardStep={wizardStep}
          maxWizardStep={maxWizardStep}
          expanded={classicMode ? true : accordionStepExpanded(6)}
          onAccordionHeaderClick={() => handleAccordionHeaderClick(6)}
          wizardFooter={wizardStepFooterFor(6)}
        >
        {(classicMode && !showSensitivity) ? null : (
        <section className="rounded border border-brand-dark bg-card-bg p-4 space-y-3">
          {!classicMode ? (
            <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-4 text-center">
              <p className="text-3xl leading-none text-emerald-400" aria-hidden>
                ✅
              </p>
              <p className="mt-2 text-lg font-bold text-brand-white" style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}>
                Analysis complete
              </p>
              <div className="mx-auto mt-3 max-w-md text-left">
                <DealDeskInsight variant="green" title={`Verdict: ${wizardVerdict.key}`}>
                  {outputs.base.net_profit >= form.target_profit_dollars
                    ? "Base case clears your profit target with room — revisit sensitivity cells before you wire money."
                    : outputs.base.net_profit >= 0
                      ? "Base case is positive but shy of your profit target — tighten purchase, carry, or exit assumptions."
                      : "Base case is underwater — rework purchase, upgrades, or exit pricing before committing."}
                </DealDeskInsight>
              </div>
              <div className="mt-4 flex flex-col items-center gap-2">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg border border-brand-orange bg-brand-orange/10 px-4 py-2 text-xs font-semibold text-brand-orange hover:bg-brand-orange/20 print:hidden"
                  >
                    Print / Save as PDF
                  </button>
                  <span className="text-[11px] text-brand-muted print:hidden">
                    {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save error — retry edits" : "💾 Scenario auto-saves"}
                  </span>
                </div>
                <p className="max-w-md text-center text-[11px] text-brand-muted print:text-neutral-700">
                  Opens the browser print dialog — choose <span className="font-semibold text-brand-white print:text-neutral-900">Save as PDF</span> as the
                  destination.
                </p>
              </div>
            </div>
          ) : null}
          <RangeInput label={`Days-to-sell: ${selectedSensitivityDays}`} min={90} max={270} step={90} value={selectedSensitivityDays} onChange={(value) => { setSelectedSensitivityDays(value); setForm((previous) => ({ ...previous, days_to_sell_slow: value })); }} />
          <RangeInput label={`Contingency: ${form.maintenance_contingency_pct}%`} min={5} max={25} step={5} value={form.maintenance_contingency_pct} onChange={(value) => setForm((previous) => ({ ...previous, maintenance_contingency_pct: value }))} />
          <div className="hidden md:block">
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
          </div>
          <div className="block md:hidden rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Sensitivity Analysis</p>
            <p>Open on desktop to view the full price × cost sensitivity grid.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
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
        )}
        </DealDeskWizardStep>
      ) : null}

      {!classicMode && wizardStep >= 2 && wizardStep <= 5 ? (
        <div className="no-print rounded-[10px] border border-brand-dark bg-card-bg/90 px-4 py-3 text-xs text-brand-muted">
          <p className="font-semibold text-brand-white">Coming up</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {WIZARD_STEPS.filter((w) => w.step > wizardStep).map((w) => (
              <li key={w.step}>{WIZARD_STEP_META[w.step]?.title ?? w.label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!classicMode ? (
        <div className="no-print mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-brand-dark pt-4 lg:hidden">
          <button
            type="button"
            disabled={wizardStep <= 1}
            onClick={() => setWizardStepUrl(wizardStep - 1)}
            className="rounded border border-brand-dark px-4 py-2 text-sm font-semibold text-brand-muted hover:border-brand-orange disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>
          {wizardStep < 6 ? (
            <button
              type="button"
              onClick={() => setWizardStepUrl(wizardStep + 1, { advanceMax: true })}
              className="fh-cta-on-orange-fill rounded bg-brand-orange px-5 py-2 text-sm font-semibold hover:bg-brand-burn"
            >
              Next
            </button>
          ) : (
            <p className="text-xs text-emerald-400">Final step — refine sensitivity or jump back to any stage above.</p>
          )}
        </div>
      ) : null}

      <div
        className="no-print fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-2 border-t border-border bg-background py-3 shadow-lg md:hidden"
        style={{
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
          paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <div className="min-w-0 text-sm">
          <span className="text-muted-foreground">Est. Profit</span>
          <span className={`ml-1 font-semibold ${profitColor(outputs.base.net_profit)}`}>{formatCurrency(outputs.base.net_profit)}</span>
        </div>
        <div className="min-w-0 text-sm">
          <span className="text-muted-foreground">ROI</span>
          <span className={`ml-1 font-semibold ${profitColor(outputs.base.net_profit)}`}>{formatPercent(outputs.base.roi_pct)}</span>
        </div>
        <div className="shrink-0 text-sm">
          <span className={`font-bold ${dealGrade.className}`}>{dealGrade.label}</span>
        </div>
      </div>
      </div>

      {!classicMode ? (
        <aside className="hidden print:block lg:block lg:sticky lg:top-[52px] lg:h-[calc(100vh-52px)] lg:overflow-y-auto print:static print:h-auto print:overflow-visible lg:border-l lg:border-brand-dark lg:bg-card-bg lg:p-4 print:border print:border-neutral-400 print:p-3 print:text-black">
          <DealDeskLivePLPanel
            seed={seed}
            verdict={wizardVerdict}
            outputs={outputs}
            form={form}
            dealGrade={dealGrade}
            formatCurrency={formatCurrency}
            formatPercent={formatPercent}
            profitColor={profitColor}
          />
        </aside>
      ) : null}
    </div>
  );
}

type FlipOutputs = ReturnType<typeof calculateFlip>;

const dealDeskPlBarlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const;
const dealDeskPlMono = { fontFamily: "var(--font-dm-mono), ui-monospace, monospace" } as const;

function PlSection({ emoji, title, children }: { emoji: string; title: string; children: ReactNode }) {
  return (
    <div className="border-b border-brand-dark pb-3">
      <p className="pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-brand-muted" style={dealDeskPlBarlow}>
        {emoji} {title}
      </p>
      {children}
    </div>
  );
}

function PlRow({ label, value }: { label: string; value: number }) {
  const cls = value < 0 ? "text-red-400" : value > 0 ? "text-emerald-400" : "text-brand-muted";
  return (
    <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] py-1 text-[12px]">
      <span className="flex min-w-0 flex-1 items-center gap-2 text-brand-muted">
        <span className="h-1 w-1 shrink-0 rounded-full bg-brand-orange/60" aria-hidden />
        {label}
      </span>
      <span className={`shrink-0 tabular-nums ${cls}`} style={dealDeskPlMono}>
        {formatSignedCurrency(value)}
      </span>
    </div>
  );
}

function PlSubtotal({ label, value }: { label: string; value: number }) {
  return (
    <div
      className={`mt-2 flex items-center justify-between border-t border-brand-dark pt-2 text-[13px] font-semibold ${value < 0 ? "text-red-300" : "text-brand-white"}`}
      style={dealDeskPlMono}
    >
      <span>{label}</span>
      <span>{formatSignedCurrency(value)}</span>
    </div>
  );
}

function DealDeskWizardStep({
  classicMode,
  step,
  wizardStep,
  maxWizardStep,
  expanded,
  onAccordionHeaderClick,
  wizardFooter,
  children,
}: {
  classicMode: boolean;
  step: number;
  wizardStep: number;
  maxWizardStep: number;
  expanded: boolean;
  onAccordionHeaderClick: () => void;
  wizardFooter?: {
    onBack: () => void;
    onNext: () => void;
    backDisabled: boolean;
    isLastStep: boolean;
    onPrintAnalysis: () => void;
  } | null;
  children: ReactNode;
}) {
  if (classicMode) return <>{children}</>;
  const meta = WIZARD_STEP_META[step];
  const icon = WIZARD_STEP_ICONS[step];
  const statusBadge = accordionStepBadge(step, wizardStep, maxWizardStep);
  const locked = step > maxWizardStep;
  const active = step === wizardStep;
  const done = step < wizardStep;
  const badgeClass =
    statusBadge.tone === "green"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
      : statusBadge.tone === "slate"
        ? "border-brand-dark/60 bg-[var(--fh-bg3)] text-brand-muted"
        : "border-brand-orange/45 bg-brand-orange/15 text-brand-orange";
  const stepNoClass = active ? "text-brand-orange" : done ? "text-emerald-400" : "text-brand-muted";
  return (
    <div
      className={`deal-desk-wizard-accordion-card mb-3.5 overflow-hidden rounded-[14px] border bg-card-bg print:mb-4 print:border-neutral-400 print:bg-white print:shadow-none ${
        active ? "deal-desk-step-card border-[var(--fh-border)] print:animate-none" : ""
      } ${done && !active ? "border-emerald-500/25" : ""} ${!done && !active && !locked ? "border-[var(--fh-border)]" : ""} ${locked ? "pointer-events-none opacity-45" : ""}`}
    >
      <button
        type="button"
        disabled={locked}
        onClick={onAccordionHeaderClick}
        className="flex w-full cursor-pointer select-none items-start gap-3 border-b border-[var(--fh-border)] px-[18px] py-4 text-left [data-theme=light]:border-slate-200 print:border-neutral-300 disabled:cursor-not-allowed"
      >
        <span
          className={`mt-0.5 shrink-0 text-lg leading-none text-brand-muted transition-transform duration-200 print:text-xl ${expanded ? "rotate-90" : ""}`}
          aria-hidden
        >
          ›
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {icon ? <span className="text-lg leading-none print:text-xl" aria-hidden>{icon}</span> : null}
            <p
              className={`font-mono text-[10px] font-bold uppercase tracking-wider print:text-neutral-600 ${stepNoClass}`}
              style={{ fontFamily: "var(--font-dm-mono), ui-monospace, monospace" }}
            >
              Step {step}
            </p>
          </div>
          <h2 className="mt-0.5 text-[17px] font-bold tracking-tight text-brand-white print:text-neutral-900" style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}>
            {meta.title}
          </h2>
          <p className="mt-1 text-[11px] italic text-brand-muted print:text-neutral-700">{meta.subtitle}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide print:border-neutral-600 print:bg-neutral-100 print:text-neutral-800 ${badgeClass}`}
          style={{ fontFamily: "var(--font-dm-mono), ui-monospace, monospace" }}
        >
          {statusBadge.label}
        </span>
      </button>
      {children != null ? (
        <div
          className={`deal-desk-wizard-accordion-body space-y-3 px-[18px] pb-5 pt-1 print:block print:text-black ${expanded ? "block" : "hidden print:!block"}`}
        >
          {children}
          {wizardFooter && expanded ? (
            <footer className="no-print mt-5 flex flex-col-reverse gap-2 border-t border-[var(--fh-border)] pt-4 [data-theme=light]:border-slate-200 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={wizardFooter.onBack}
                disabled={wizardFooter.backDisabled}
                className="min-h-[44px] rounded-lg border border-[var(--fh-border)] px-5 py-2 text-xs font-semibold text-brand-muted transition-colors hover:border-brand-orange hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-40 [data-theme=light]:border-slate-300 [data-theme=light]:text-slate-600"
              >
                Back
              </button>
              {wizardFooter.isLastStep ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <button
                    type="button"
                    onClick={wizardFooter.onPrintAnalysis}
                    className="min-h-[44px] rounded-lg bg-emerald-600 px-5 py-2 text-[15px] font-extrabold tracking-tight text-white transition-colors hover:bg-emerald-500"
                    style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}
                  >
                    Save analysis as PDF →
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={wizardFooter.onNext}
                  className="fh-cta-on-orange-fill min-h-[44px] rounded-lg bg-brand-orange px-7 py-2 text-[15px] font-extrabold tracking-tight transition-transform hover:bg-brand-burn"
                  style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}
                >
                  Next
                </button>
              )}
            </footer>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DealDeskHealthScoreDrilldown({
  seed,
  formatCurrency,
}: {
  seed: DealDeskSeed;
  formatCurrency: (n: number | null | undefined) => string;
}) {
  const sn = (n: number | null | undefined): string | null => (n != null && Number.isFinite(n) ? String(Math.round(n)) : null);
  const sf = (n: number | null | undefined) => (n != null && Number.isFinite(n) ? n.toFixed(2) : null);
  const flipEx = seed.flipExplanation;
  const flipExOk =
    flipEx &&
    typeof flipEx === "object" &&
    !flipEx.suppressed &&
    !flipEx.error;
  const hasFlipPillars =
    (seed.flipScore != null && Number.isFinite(seed.flipScore)) ||
    Boolean(flipExOk);
  const hasComponentMini =
    seed.engineScore != null || seed.propScore != null || seed.llpScore != null;
  const hasComps =
    seed.compMedianPrice != null ||
    seed.compP25Price != null ||
    seed.compP75Price != null ||
    seed.mispricingZscore != null ||
    seed.pricingConfidence != null ||
    seed.compSelectionTier != null ||
    seed.compExactCount != null ||
    seed.compFamilyCount != null;
  const hasEngine =
    Boolean(seed.evExplanation?.trim()) ||
    seed.evDataQuality != null ||
    seed.evHoursSmoh != null ||
    seed.evTboHours != null ||
    seed.evHoursRemaining != null ||
    seed.evScoreContribution != null;
  const hasAccidents = seed.hasAccidentHistory === true || (seed.accidentCount != null && seed.accidentCount > 0);
  if (!hasFlipPillars && !hasComponentMini && !hasComps && !hasEngine && !hasAccidents && !seed.intelligenceVersion)
    return null;

  const row = (label: string, value: string | null) =>
    value ? (
      <p>
        <span className="text-brand-muted">{label}: </span>
        <strong>{value}</strong>
      </p>
    ) : null;

  const detailBodyCls =
    "mt-2 space-y-1.5 border-t border-brand-dark/60 pt-2 text-[10px] leading-snug text-brand-muted print:border-neutral-300 print:text-neutral-800 [&_strong]:font-semibold [&_strong]:text-brand-white print:[&_strong]:text-neutral-900";

  return (
    <div className="mt-3 space-y-2 print:mt-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-brand-muted print:text-neutral-600" style={dealDeskPlBarlow}>
        Intelligence drill-down
      </p>
      {hasFlipPillars ? (
        <details className="deal-desk-health-details rounded-lg border border-brand-dark/80 bg-[var(--fh-bg3)]/40 px-3 py-2 print:border-neutral-400 print:bg-neutral-50">
          <summary className="cursor-pointer list-none text-[11px] font-semibold text-brand-white marker:content-none print:text-neutral-900 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              Flip score pillars
              <span className="text-brand-muted print:text-neutral-600" aria-hidden>
                +
              </span>
            </span>
          </summary>
          <div className={detailBodyCls}>
            {row("Flip score", sn(seed.flipScore))}
            {row("Flip tier", seed.flipTier ?? null)}
            {flipExOk ? (
              <>
                {row(
                  "Pricing edge",
                  flipEx.p1_pricing_edge?.pts != null
                    ? `${Math.round(flipEx.p1_pricing_edge.pts)}/${flipEx.p1_pricing_edge.max ?? 35}`
                    : null
                )}
                {row(
                  "Airworthiness",
                  flipEx.p2_airworthiness?.pts != null
                    ? `${Math.round(flipEx.p2_airworthiness.pts)}/${flipEx.p2_airworthiness.max ?? 20}`
                    : null
                )}
                {row(
                  "Improvement room",
                  flipEx.p3_improvement_room?.pts != null
                    ? `${Math.round(flipEx.p3_improvement_room.pts)}/${flipEx.p3_improvement_room.max ?? 30}`
                    : null
                )}
                {row(
                  "Exit liquidity",
                  flipEx.p4_exit_liquidity?.pts != null
                    ? `${Math.round(flipEx.p4_exit_liquidity.pts)}/${flipEx.p4_exit_liquidity.max ?? 15}`
                    : null
                )}
              </>
            ) : null}
          </div>
        </details>
      ) : null}
      {hasComponentMini ? (
        <details className="deal-desk-health-details rounded-lg border border-brand-dark/80 bg-[var(--fh-bg3)]/40 px-3 py-2 print:border-neutral-400 print:bg-neutral-50">
          <summary className="cursor-pointer list-none text-[11px] font-semibold text-brand-white marker:content-none print:text-neutral-900 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              Component scores
              <span className="text-brand-muted print:text-neutral-600" aria-hidden>
                +
              </span>
            </span>
          </summary>
          <div className={detailBodyCls}>
            {row("Engine", sn(seed.engineScore))}
            {row("Prop", sn(seed.propScore))}
            {row("LLP", sn(seed.llpScore))}
          </div>
        </details>
      ) : null}
      {hasComps ? (
        <details className="deal-desk-health-details rounded-lg border border-brand-dark/80 bg-[var(--fh-bg3)]/40 px-3 py-2 print:border-neutral-400 print:bg-neutral-50">
          <summary className="cursor-pointer list-none text-[11px] font-semibold text-brand-white marker:content-none print:text-neutral-900 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              Comps &amp; pricing context
              <span className="text-brand-muted print:text-neutral-600" aria-hidden>
                +
              </span>
            </span>
          </summary>
          <div className={detailBodyCls}>
            {row("Comp tier", seed.compSelectionTier ?? null)}
            {row("Pricing confidence", seed.pricingConfidence ?? null)}
            {row("Median comp ask", seed.compMedianPrice != null ? formatCurrency(seed.compMedianPrice) : null)}
            {row("P25 / P75 band", seed.compP25Price != null && seed.compP75Price != null ? `${formatCurrency(seed.compP25Price)} – ${formatCurrency(seed.compP75Price)}` : null)}
            {row("Mispricing z-score", sf(seed.mispricingZscore))}
            {row("Exact / family comps", seed.compExactCount != null && seed.compFamilyCount != null ? `${seed.compExactCount} exact · ${seed.compFamilyCount} family` : null)}
            {row("Universe size", seed.compUniverseSize != null ? String(seed.compUniverseSize) : null)}
          </div>
        </details>
      ) : null}
      {hasEngine ? (
        <details className="deal-desk-health-details rounded-lg border border-brand-dark/80 bg-[var(--fh-bg3)]/40 px-3 py-2 print:border-neutral-400 print:bg-neutral-50">
          <summary className="cursor-pointer list-none text-[11px] font-semibold text-brand-white marker:content-none print:text-neutral-900 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              Engine value (score_data)
              <span className="text-brand-muted print:text-neutral-600" aria-hidden>
                +
              </span>
            </span>
          </summary>
          <div className={detailBodyCls}>
            {row("Data quality", seed.evDataQuality ?? null)}
            {row("SMOH (scored)", seed.evHoursSmoh != null ? `${seed.evHoursSmoh} h` : null)}
            {row("TBO reference", seed.evTboHours != null ? `${seed.evTboHours} h` : null)}
            {row("Hours remaining (est.)", seed.evHoursRemaining != null ? `${seed.evHoursRemaining} h` : null)}
            {row("Score contribution", seed.evScoreContribution != null ? String(seed.evScoreContribution) : null)}
            {seed.evExplanation?.trim() ? (
              <p className="whitespace-pre-wrap text-[10px] leading-relaxed text-brand-muted/95 print:text-neutral-800">{seed.evExplanation.trim()}</p>
            ) : null}
          </div>
        </details>
      ) : null}
      {hasAccidents ? (
        <details className="deal-desk-health-details rounded-lg border border-brand-dark/80 bg-[var(--fh-bg3)]/40 px-3 py-2 print:border-neutral-400 print:bg-neutral-50">
          <summary className="cursor-pointer list-none text-[11px] font-semibold text-brand-white marker:content-none print:text-neutral-900 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              Accident / damage signals
              <span className="text-brand-muted print:text-neutral-600" aria-hidden>
                +
              </span>
            </span>
          </summary>
          <div className={detailBodyCls}>
            {row("Accident history flag", seed.hasAccidentHistory === true ? "Yes" : seed.hasAccidentHistory === false ? "No" : null)}
            {row("Accident count", seed.accidentCount != null ? String(seed.accidentCount) : null)}
          </div>
        </details>
      ) : null}
      {seed.intelligenceVersion ? (
        <p className="text-[9px] text-brand-muted/80 print:text-neutral-600" style={dealDeskPlMono}>
          Intelligence v{seed.intelligenceVersion}
        </p>
      ) : null}
      <Link
        href={`/listings/${seed.listingId}`}
        prefetch={false}
        className="inline-block text-[10px] font-semibold text-brand-orange underline-offset-2 hover:underline print:text-neutral-900"
      >
        Open full listing intelligence →
      </Link>
    </div>
  );
}

function DealDeskLivePLPanel({
  seed,
  verdict,
  outputs,
  form,
  dealGrade,
  formatCurrency,
  formatPercent,
  profitColor,
}: {
  seed: DealDeskSeed;
  verdict: { key: string; box: string; text: string };
  outputs: FlipOutputs;
  form: FlipCalcInputs;
  dealGrade: { label: string; className: string };
  formatCurrency: (n: number | null | undefined) => string;
  formatPercent: (n: number | null | undefined) => string;
  profitColor: (n: number) => string;
}) {
  const [profitBump, setProfitBump] = useState(false);
  const lastProfit = useRef<number | null>(null);
  useEffect(() => {
    const v = outputs.base.net_profit;
    if (lastProfit.current !== null && lastProfit.current !== v) {
      setProfitBump(true);
      const t = window.setTimeout(() => setProfitBump(false), 300);
      return () => window.clearTimeout(t);
    }
    lastProfit.current = v;
  }, [outputs.base.net_profit]);

  const contingency =
    (outputs.section_totals.must_do_upgrades + outputs.section_totals.value_add_upgrades) *
    (form.maintenance_contingency_pct / 100);
  const resale = form.resale_base;
  const brokerExit = -resale * (form.broker_commission_pct / 100);
  const taxExit = -resale * (form.exit_sales_tax_pct / 100);
  const escrowExit = -form.exit_escrow_fees;
  const spruceExit = -form.presale_spruce_up;
  const squawkExit = -outputs.section_totals.all_in_basis * (form.buyer_squawk_contingency_pct / 100);
  const exitPhaseSum = brokerExit + taxExit + escrowExit + spruceExit + squawkExit;

  const purchase = -form.purchase_price;
  const acqCapex = -outputs.section_totals.acquisition_capex;
  const acqPhaseSum = purchase + acqCapex;

  const must = -outputs.section_totals.must_do_upgrades;
  const val = -outputs.section_totals.value_add_upgrades;
  const cont = -contingency;
  const upPhaseSum = must + val + cont;

  const fixed = -outputs.section_totals.fixed_carrying_total;
  const variable = -outputs.section_totals.variable_operating_total;
  const fin = -outputs.section_totals.financing_cost_over_hold;
  const carryPhaseSum = fixed + variable + fin;

  const engineLifePct = normalizedEngineLifePercent(seed.evPctLifeRemaining);
  const riskRaw = seed.riskLevel?.trim();
  const riskLower = riskRaw?.toLowerCase() ?? "";
  const riskIcon =
    riskRaw == null
      ? null
      : riskLower === "critical" || riskLower === "high"
        ? "⚠️"
        : riskLower === "low" || riskLower === "medium" || riskLower === "moderate"
          ? "✅"
          : "ℹ️";

  return (
    <div className="space-y-4 print:text-black">
      <div>
        <p
          className="text-[13px] font-bold uppercase tracking-[0.12em] text-brand-muted print:text-neutral-600"
          style={dealDeskPlBarlow}
        >
          Live P&amp;L
        </p>
        <div className={`mt-2 rounded-lg border px-3 py-3 print:border-neutral-400 print:bg-neutral-50 ${verdict.box}`}>
          <p
            className={`text-[26px] font-extrabold leading-tight print:text-neutral-900 ${verdict.text}`}
            style={dealDeskPlBarlow}
          >
            {verdict.key}
          </p>
          <p className="mt-1 text-[11px] text-brand-muted print:text-neutral-600" style={dealDeskPlMono}>
            vs {formatCurrency(form.target_profit_dollars)} profit target
          </p>
        </div>
      </div>
      <div className="border-b border-brand-dark pb-4 text-center print:border-neutral-300">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-muted print:text-neutral-600"
          style={dealDeskPlMono}
        >
          Net profit (base)
        </p>
        <p
          className={`mt-1 inline-block origin-center text-[clamp(2rem,4vw,3.25rem)] font-extrabold leading-none transition-transform duration-300 ease-out print:scale-100 ${profitColor(outputs.base.net_profit)} print:text-neutral-900 ${profitBump ? "scale-[1.04]" : "scale-100"}`}
          style={dealDeskPlBarlow}
        >
          {formatCurrency(outputs.base.net_profit)}
        </p>
        <p
          className={`text-[13px] font-semibold print:text-neutral-800 ${profitColor(outputs.base.net_profit)}`}
          style={dealDeskPlMono}
        >
          {formatPercent(outputs.base.roi_pct)} ROI
        </p>
        <p className="text-xs text-brand-muted print:text-neutral-600" style={dealDeskPlMono}>
          {formatPercent(outputs.base.annualized_roi_pct)} annualized
        </p>
      </div>
      <div className="space-y-2 border-b border-brand-dark pb-4 print:border-neutral-300">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-brand-muted print:text-neutral-600" style={dealDeskPlBarlow}>
          Health check
        </p>
        <ul className="space-y-1 text-[11px] text-brand-muted print:text-neutral-800">
          <li>
            {outputs.base.net_profit >= form.target_profit_dollars ? "✅" : "⚠️"} Meets profit target
          </li>
          <li>{outputs.monthly_burn_rate <= 1500 ? "✅" : "⚠️"} Monthly burn {formatCurrency(outputs.monthly_burn_rate)}</li>
          <li>{outputs.base.net_profit >= 0 ? "✅" : "❌"} Base case above water</li>
          <li>
            <span className={`${dealGrade.className} print:text-neutral-900`}>Grade: {dealGrade.label}</span>
          </li>
          {riskRaw ? (
            <li>
              {riskIcon} Risk tier: {riskRaw}
            </li>
          ) : null}
          {seed.askingPrice > 0 && seed.flipScore != null && Number.isFinite(seed.flipScore) ? (
            <li>
              🔥 Flip score {Math.round(seed.flipScore)}
              {seed.flipTier ? ` (${seed.flipTier})` : ""}
            </li>
          ) : seed.askingPrice <= 0 ? (
            <li className="text-brand-muted/90">Flip score withheld (price undisclosed)</li>
          ) : null}
          {seed.avionicsScore != null && Number.isFinite(seed.avionicsScore) ? (
            <li>🎛️ Avionics score {Math.round(seed.avionicsScore)}</li>
          ) : null}
          {engineLifePct != null ? (
            <li>
              {engineLifePct >= 35 ? "✅" : "⚠️"} Engine life ~{engineLifePct.toFixed(0)}% remaining (est.)
            </li>
          ) : null}
          {seed.faaMatched === true ? <li>✅ FAA registry matched</li> : null}
          {seed.faaMatched === false ? <li>⚠️ FAA registry not matched on file</li> : null}
        </ul>
        <DealDeskHealthScoreDrilldown seed={seed} formatCurrency={formatCurrency} />
      </div>
      <div className="space-y-4 border-b border-brand-dark pb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-brand-muted" style={dealDeskPlBarlow}>
          Phased cash flow (base)
        </p>
        <PlSection emoji="📥" title="Acquisition">
          <PlRow label="Purchase price" value={purchase} />
          <PlRow label="Acquisition capex" value={acqCapex} />
          <PlSubtotal label="Subtotal" value={acqPhaseSum} />
        </PlSection>
        <PlSection emoji="🔧" title="Upgrades">
          <PlRow label="Must-do upgrades" value={must} />
          <PlRow label="Value-add upgrades" value={val} />
          <PlRow label={`Maintenance contingency (${form.maintenance_contingency_pct}%)`} value={cont} />
          <PlSubtotal label="Subtotal" value={upPhaseSum} />
        </PlSection>
        <PlSection emoji="📅" title="Carrying & financing">
          <PlRow label="Fixed carrying (hangar, insurance, accruals…)" value={fixed} />
          <PlRow label="Variable operating (planned hours)" value={variable} />
          <PlRow label="Financing over hold" value={fin} />
          <PlSubtotal label="Subtotal" value={carryPhaseSum} />
        </PlSection>
        <PlSection emoji="🎯" title="Exit (at base resale)">
          <PlRow label="Broker commission" value={brokerExit} />
          <PlRow label="Sales / use tax" value={taxExit} />
          <PlRow label="Escrow & title" value={escrowExit} />
          <PlRow label="Pre-sale spruce-up" value={spruceExit} />
          <PlRow label="Buyer squawk contingency" value={squawkExit} />
          <PlSubtotal label="Subtotal" value={exitPhaseSum} />
        </PlSection>
        <PlRow label="All-in basis (purchase → upgrades)" value={-outputs.section_totals.all_in_basis} />
        <PlRow label="Total cash out (basis + carry + finance)" value={-outputs.base.total_cash_out} />
        <PlRow label="Net sale proceeds (after exit costs)" value={outputs.base.net_proceeds} />
        <p className="pt-2 text-[10px] text-brand-muted" style={dealDeskPlBarlow}>
          3×3 sensitivity grid — refine on wizard step 6
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 text-xs">
        <SummaryStat label="All-in basis" value={formatCurrency(outputs.section_totals.all_in_basis)} />
        <SummaryStat label="Break-even sale" value={formatCurrency(outputs.breakeven_sale_price)} />
        <SummaryStat label="Max buy @ target" value={formatCurrency(outputs.max_purchase_price_for_target)} />
      </div>
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
      <input value={value} onChange={(event) => onChange(event.target.value)} className="deal-desk-inp" />
    </label>
  );
}

function CurrencyInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <p className="mb-1 text-sm text-brand-muted">{label}</p>
      <div className="deal-desk-inp-wrap">
        <span className="text-sm text-brand-muted">$</span>
        <input
          inputMode="numeric"
          value={toCurrencyDisplay(value)}
          onChange={(event) => onChange(parseCurrencyInput(event.target.value))}
          className="deal-desk-inp-inner"
        />
      </div>
    </label>
  );
}

function CurrencyInputInline({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="deal-desk-inp-wrap">
      <span className="text-sm text-brand-muted">$</span>
      <input
        inputMode="numeric"
        value={toCurrencyDisplay(value)}
        onChange={(event) => onChange(parseCurrencyInput(event.target.value))}
        className="deal-desk-inp-inner"
      />
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <p className="mb-1 text-sm text-brand-muted">{label}</p>
      <input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value || "0"))}
        className="deal-desk-inp"
      />
    </label>
  );
}

function RangeInput({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <p className="mb-1 text-sm text-brand-muted">{label}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="deal-desk-range w-full"
      />
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
