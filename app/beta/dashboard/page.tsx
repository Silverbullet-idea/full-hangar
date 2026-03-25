"use client";

import { useEffect, useState } from "react";
import { FLIP_TIER_CONFIG } from "@/lib/scoring/flipTierConfig";

type DashboardPayload = any;

export default function BetaDashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/beta/dashboard");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error === "session_expired" ? "Your session has expired." : payload?.error ?? "Unable to load dashboard data.");
      }
      setData(payload);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <main className="space-y-3 p-4 md:p-6">
        <div className="h-20 animate-pulse rounded border border-brand-dark bg-card-bg" />
        <div className="h-40 animate-pulse rounded border border-brand-dark bg-card-bg" />
        <div className="h-40 animate-pulse rounded border border-brand-dark bg-card-bg" />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="space-y-3 p-4 md:p-6">
        <div className="rounded border border-brand-dark bg-card-bg p-4">
          <p className="text-sm text-red-400">{error || "Dashboard data is unavailable."}</p>
          <button className="mt-2 rounded border border-brand-dark px-3 py-1 text-sm" onClick={load}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  const buyer = data.buyer;
  const platform = data.platform;
  const topDeals = Array.isArray(data.topDeals) ? data.topDeals : [];

  return (
    <main className="space-y-4 p-4 md:p-6">
      <header className="rounded border border-brand-dark bg-card-bg p-4">
        <h1 className="text-2xl font-semibold">Full Hangar Market Intelligence - Beta Access</h1>
        <p className="text-sm text-brand-muted">
          You&apos;re seeing early access to real-time aircraft market data. Pricing and deal signals update daily.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <article className="rounded border border-brand-dark bg-card-bg p-3">
          <p className="text-xs uppercase text-brand-muted">Listings Monitored</p>
          <p className="text-2xl font-semibold">{platform.listings.total_active.toLocaleString()}</p>
        </article>
        <article className="rounded border border-brand-dark bg-card-bg p-3">
          <p className="text-xs uppercase text-brand-muted">High flip scores today</p>
          <p className="text-2xl font-semibold">{platform.deals.high_score_listings.toLocaleString()}</p>
        </article>
        <article className="rounded border border-brand-dark bg-card-bg p-3">
          <p className="text-xs uppercase text-brand-muted">Models Getting Cheaper</p>
          <p className="text-2xl font-semibold">{buyer.market_snapshot.price_trends.filter((row: any) => row.price_change_30d_pct < 0).length}</p>
        </article>
        <article className="rounded border border-brand-dark bg-card-bg p-3">
          <p className="text-xs uppercase text-brand-muted">Models Getting Pricier</p>
          <p className="text-2xl font-semibold">{buyer.market_snapshot.price_trends.filter((row: any) => row.price_change_30d_pct > 0).length}</p>
        </article>
      </section>

      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <h2 className="mb-2 text-lg font-semibold">Active Deal Highlights</h2>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {topDeals.map((row: any) => {
            const tierKey = String(row.flip_tier ?? "").toUpperCase();
            const tierCfg = FLIP_TIER_CONFIG[tierKey];
            return (
            <article key={String(row.id)} className="rounded border border-brand-dark p-3 text-sm">
              <p className="font-semibold">{row.year} {row.make} {row.model}</p>
              <p>Price: {row.asking_price ? `$${Math.round(Number(row.asking_price)).toLocaleString()}` : "Call for price"}</p>
              <p className="flex flex-wrap items-center gap-2">
                <span>Flip score: {Math.round(Number(row.flip_score ?? 0))}</span>
                {tierCfg ? (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${tierCfg.bg} ${tierCfg.text}`}>{tierCfg.label}</span>
                ) : null}
              </p>
              <p>Days On Market: {Math.round(Number(row.days_on_market ?? 0))}</p>
              <a className="mt-1 inline-block text-brand-orange hover:text-brand-burn" href={String(row.listing_url ?? row.url ?? "#")} target="_blank" rel="noreferrer">
                View Listing →
              </a>
            </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded border border-brand-dark bg-card-bg p-4">
          <h2 className="mb-2 text-lg font-semibold">Price Drop Alerts</h2>
          <div className="space-y-1 text-sm">
            {buyer.deal_patterns.price_drops.slice(0, 10).map((row: any) => (
              <p key={row.listing_id}>
                {row.year} {row.make} {row.model}: ${Math.round(row.original_price).toLocaleString()} → ${Math.round(row.current_price).toLocaleString()} ({row.reduction_pct}%)
              </p>
            ))}
          </div>
        </article>
        <article className="rounded border border-brand-dark bg-card-bg p-4">
          <h2 className="mb-2 text-lg font-semibold">Market Intelligence Snippet</h2>
          <div className="space-y-2 text-sm">
            {buyer.deal_patterns.below_comp_listings.slice(0, 2).map((row: any) => (
              <p key={row.listing_id}>
                This {row.year} {row.make} {row.model} is listed at ${Math.round(row.price).toLocaleString()} - our comp analysis shows
                similar aircraft selling near ${Math.round(row.estimated_market_value).toLocaleString()} ({row.discount_pct}% discount).
              </p>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <h2 className="mb-2 text-lg font-semibold">Cost of Ownership Benchmarks</h2>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {buyer.cost_of_ownership_benchmarks.by_model.slice(0, 5).map((row: any) => (
            <article key={`${row.make}-${row.model}`} className="rounded border border-brand-dark p-3 text-sm">
              <p className="font-semibold">{row.make} {row.model}</p>
              <p>Median Ask: ${row.median_asking_price.toLocaleString()}</p>
              <p>Estimated Annual Cost: ${row.typical_annual_cost.toLocaleString()}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="rounded border border-brand-dark bg-card-bg p-4 text-sm text-brand-muted">
        Full Hangar is in active development. Your feedback shapes what gets built next.{" "}
        <a className="text-brand-orange hover:text-brand-burn" href="mailto:ryan@full-hangar.com">
          Contact Ryan
        </a>
      </footer>
    </main>
  );
}
