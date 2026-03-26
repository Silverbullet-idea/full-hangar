"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DealDeskScenarioWithContext } from "./types";

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
  if (Math.abs(value) < 3000) return "text-amber-300";
  return "text-emerald-400";
}

export default function DealDeskIndexPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DealDeskScenarioWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newListingId, setNewListingId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadRows = async () => {
    const response = await fetch("/api/internal/deal-desk");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as DealDeskScenarioWithContext[];
    setRows(Array.isArray(payload) ? payload : []);
  };

  useEffect(() => {
    loadRows()
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const compareHref = useMemo(() => {
    const ids = Array.from(selected).slice(0, 2);
    return `/internal/deal-desk/compare?ids=${ids.join(",")}`;
  }, [selected]);

  const onDelete = async (id: string) => {
    if (!window.confirm("Remove this scenario?")) return;
    const response = await fetch(`/api/internal/deal-desk/${id}`, { method: "DELETE" });
    if (!response.ok) return;
    setRows((previous) => previous.filter((row) => row.id !== id));
    setSelected((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
  };

  const onCreateBaseScenario = async () => {
    const listingId = newListingId.trim();
    if (!listingId || creating) return;

    const existing = rows.find((row) => row.listing_id === listingId);
    if (existing) {
      router.push(`/internal/deal-desk/${encodeURIComponent(existing.listing_id)}`);
      return;
    }

    setCreateError(null);
    setCreating(true);
    try {
      const response = await fetch("/api/internal/deal-desk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_id: listingId,
          label: "Base Case",
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const created = (await response.json()) as DealDeskScenarioWithContext;
      setRows((previous) => [created, ...previous]);
      setNewListingId("");
      router.push(`/internal/deal-desk/${encodeURIComponent(created.listing_id)}`);
    } catch {
      setCreateError("Could not create a scenario for that listing ID.");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-brand-muted">Loading Deal Desk pipeline...</div>;
  }

  return (
    <main className="space-y-3">
      <header className="rounded border border-brand-dark bg-card-bg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">🧮 Deal Desk</h1>
            <p className="text-sm text-brand-muted">Saved deal scenarios sorted by most recent activity.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/internal/market-intel"
              className="rounded border border-brand-dark px-3 py-2 text-sm text-brand-muted hover:border-brand-orange hover:text-brand-orange"
            >
              📈 Market Intel
            </Link>
            {selected.size >= 2 ? (
              <Link href={compareHref} className="fh-cta-on-orange-fill rounded bg-brand-orange px-3 py-2 text-sm font-semibold hover:bg-brand-burn">
                Compare Selected →
              </Link>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={newListingId}
            onChange={(event) => setNewListingId(event.target.value)}
            placeholder="Enter listing ID to create Base Case"
            className="min-w-[280px] flex-1 rounded border border-brand-dark bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-brand-orange"
          />
          <button
            type="button"
            onClick={onCreateBaseScenario}
            disabled={creating || newListingId.trim().length === 0}
            className="fh-cta-on-orange-fill rounded bg-brand-orange px-3 py-2 text-sm font-semibold hover:bg-brand-burn disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create Base Scenario"}
          </button>
        </div>
        {createError ? <p className="mt-2 text-xs text-red-400">{createError}</p> : null}
      </header>

      <div className="overflow-x-auto rounded border border-brand-dark bg-[#111]">
        <table className="min-w-[1100px] w-full text-xs">
          <thead className="bg-[#1c1c1c] text-brand-muted">
            <tr>
              <th className="px-2 py-2 text-left">Select</th>
              <th className="px-2 py-2 text-left">Aircraft</th>
              <th className="px-2 py-2 text-left">Scenario</th>
              <th className="px-2 py-2 text-left">Asking</th>
              <th className="px-2 py-2 text-left">All-in Basis</th>
              <th className="px-2 py-2 text-left">Monthly Burn</th>
              <th className="px-2 py-2 text-left">Net Profit (base)</th>
              <th className="px-2 py-2 text-left">Annualized ROI</th>
              <th className="px-2 py-2 text-left">Last Updated</th>
              <th className="px-2 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const currentSelected = selected.has(row.id);
              const profit = row.net_profit_base ?? row.profit_at_ask ?? 0;
              const holdMonths = row.hold_period_months > 0 ? row.hold_period_months : 1;
              const monthlyBurn =
                (row.total_carrying_costs ?? 0) / holdMonths +
                (row.total_variable_costs ?? 0) / holdMonths;
              return (
                <tr key={row.id} className="border-t border-brand-dark bg-[#131313]">
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={currentSelected}
                      onChange={(event) =>
                        setSelected((previous) => {
                          const next = new Set(previous);
                          if (event.target.checked) next.add(row.id);
                          else next.delete(row.id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-2 font-semibold">{row.aircraft_label || row.listing_id}</td>
                  <td className="px-2 py-2">{row.label}</td>
                  <td className="px-2 py-2">{formatCurrency(row.asking_price)}</td>
                  <td className="px-2 py-2">{formatCurrency(row.all_in_basis)}</td>
                  <td className="px-2 py-2">{formatCurrency(monthlyBurn)}</td>
                  <td className={`px-2 py-2 font-semibold ${profitColor(profit)}`}>{formatCurrency(profit)}</td>
                  <td className={`px-2 py-2 ${profitColor(profit)}`}>{formatPercent(row.annualized_roi_pct_base)}</td>
                  <td className="px-2 py-2 text-brand-muted">{new Date(row.updated_at).toLocaleString()}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/internal/deal-desk/${encodeURIComponent(row.listing_id)}`}
                        className="fh-cta-on-orange-fill rounded bg-brand-orange px-2 py-1 text-[11px] font-semibold hover:bg-brand-burn"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => onDelete(row.id)}
                        className="rounded border border-brand-dark px-2 py-1 text-[11px] text-brand-muted hover:border-red-500 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
