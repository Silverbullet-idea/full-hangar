"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { calculateDeal } from "@/lib/dealDesk/calculations";
import type { DealDeskScenarioWithContext } from "@/app/internal/deal-desk/components/DealDeskCalculator";

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
  if (Math.abs(value) < 2000) return "text-amber-300";
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

  const fallback = useMemo(
    () =>
      calculateDeal({
        asking_price: Math.round(askingPrice),
        deferred_maintenance: Math.round(deferredMaintenance),
        avionics_upgrade_budget: 0,
        paint_interior_budget: 0,
        ferry_flight_cost: 0,
        hold_period_months: 3,
        title_escrow_fees: 800,
        target_profit_dollars: 8000,
        estimated_resale_price: Math.round(askingPrice * 1.15),
      }),
    [askingPrice, deferredMaintenance]
  );

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
          className="rounded bg-brand-orange px-3 py-1 text-xs font-semibold text-black hover:bg-brand-burn hover:text-white"
        >
          Open Deal Desk →
        </Link>
      </div>
      {scenario ? (
        <div className="mt-2 space-y-1 text-sm">
          <p className="text-brand-muted">{scenario.label}</p>
          <p className={`text-xl font-bold ${profitColor(scenario.profit_at_ask ?? 0)}`}>Profit at Ask: {formatCurrency(scenario.profit_at_ask)}</p>
          <p className="text-sm text-emerald-400">Max Offer: {formatCurrency(scenario.max_offer_price)}</p>
        </div>
      ) : (
        <div className="mt-2 space-y-1 text-sm">
          <p className="text-brand-muted">{aircraftLabel}</p>
          <p className={`text-xl font-bold ${profitColor(fallback.profit_at_ask)}`}>Profit at Ask: {formatCurrency(fallback.profit_at_ask)}</p>
          <p className="text-xs text-brand-muted">Source: {sourceUrl || "N/A"}</p>
        </div>
      )}
    </section>
  );
}
