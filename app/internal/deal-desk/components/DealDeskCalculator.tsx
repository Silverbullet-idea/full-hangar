"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calculateDeal, type DealCalcInputs } from "@/lib/dealDesk/calculations";

type SaveState = "idle" | "saving" | "saved" | "error";

export type DealDeskScenarioWithContext = {
  id: string;
  listing_id: string;
  label: string;
  asking_price: number | null;
  deferred_maintenance: number;
  avionics_upgrade_budget: number;
  paint_interior_budget: number;
  ferry_flight_cost: number;
  hold_period_months: number;
  title_escrow_fees: number;
  insurance_estimate: number;
  total_acquisition_cost: number | null;
  estimated_resale_price: number | null;
  profit_at_ask: number | null;
  profit_percent_at_ask: number | null;
  target_profit_dollars: number;
  max_offer_price: number | null;
  source_listing_url: string | null;
  aircraft_label: string | null;
  created_at: string;
  updated_at: string;
  listing_context?: {
    asking_price?: number | null;
    deferred_total?: number | null;
    source_url?: string | null;
  } | null;
};

export type DealDeskSeed = {
  listingId: string;
  aircraftLabel: string;
  sourceUrl: string;
  askingPrice: number;
  deferredMaintenance: number;
};

type CalculatorSnapshot = {
  scenarioId: string | null;
  label: string;
  aircraftLabel: string;
  inputs: DealCalcInputs;
  metrics: ReturnType<typeof calculateDeal>;
};

type DealDeskCalculatorProps = {
  seed: DealDeskSeed;
  initialScenario?: DealDeskScenarioWithContext | null;
  onSnapshot?: (snapshot: CalculatorSnapshot) => void;
};

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "$0";
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

function profitColor(value: number): string {
  if (value < 0) return "text-red-400";
  if (Math.abs(value) < 2000) return "text-amber-300";
  return "text-emerald-400";
}

function signalLabel(value: number): string {
  if (value < 0) return "🔴";
  if (value < 5000) return "🟡";
  if (value < 10000) return "🟢";
  return "⭐";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function DealDeskCalculator({ seed, initialScenario, onSnapshot }: DealDeskCalculatorProps) {
  const [scenarioId, setScenarioId] = useState<string | null>(initialScenario?.id ?? null);
  const [label, setLabel] = useState(initialScenario?.label ?? "Base Case");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [inputs, setInputs] = useState<DealCalcInputs>({
    asking_price: Math.round(initialScenario?.asking_price ?? seed.askingPrice),
    deferred_maintenance: Math.round(initialScenario?.deferred_maintenance ?? seed.deferredMaintenance),
    avionics_upgrade_budget: Math.round(initialScenario?.avionics_upgrade_budget ?? 0),
    paint_interior_budget: Math.round(initialScenario?.paint_interior_budget ?? 0),
    ferry_flight_cost: Math.round(initialScenario?.ferry_flight_cost ?? 0),
    hold_period_months: Math.round(initialScenario?.hold_period_months ?? 3),
    title_escrow_fees: Math.round(initialScenario?.title_escrow_fees ?? 800),
    target_profit_dollars: Math.round(initialScenario?.target_profit_dollars ?? 8000),
    estimated_resale_price: Math.round(
      initialScenario?.estimated_resale_price ?? Math.round((initialScenario?.asking_price ?? seed.askingPrice) * 1.12)
    ),
  });

  const calculated = useMemo(() => calculateDeal(inputs), [inputs]);
  const savePayloadRef = useRef<string>("");

  useEffect(() => {
    onSnapshot?.({
      scenarioId,
      label,
      aircraftLabel: seed.aircraftLabel,
      inputs,
      metrics: calculated,
    });
  }, [calculated, inputs, label, onSnapshot, scenarioId, seed.aircraftLabel]);

  useEffect(() => {
    const payload = {
      label,
      asking_price: inputs.asking_price,
      deferred_maintenance: inputs.deferred_maintenance,
      avionics_upgrade_budget: inputs.avionics_upgrade_budget,
      paint_interior_budget: inputs.paint_interior_budget,
      ferry_flight_cost: inputs.ferry_flight_cost,
      hold_period_months: inputs.hold_period_months,
      title_escrow_fees: inputs.title_escrow_fees,
      insurance_estimate: calculated.insurance_estimate,
      total_acquisition_cost: calculated.total_cost,
      estimated_resale_price: inputs.estimated_resale_price,
      profit_at_ask: calculated.profit_at_ask,
      profit_percent_at_ask: calculated.profit_percent_at_ask,
      target_profit_dollars: inputs.target_profit_dollars,
      max_offer_price: calculated.max_offer_price,
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
        setLastSavedAt(Date.now());
      } catch {
        setSaveState("error");
      }
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [calculated, inputs, label, scenarioId, seed.aircraftLabel, seed.listingId, seed.sourceUrl]);

  const nearestMaxOfferDiscount = useMemo(() => {
    return calculated.negotiation_table.reduce(
      (best, row) => {
        const distance = Math.abs(row.offer_price - calculated.max_offer_price);
        if (distance < best.distance) return { discount: row.discount, distance };
        return best;
      },
      { discount: 0, distance: Number.POSITIVE_INFINITY }
    ).discount;
  }, [calculated.max_offer_price, calculated.negotiation_table]);

  const fixedCosts =
    inputs.deferred_maintenance +
    inputs.avionics_upgrade_budget +
    inputs.paint_interior_budget +
    inputs.ferry_flight_cost +
    calculated.insurance_estimate +
    inputs.title_escrow_fees;

  const saveText =
    saveState === "saving"
      ? "Saving..."
      : saveState === "saved"
      ? `Saved ${lastSavedAt ? "just now" : ""}`.trim()
      : saveState === "error"
      ? "Save failed"
      : "Ready";

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <h1 className="text-lg font-semibold">{seed.aircraftLabel}</h1>
        <p className="text-2xl font-bold text-brand-orange">{formatCurrency(inputs.asking_price)}</p>

        <div className="mt-4 space-y-3">
          <LabeledNumberInput
            label="Asking Price"
            value={inputs.asking_price}
            onChange={(value) => setInputs((previous) => ({ ...previous, asking_price: Math.max(0, value) }))}
          />
          <LabeledNumberInput
            label="Deferred Maintenance"
            value={inputs.deferred_maintenance}
            onChange={(value) => setInputs((previous) => ({ ...previous, deferred_maintenance: Math.max(0, value) }))}
          />
          <LabeledNumberInput
            label="Avionics Upgrade Budget"
            value={inputs.avionics_upgrade_budget}
            onChange={(value) => setInputs((previous) => ({ ...previous, avionics_upgrade_budget: Math.max(0, value) }))}
          />
          <LabeledNumberInput
            label="Paint / Interior"
            value={inputs.paint_interior_budget}
            onChange={(value) => setInputs((previous) => ({ ...previous, paint_interior_budget: Math.max(0, value) }))}
          />
          <LabeledNumberInput
            label="Ferry Flight"
            value={inputs.ferry_flight_cost}
            onChange={(value) => setInputs((previous) => ({ ...previous, ferry_flight_cost: Math.max(0, value) }))}
          />

          <div>
            <p className="text-sm text-brand-muted">Hold Period</p>
            <p className="mb-2 text-sm font-semibold text-brand-orange">{inputs.hold_period_months} months</p>
            <input
              type="range"
              min={1}
              max={18}
              step={1}
              value={inputs.hold_period_months}
              onChange={(event) =>
                setInputs((previous) => ({ ...previous, hold_period_months: clamp(Number(event.target.value), 1, 18) }))
              }
              className="w-full accent-brand-orange"
            />
            <p className="mt-1 text-xs text-brand-muted">Est. insurance: {formatCurrency(calculated.insurance_estimate)}</p>
          </div>

          <LabeledNumberInput
            label="Title / Escrow / Fees"
            value={inputs.title_escrow_fees}
            onChange={(value) => setInputs((previous) => ({ ...previous, title_escrow_fees: Math.max(0, value) }))}
          />

          <div className="border-t border-brand-dark pt-3">
            <p className="text-sm font-semibold">Your estimated resale price</p>
            <p className="text-xs text-brand-muted">Adjust based on comps and planned upgrades</p>
            <LabeledNumberInput
              label="Estimated Resale Price"
              value={inputs.estimated_resale_price}
              onChange={(value) => setInputs((previous) => ({ ...previous, estimated_resale_price: Math.max(0, value) }))}
            />
          </div>

          <div>
            <p className="text-sm font-semibold">Target: {formatCurrency(inputs.target_profit_dollars)} profit</p>
            <input
              type="range"
              min={3000}
              max={25000}
              step={1000}
              value={inputs.target_profit_dollars}
              onChange={(event) =>
                setInputs((previous) => ({
                  ...previous,
                  target_profit_dollars: clamp(Number(event.target.value), 3000, 25000),
                }))
              }
              className="mt-1 w-full accent-brand-orange"
            />
          </div>

          <div>
            <p className="mb-1 text-sm text-brand-muted">Scenario Label</p>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value || "Base Case")}
              className="w-full rounded border border-brand-dark bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-brand-orange"
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex justify-end text-xs text-brand-muted">{saveText}</div>

        <article className="rounded border border-brand-dark bg-card-bg p-4">
          <p className="text-xs uppercase tracking-wide text-brand-muted">Max Offer Price</p>
          <p className={`text-3xl font-extrabold ${calculated.max_offer_price >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {formatCurrency(calculated.max_offer_price)}
          </p>
          <p className="mt-1 text-xs text-brand-muted">
            Pay no more than this to hit your {formatCurrency(inputs.target_profit_dollars)} target
          </p>
        </article>

        <article className="rounded border border-brand-dark bg-card-bg p-4">
          <p className="text-xs uppercase tracking-wide text-brand-muted">Profit at Asking Price</p>
          <p className={`text-3xl font-extrabold ${profitColor(calculated.profit_at_ask)}`}>{formatCurrency(calculated.profit_at_ask)}</p>
          <p className={`text-sm font-semibold ${profitColor(calculated.profit_at_ask)}`}>{formatPercent(calculated.profit_percent_at_ask)}</p>
          <p className="mt-1 text-xs text-brand-muted">Total all-in cost: {formatCurrency(calculated.total_cost)}</p>
        </article>

        <article className="rounded border border-brand-dark bg-card-bg p-4">
          <h3 className="text-sm font-semibold">Negotiation Leverage Table</h3>
          <div className="mt-2 overflow-x-auto rounded border border-brand-dark">
            <table className="min-w-full text-xs">
              <thead className="bg-[#111111] text-brand-muted">
                <tr>
                  <th className="px-2 py-2 text-left">Discount</th>
                  <th className="px-2 py-2 text-left">Offer Price</th>
                  <th className="px-2 py-2 text-left">Profit</th>
                  <th className="px-2 py-2 text-left">Return %</th>
                  <th className="px-2 py-2 text-left">Signal</th>
                </tr>
              </thead>
              <tbody>
                {calculated.negotiation_table.map((row) => {
                  const isMaxOfferRow = row.discount === nearestMaxOfferDiscount;
                  return (
                    <tr key={row.discount} className={`border-t border-brand-dark ${isMaxOfferRow ? "bg-[#1a2a1f]" : "bg-[#131313]"}`}>
                      <td className="px-2 py-2">-{formatCurrency(row.discount)}</td>
                      <td className="px-2 py-2">{formatCurrency(row.offer_price)}</td>
                      <td className={`px-2 py-2 font-semibold ${profitColor(row.profit)}`}>{formatCurrency(row.profit)}</td>
                      <td className={`px-2 py-2 ${profitColor(row.profit)}`}>{formatPercent(row.profit_percent)}</td>
                      <td className="px-2 py-2">{signalLabel(row.profit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-brand-muted">
            Fixed costs: {formatCurrency(fixedCosts)} (maintenance {formatCurrency(inputs.deferred_maintenance)} + avionics{" "}
            {formatCurrency(inputs.avionics_upgrade_budget)} + paint {formatCurrency(inputs.paint_interior_budget)} + ferry{" "}
            {formatCurrency(inputs.ferry_flight_cost)} + insurance {formatCurrency(calculated.insurance_estimate)} + fees{" "}
            {formatCurrency(inputs.title_escrow_fees)})
          </p>
        </article>
      </section>
    </div>
  );
}

function LabeledNumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <p className="mb-1 text-sm text-brand-muted">{label}</p>
      <div className="flex items-center rounded border border-brand-dark bg-[#121212] px-2">
        <span className="text-sm text-brand-muted">$</span>
        <input
          type="number"
          min={0}
          value={Number.isFinite(value) ? value : 0}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value || "0")))}
          className="w-full bg-transparent px-2 py-2 text-sm text-white outline-none"
        />
      </div>
    </label>
  );
}
