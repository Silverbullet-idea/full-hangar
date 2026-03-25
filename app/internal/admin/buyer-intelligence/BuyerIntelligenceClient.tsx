"use client";

import { useMemo, useState } from "react";

type Payload = {
  market_snapshot: {
    price_trends: Array<{
      make: string;
      model: string;
      sample_count: number;
      median_asking_price: number;
      price_change_30d_pct: number;
      avg_days_on_market: number;
      inventory_count: number;
    }>;
    buyer_leverage_models: Array<{
      make: string;
      model: string;
      inventory_count: number;
      avg_days_on_market: number;
      pct_with_price_reduction: number;
    }>;
    scarce_models: Array<{ make: string; model: string; count: number }>;
  };
  deal_patterns: {
    aging_high_value: Array<{
      listing_id: string;
      make: string;
      model: string;
      year: number;
      price: number;
      flip_score: number;
      days_on_market: number;
      source_url: string;
    }>;
    price_drops: Array<{
      listing_id: string;
      make: string;
      model: string;
      year: number;
      original_price: number;
      current_price: number;
      reduction_pct: number;
      flip_score: number;
      days_on_market: number;
    }>;
    below_comp_listings: Array<{
      listing_id: string;
      make: string;
      model: string;
      year: number;
      price: number;
      estimated_market_value: number;
      discount_pct: number;
      flip_score: number;
    }>;
  };
  avoidance_signals: {
    tbo_risk_listings: Array<{
      listing_id: string;
      make: string;
      model: string;
      year: number;
      price: number;
      engine_model: string;
      smoh: number;
      tbo_hours: number;
      pct_of_tbo_used: number;
    }>;
    potential_relists: Array<{
      n_number: string;
      current_listing_id: string;
      previous_listing_ids: string[];
      price_history: number[];
    }>;
  };
  cost_of_ownership_benchmarks: {
    by_model: Array<{
      make: string;
      model: string;
      median_asking_price: number;
      avg_deferred_maintenance_estimate: number;
      typical_annual_cost: number;
      flip_margin_estimate: number;
      sample_size: number;
    }>;
  };
  ownership_transfer_feed: {
    recent_transfers: Array<{
      n_number: string;
      make: string;
      model: string;
      year: number;
      old_owner: string;
      new_owner: string;
      transfer_date: string;
      last_known_asking_price: number;
    }>;
  };
};

export default function BuyerIntelligenceClient({ data }: { data: Payload }) {
  const [activeTab, setActiveTab] = useState<"aging" | "drops" | "below">("aging");
  const priceRows = useMemo(() => [...data.market_snapshot.price_trends].sort((a, b) => a.price_change_30d_pct - b.price_change_30d_pct), [data.market_snapshot.price_trends]);
  const tabRows =
    activeTab === "aging"
      ? data.deal_patterns.aging_high_value
      : activeTab === "drops"
      ? data.deal_patterns.price_drops
      : data.deal_patterns.below_comp_listings;

  return (
    <main className="space-y-4 p-4 md:p-6">
      <header className="rounded border border-brand-dark bg-card-bg p-4">
        <h1 className="text-2xl font-semibold">Smart Buyer Intelligence</h1>
        <p className="text-sm text-brand-muted">What a smart aircraft buyer needs to know right now.</p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded border border-brand-dark bg-card-bg p-3">
          <p className="text-xs uppercase text-brand-muted">Buyer Leverage Models</p>
          <p className="text-xl font-semibold">{data.market_snapshot.buyer_leverage_models.length}</p>
        </article>
        <article className="rounded border border-brand-dark bg-card-bg p-3">
          <p className="text-xs uppercase text-brand-muted">Scarce Models</p>
          <p className="text-xl font-semibold">{data.market_snapshot.scarce_models.length}</p>
        </article>
        <article className="rounded border border-brand-dark bg-card-bg p-3">
          <p className="text-xs uppercase text-brand-muted">Tracked Models</p>
          <p className="text-xl font-semibold">{data.market_snapshot.price_trends.length}</p>
        </article>
      </section>

      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <h2 className="mb-2 text-lg font-semibold">Price Trend Table</h2>
        <div className="max-h-[26rem] overflow-auto rounded border border-brand-dark">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-[#111111] text-left text-xs uppercase text-brand-muted">
              <tr>
                <th className="px-3 py-2">Make / Model</th>
                <th className="px-3 py-2">Median Price</th>
                <th className="px-3 py-2">30d Change</th>
                <th className="px-3 py-2">Inventory</th>
                <th className="px-3 py-2">Avg DOM</th>
              </tr>
            </thead>
            <tbody>
              {priceRows.map((row) => (
                <tr key={`${row.make}-${row.model}`} className="border-t border-brand-dark hover:bg-[#1d1d1d]">
                  <td className="px-3 py-2">{row.make} {row.model}</td>
                  <td className="px-3 py-2">${Math.round(row.median_asking_price).toLocaleString()}</td>
                  <td className={`px-3 py-2 font-semibold ${row.price_change_30d_pct > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {row.price_change_30d_pct > 0 ? "↑" : "↓"} {Math.abs(row.price_change_30d_pct)}%
                  </td>
                  <td className="px-3 py-2">{row.inventory_count}</td>
                  <td className="px-3 py-2">{row.avg_days_on_market}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <div className="mb-3 flex items-center gap-2 text-xs">
          <button className="rounded border border-brand-dark px-2 py-1" onClick={() => setActiveTab("aging")}>Aging Deals</button>
          <button className="rounded border border-brand-dark px-2 py-1" onClick={() => setActiveTab("drops")}>Price Drops</button>
          <button className="rounded border border-brand-dark px-2 py-1" onClick={() => setActiveTab("below")}>Below Comps</button>
        </div>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {tabRows.slice(0, 18).map((row: any) => (
            <article key={row.listing_id} className="rounded border border-brand-dark p-3 text-sm">
              <p className="font-semibold">{row.year} {row.make} {row.model}</p>
              {"price" in row ? <p>Price: ${Math.round(row.price).toLocaleString()}</p> : null}
              {"current_price" in row ? <p>Now: ${Math.round(row.current_price).toLocaleString()}</p> : null}
              <p>Flip score: {Math.round(row.flip_score ?? 0)}</p>
              <p>Days on Market: {Math.round(row.days_on_market ?? 0)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded border border-brand-dark bg-card-bg p-4">
          <h2 className="mb-2 text-lg font-semibold">Avoidance Signals</h2>
          <div className="space-y-2 text-sm">
            {data.avoidance_signals.tbo_risk_listings.slice(0, 10).map((row) => {
              const tone = row.pct_of_tbo_used > 80 ? "text-red-400" : row.pct_of_tbo_used > 50 ? "text-brand-orange" : "text-emerald-400";
              return (
                <p key={row.listing_id}>
                  {row.year} {row.make} {row.model} - <span className={tone}>{row.pct_of_tbo_used}% TBO used</span>
                </p>
              );
            })}
          </div>
        </article>
        <article className="rounded border border-brand-dark bg-card-bg p-4">
          <h2 className="mb-2 text-lg font-semibold">Flip Model Benchmarks</h2>
          <div className="space-y-2 text-sm">
            {data.cost_of_ownership_benchmarks.by_model.map((row) => (
              <div key={`${row.make}-${row.model}`} className="rounded border border-brand-dark p-2">
                <p className="font-semibold">{row.make} {row.model}</p>
                <p>Median Ask: ${row.median_asking_price.toLocaleString()}</p>
                <p>Annual Cost: ${row.typical_annual_cost.toLocaleString()}</p>
                <p>Flip Margin: ${row.flip_margin_estimate.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <h2 className="mb-2 text-lg font-semibold">Confirmed Sales Feed</h2>
        <div className="space-y-1 text-sm">
          {data.ownership_transfer_feed.recent_transfers.slice(0, 20).map((row) => (
            <p key={`${row.n_number}-${row.transfer_date}`}>
              {row.transfer_date || "Unknown date"} - {row.n_number} {row.year} {row.make} {row.model}: {row.old_owner} → {row.new_owner} (${Math.round(row.last_known_asking_price).toLocaleString()})
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}
