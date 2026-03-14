"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DealDeskCalculator, {
  type DealDeskScenarioWithContext,
  type DealDeskSeed,
} from "../components/DealDeskCalculator";

type Snapshot = {
  scenarioId: string | null;
  label: string;
  aircraftLabel: string;
  inputs: {
    deferred_maintenance: number;
    avionics_upgrade_budget: number;
    paint_interior_budget: number;
  };
  metrics: {
    profit_at_ask: number;
    profit_percent_at_ask: number;
    max_offer_price: number;
  };
};

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "$0";
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

function buildSeed(row: DealDeskScenarioWithContext): DealDeskSeed {
  return {
    listingId: row.listing_id,
    aircraftLabel: row.aircraft_label || row.listing_id,
    sourceUrl: row.source_listing_url || row.listing_context?.source_url || "",
    askingPrice: Math.round(row.asking_price ?? row.listing_context?.asking_price ?? 0),
    deferredMaintenance: Math.round(row.deferred_maintenance ?? row.listing_context?.deferred_total ?? 0),
  };
}

export default function DealDeskComparePage() {
  const searchParams = useSearchParams();
  const [scenarios, setScenarios] = useState<DealDeskScenarioWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});

  const ids = useMemo(() => {
    const raw = searchParams.get("ids") || "";
    return raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 2);
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    if (ids.length === 0) {
      setScenarios([]);
      setLoading(false);
      return;
    }
    Promise.all(
      ids.map(async (id) => {
        const response = await fetch(`/api/internal/deal-desk/${id}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as DealDeskScenarioWithContext;
      })
    )
      .then((rows) => {
        if (!active) return;
        setScenarios(rows);
      })
      .catch(() => {
        if (!active) return;
        setScenarios([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ids]);

  const left = scenarios[0];
  const right = scenarios[1];
  const leftSnapshot = left ? snapshots[left.id] : undefined;
  const rightSnapshot = right ? snapshots[right.id] : undefined;

  const summary = useMemo(() => {
    if (!leftSnapshot || !rightSnapshot) return null;
    const leftRisk =
      leftSnapshot.inputs.deferred_maintenance +
      leftSnapshot.inputs.avionics_upgrade_budget +
      leftSnapshot.inputs.paint_interior_budget;
    const rightRisk =
      rightSnapshot.inputs.deferred_maintenance +
      rightSnapshot.inputs.avionics_upgrade_budget +
      rightSnapshot.inputs.paint_interior_budget;

    const profitWinner =
      leftSnapshot.metrics.profit_at_ask === rightSnapshot.metrics.profit_at_ask
        ? "—"
        : leftSnapshot.metrics.profit_at_ask > rightSnapshot.metrics.profit_at_ask
        ? `✅ ${leftSnapshot.aircraftLabel}`
        : `✅ ${rightSnapshot.aircraftLabel}`;

    const percentWinner =
      leftSnapshot.metrics.profit_percent_at_ask === rightSnapshot.metrics.profit_percent_at_ask
        ? "—"
        : leftSnapshot.metrics.profit_percent_at_ask > rightSnapshot.metrics.profit_percent_at_ask
        ? `✅ ${leftSnapshot.aircraftLabel}`
        : `✅ ${rightSnapshot.aircraftLabel}`;

    const riskWinner =
      leftRisk === rightRisk ? "—" : leftRisk < rightRisk ? `✅ ${leftSnapshot.aircraftLabel}` : `✅ ${rightSnapshot.aircraftLabel}`;

    const leftWins =
      leftSnapshot.metrics.profit_at_ask > rightSnapshot.metrics.profit_at_ask &&
      leftSnapshot.metrics.profit_percent_at_ask > rightSnapshot.metrics.profit_percent_at_ask &&
      leftRisk < rightRisk;
    const rightWins =
      rightSnapshot.metrics.profit_at_ask > leftSnapshot.metrics.profit_at_ask &&
      rightSnapshot.metrics.profit_percent_at_ask > leftSnapshot.metrics.profit_percent_at_ask &&
      rightRisk < leftRisk;

    return {
      leftRisk,
      rightRisk,
      profitWinner,
      percentWinner,
      riskWinner,
      allWinnerBanner: leftWins
        ? `📊 ${leftSnapshot.aircraftLabel} wins on profit, return, and risk exposure`
        : rightWins
        ? `📊 ${rightSnapshot.aircraftLabel} wins on profit, return, and risk exposure`
        : null,
    };
  }, [leftSnapshot, rightSnapshot]);

  if (loading) {
    return <div className="text-sm text-brand-muted">Loading comparison scenarios...</div>;
  }

  if (!left || !right) {
    return (
      <main className="space-y-3">
        <p className="text-sm text-brand-muted">Select two scenarios from Deal Desk to compare.</p>
        <Link href="/internal/deal-desk" className="text-sm text-brand-orange hover:text-brand-burn">
          Back to Deal Desk
        </Link>
      </main>
    );
  }

  return (
    <main className="space-y-3">
      <p className="text-sm">
        <Link href="/internal/deal-desk" className="text-brand-muted hover:text-brand-orange">
          ← Back to Deal Desk
        </Link>
      </p>

      <div className="grid gap-3 xl:grid-cols-2">
        {[left, right].map((scenario) => (
          <DealDeskCalculator
            key={scenario.id}
            seed={buildSeed(scenario)}
            initialScenario={scenario}
            onSnapshot={(snapshot) => setSnapshots((previous) => ({ ...previous, [scenario.id]: snapshot }))}
          />
        ))}
      </div>

      {summary ? (
        <section className="rounded border border-brand-dark bg-card-bg p-4">
          <h2 className="text-lg font-semibold">Comparison Summary</h2>
          <div className="mt-2 overflow-x-auto rounded border border-brand-dark">
            <table className="min-w-[760px] w-full text-xs">
              <thead className="bg-[#111111] text-brand-muted">
                <tr>
                  <th className="px-2 py-2 text-left">Metric</th>
                  <th className="px-2 py-2 text-left">{leftSnapshot?.aircraftLabel || left.aircraft_label}</th>
                  <th className="px-2 py-2 text-left">{rightSnapshot?.aircraftLabel || right.aircraft_label}</th>
                  <th className="px-2 py-2 text-left">Winner</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-brand-dark">
                  <td className="px-2 py-2">Dollar profit at ask</td>
                  <td className="px-2 py-2">{formatCurrency(leftSnapshot?.metrics.profit_at_ask)}</td>
                  <td className="px-2 py-2">{formatCurrency(rightSnapshot?.metrics.profit_at_ask)}</td>
                  <td className="px-2 py-2">{summary.profitWinner}</td>
                </tr>
                <tr className="border-t border-brand-dark">
                  <td className="px-2 py-2">Return % at ask</td>
                  <td className="px-2 py-2">{formatPercent(leftSnapshot?.metrics.profit_percent_at_ask)}</td>
                  <td className="px-2 py-2">{formatPercent(rightSnapshot?.metrics.profit_percent_at_ask)}</td>
                  <td className="px-2 py-2">{summary.percentWinner}</td>
                </tr>
                <tr className="border-t border-brand-dark">
                  <td className="px-2 py-2">Max offer price</td>
                  <td className="px-2 py-2">{formatCurrency(leftSnapshot?.metrics.max_offer_price)}</td>
                  <td className="px-2 py-2">{formatCurrency(rightSnapshot?.metrics.max_offer_price)}</td>
                  <td className="px-2 py-2">—</td>
                </tr>
                <tr className="border-t border-brand-dark">
                  <td className="px-2 py-2">Total risk exposure</td>
                  <td className="px-2 py-2">{formatCurrency(summary.leftRisk)}</td>
                  <td className="px-2 py-2">{formatCurrency(summary.rightRisk)}</td>
                  <td className="px-2 py-2">{summary.riskWinner} (lower)</td>
                </tr>
              </tbody>
            </table>
          </div>
          {summary.allWinnerBanner ? <p className="mt-2 text-sm text-brand-orange">{summary.allWinnerBanner}</p> : null}
        </section>
      ) : null}
    </main>
  );
}
