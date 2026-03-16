"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { calculateFlip } from "@/lib/dealDesk/calculations";
import type { DealDeskScenarioWithContext } from "@/app/internal/deal-desk/types";

type DealDeskCardProps = {
  listingId: string;
  askingPrice: number;
  deferredMaintenance: number;
  aircraftLabel: string;
  sourceUrl: string;
};

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "$0";
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function profitColor(value: number): string {
  if (value < 0) return "text-red-400";
  if (Math.abs(value) < 3000) return "text-amber-300";
  return "text-emerald-400";
}

export default function DealDeskCard({ listingId, askingPrice, deferredMaintenance, aircraftLabel, sourceUrl }: DealDeskCardProps) {
  const [loading, setLoading] = useState(true);
  const [scenario, setScenario] = useState<DealDeskScenarioWithContext | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/internal/deal-desk?listing_id=${encodeURIComponent(listingId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as DealDeskScenarioWithContext[];
      })
      .then((rows) => {
        if (!active) return;
        setScenario(Array.isArray(rows) && rows.length > 0 ? rows[0] : null);
      })
      .catch(() => {
        if (!active) return;
        setScenario(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [listingId]);

  const fallback = useMemo(() => {
    const calc = calculateFlip({
      purchase_price: Math.round(askingPrice),
      resale_base: Math.round(askingPrice * 1.12),
      resale_low: Math.round(askingPrice * 1.02),
      resale_stretch: Math.round(askingPrice * 1.22),
      hold_months: 3,
      planned_hours_flown: 0,
      acquisition_items: [
        { id: "seed-prebuy", label: "Pre-buy inspection", amount: 800, category: "prebuy" },
        { id: "seed-travel", label: "Travel to inspection", amount: 400, category: "prebuy" },
      ],
      upgrade_items: [],
      hangar_monthly: 0,
      insurance_annual_premium: 0,
      subscriptions_monthly: 0,
      annual_inspection_reserve_monthly: 0,
      admin_overhead_monthly: 0,
      fuel_gph: 8,
      fuel_price_per_gallon: 6.5,
      oil_cost_per_hour: 0.5,
      engine_reserve_per_hour: 15,
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
    return calc;
  }, [askingPrice]);

  if (loading) {
    return (
      <section className="panel">
        <p className="text-sm text-brand-muted">Loading Deal Desk...</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">🧮 Deal Desk</h3>
        <Link
          href={`/internal/deal-desk/${encodeURIComponent(listingId)}`}
          className="rounded bg-brand-orange px-3 py-1 text-xs font-semibold !text-black hover:bg-brand-burn hover:!text-black"
        >
          Open Deal Desk →
        </Link>
      </div>
      {scenario ? (
        <div className="mt-2 space-y-1 text-sm">
          <p className="text-brand-muted">{scenario.label}</p>
          <p>All-in basis: {formatCurrency(scenario.all_in_basis)}</p>
          <p className={`text-lg font-bold ${profitColor(scenario.net_profit_base ?? 0)}`}>Net profit: {formatCurrency(scenario.net_profit_base)}</p>
          <p>Monthly burn: {formatCurrency(((scenario.total_carrying_costs ?? 0) + (scenario.total_variable_costs ?? 0)) / Math.max(1, scenario.hold_period_months || 1))}</p>
        </div>
      ) : (
        <div className="mt-2 space-y-1 text-sm">
          <p className="text-brand-muted">{aircraftLabel}</p>
          <p>All-in basis: {formatCurrency(fallback.section_totals.all_in_basis)}</p>
          <p className={`text-lg font-bold ${profitColor(fallback.base.net_profit)}`}>Net profit: {formatCurrency(fallback.base.net_profit)}</p>
          <p>Monthly burn: {formatCurrency(fallback.monthly_burn_rate)}</p>
          <p className="text-xs text-brand-muted">Source: {sourceUrl || "N/A"}</p>
        </div>
      )}
    </section>
  );
}
