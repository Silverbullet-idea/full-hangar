"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SourceQualityRow = {
  source: string;
  active_listings: number;
  pct_with_price: number;
  pct_with_n_number: number;
  pct_with_total_time: number;
  pct_with_smoh: number;
  pct_with_engine_model: number;
  pct_with_location: number;
  critical_completeness_pct: number;
  max_completeness_pct: number;
  avg_score: number | null;
  avg_full_completeness_pct: number;
  avg_critical_completeness_pct: number;
  tiers: {
    pct_90_100: number;
    pct_70_89: number;
    pct_under_70: number;
  };
  trend: {
    added_last_7d: number;
    added_prev_7d: number;
    added_delta_pct: number | null;
    full_completeness_last_7d_pct: number | null;
    full_completeness_prev_7d_pct: number | null;
    full_completeness_delta_pct: number | null;
    avg_score_last_7d: number | null;
    avg_score_prev_7d: number | null;
    avg_score_delta: number | null;
  };
  freshness: {
    seen_last_24h_pct: number;
    seen_last_72h_pct: number;
    seen_last_7d_pct: number;
    median_days_since_seen: number;
  };
  source_health_score: number;
  alerts: Array<{ level: "critical" | "warning"; label: string; detail: string }>;
  field_coverage: Record<string, number>;
  unknown_domains: Array<{ domain: string; count: number }>;
};

type SourceQualityPayload = {
  computed_at: string;
  completeness_fields: string[];
  critical_fields: string[];
  sources: SourceQualityRow[];
};

function fmtPct(value: number) {
  return `${value.toFixed(1)}%`;
}

function heatmapCellClass(value: number) {
  if (value > 85) return "bg-emerald-700/70";
  if (value >= 60) return "bg-brand-orange/50";
  return "bg-brand-burn/55";
}

function sourceLabel(source: string) {
  if (source === "unknown") return "unknown";
  return source;
}

function fmtDelta(value: number | null, suffix = "") {
  if (value === null) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}

function deltaClass(value: number | null) {
  if (value === null) return "text-brand-muted";
  const positive = value > 0;
  return positive ? "text-emerald-500" : value < 0 ? "text-brand-burn" : "text-brand-muted";
}

function healthClass(score: number) {
  if (score >= 80) return "text-emerald-500";
  if (score >= 65) return "text-brand-orange";
  return "text-brand-burn";
}

function alertBadgeClass(level: "critical" | "warning") {
  if (level === "critical") return "border-brand-burn text-brand-burn";
  return "border-brand-orange text-brand-orange";
}

export function SourceQualitySection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<SourceQualityPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/internal/source-quality");
        const body = (await response.json()) as Partial<SourceQualityPayload> & { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? "Failed to load source quality");
        }
        if (!cancelled) {
          setPayload({
            computed_at: String(body.computed_at ?? ""),
            completeness_fields: Array.isArray(body.completeness_fields) ? body.completeness_fields : [],
            critical_fields: Array.isArray(body.critical_fields) ? body.critical_fields : [],
            sources: Array.isArray(body.sources) ? (body.sources as SourceQualityRow[]) : [],
          });
        }
      } catch (fetchError) {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : "Failed to load source quality");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => payload?.sources ?? [], [payload]);
  const fields = useMemo(() => payload?.completeness_fields ?? [], [payload]);
  const criticalFields = useMemo(() => payload?.critical_fields ?? [], [payload]);
  const rankedRows = useMemo(() => [...rows].sort((a, b) => b.source_health_score - a.source_health_score), [rows]);

  if (loading) {
    return (
      <section className="space-y-4">
        <article className="rounded border border-brand-dark bg-card-bg p-4">
          <h2 className="text-lg font-semibold">Inventory by Source — Detail View</h2>
          <div className="mt-3 h-44 animate-pulse rounded bg-[#111111]" />
        </article>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <h2 className="text-lg font-semibold">Inventory by Source — Detail View</h2>
        <p className="mt-2 text-sm text-red-400">{error}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <article className="rounded border border-brand-dark bg-card-bg p-4">
        <h2 className="text-lg font-semibold">Inventory by Source — Detail View</h2>
        <p className="mt-1 text-xs text-brand-muted">
          Live source-level inventory and completeness health. Updated: {payload?.computed_at ? new Date(payload.computed_at).toLocaleString() : "n/a"}
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {rankedRows.map((row) => {
            const canOpenListings = row.active_listings > 0;
            const cardClass = canOpenListings
              ? "block rounded border border-brand-dark p-2 text-xs transition hover:bg-[#1d1d1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
              : "rounded border border-brand-dark p-2 text-xs opacity-70";
            const content = (
              <>
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{sourceLabel(row.source)}</p>
                  <p className={`text-sm font-bold ${healthClass(row.source_health_score)}`}>{row.source_health_score.toFixed(1)}</p>
                </div>
                <p className="mt-1 text-brand-muted">Health score</p>
                <div className="mt-1 space-y-0.5 text-brand-muted">
                  <p>Active: {row.active_listings.toLocaleString()}</p>
                  <p>Critical avg: {fmtPct(row.avg_critical_completeness_pct)}</p>
                  <p>Full avg: {fmtPct(row.avg_full_completeness_pct)}</p>
                  <p>Seen 72h: {fmtPct(row.freshness.seen_last_72h_pct)}</p>
                </div>
                {row.alerts.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {row.alerts.slice(0, 2).map((alert, index) => (
                      <span key={`${row.source}-alert-${index}`} className={`rounded border px-1.5 py-0.5 text-[10px] ${alertBadgeClass(alert.level)}`}>
                        {alert.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[10px] text-emerald-500">No active alerts</p>
                )}
                {!canOpenListings ? <p className="mt-1 text-[10px] text-brand-muted">No active listings to open.</p> : null}
              </>
            );
            if (!canOpenListings) return <div key={`${row.source}-health`} className={cardClass}>{content}</div>;
            return (
              <Link
                key={`${row.source}-health`}
                href={`/listings?source=${encodeURIComponent(row.source)}`}
                aria-label={`View ${sourceLabel(row.source)} listings`}
                className={cardClass}
              >
                {content}
              </Link>
            );
          })}
        </div>
        <div className="mt-3 overflow-auto rounded border border-brand-dark">
          <table className="min-w-[1650px] text-sm">
            <thead className="sticky top-0 bg-[#111111] text-left text-xs uppercase tracking-wide text-brand-muted">
              <tr>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Active Listings</th>
                <th className="px-3 py-2">Health Score</th>
                <th className="px-3 py-2">Critical 100%</th>
                <th className="px-3 py-2">Avg Critical</th>
                <th className="px-3 py-2">Avg Full</th>
                <th className="px-3 py-2">% with Price</th>
                <th className="px-3 py-2">% with N-Number</th>
                <th className="px-3 py-2">% with Total Time</th>
                <th className="px-3 py-2">% with SMOH</th>
                <th className="px-3 py-2">% with Engine Model</th>
                <th className="px-3 py-2">% with Location</th>
                <th className="px-3 py-2">Max Completeness %</th>
                <th className="px-3 py-2">7d Added Δ</th>
                <th className="px-3 py-2">7d Full Δ</th>
                <th className="px-3 py-2">7d Score Δ</th>
                <th className="px-3 py-2">Avg Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.source} className="border-t border-brand-dark hover:bg-[#1d1d1d]">
                  <td className="px-3 py-2 font-semibold">
                    {sourceLabel(row.source)}
                    {row.source === "unknown" && row.unknown_domains.length > 0 ? (
                      <details className="mt-1 rounded border border-brand-dark p-2 text-xs font-normal">
                        <summary className="cursor-pointer text-brand-orange">Top source_url domains</summary>
                        <ul className="mt-1 space-y-1 text-brand-muted">
                          {row.unknown_domains.map((domain) => (
                            <li key={domain.domain}>
                              {domain.domain} ({domain.count.toLocaleString()})
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    {row.alerts.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {row.alerts.map((alert, index) => (
                          <span key={`${row.source}-table-alert-${index}`} title={alert.detail} className={`rounded border px-1.5 py-0.5 text-[10px] ${alertBadgeClass(alert.level)}`}>
                            {alert.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{row.active_listings.toLocaleString()}</td>
                  <td className={`px-3 py-2 font-semibold ${healthClass(row.source_health_score)}`}>{row.source_health_score.toFixed(1)}</td>
                  <td className="px-3 py-2">{fmtPct(row.critical_completeness_pct)}</td>
                  <td className="px-3 py-2">{fmtPct(row.avg_critical_completeness_pct)}</td>
                  <td className="px-3 py-2">{fmtPct(row.avg_full_completeness_pct)}</td>
                  <td className="px-3 py-2">{fmtPct(row.pct_with_price)}</td>
                  <td className="px-3 py-2">{fmtPct(row.pct_with_n_number)}</td>
                  <td className="px-3 py-2">{fmtPct(row.pct_with_total_time)}</td>
                  <td className="px-3 py-2">{fmtPct(row.pct_with_smoh)}</td>
                  <td className="px-3 py-2">{fmtPct(row.pct_with_engine_model)}</td>
                  <td className="px-3 py-2">{fmtPct(row.pct_with_location)}</td>
                  <td className="px-3 py-2 text-brand-orange">{fmtPct(row.max_completeness_pct)}</td>
                  <td className={`px-3 py-2 ${deltaClass(row.trend.added_delta_pct)}`}>{fmtDelta(row.trend.added_delta_pct, "%")}</td>
                  <td className={`px-3 py-2 ${deltaClass(row.trend.full_completeness_delta_pct)}`}>{fmtDelta(row.trend.full_completeness_delta_pct, " pts")}</td>
                  <td className={`px-3 py-2 ${deltaClass(row.trend.avg_score_delta)}`}>{fmtDelta(row.trend.avg_score_delta)}</td>
                  <td className="px-3 py-2">{row.avg_score === null ? "n/a" : row.avg_score.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="rounded border border-brand-dark bg-card-bg p-4">
        <h3 className="text-base font-semibold">Completeness Tier Distribution by Source</h3>
        <p className="mt-1 text-xs text-brand-muted">
          Stacked tiers: green 90-100%, amber 70-89%, red &lt; 70%. Freshness and weekly deltas included for quick scraper health triage.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((row) => {
            const canOpenListings = row.active_listings > 0;
            const cardClass = canOpenListings
              ? "block rounded border border-brand-dark p-3 text-xs transition hover:bg-[#1d1d1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
              : "rounded border border-brand-dark p-3 text-xs opacity-70";
            const content = (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold text-brand-muted">{sourceLabel(row.source)}</div>
                  <div className="text-brand-muted">{row.active_listings.toLocaleString()} listings</div>
                </div>
                <div className="mx-auto flex h-32 w-8 flex-col-reverse overflow-hidden rounded bg-[#111111]">
                  <div className="bg-brand-burn" style={{ height: `${row.tiers.pct_under_70}%` }} title={`<70: ${fmtPct(row.tiers.pct_under_70)}`} />
                  <div className="bg-brand-orange" style={{ height: `${row.tiers.pct_70_89}%` }} title={`70-89: ${fmtPct(row.tiers.pct_70_89)}`} />
                  <div className="bg-emerald-600" style={{ height: `${row.tiers.pct_90_100}%` }} title={`90-100: ${fmtPct(row.tiers.pct_90_100)}`} />
                </div>
                <div className="mt-2 space-y-0.5 text-brand-muted">
                  <p>90-100: {fmtPct(row.tiers.pct_90_100)}</p>
                  <p>70-89: {fmtPct(row.tiers.pct_70_89)}</p>
                  <p>&lt;70: {fmtPct(row.tiers.pct_under_70)}</p>
                  <p>Seen 72h: {fmtPct(row.freshness.seen_last_72h_pct)}</p>
                </div>
                {!canOpenListings ? <p className="mt-1 text-[10px] text-brand-muted">No active listings to open.</p> : null}
              </>
            );
            if (!canOpenListings) return <div key={`${row.source}-tiers`} className={cardClass}>{content}</div>;
            return (
              <Link
                key={`${row.source}-tiers`}
                href={`/listings?source=${encodeURIComponent(row.source)}`}
                aria-label={`View ${sourceLabel(row.source)} listings`}
                className={cardClass}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </article>

      <article className="rounded border border-brand-dark bg-card-bg p-4">
        <h3 className="text-base font-semibold">Field Coverage by Source</h3>
        <p className="mt-1 text-xs text-brand-muted">
          Per-field fill percentage aligned to the 15-field completeness definition (active listings). Critical fields: {criticalFields.join(", ")}.
        </p>
        <div className="mt-3 overflow-auto rounded border border-brand-dark">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-[#111111] uppercase tracking-wide text-brand-muted">
              <tr>
                <th className="px-2 py-2 text-left">Field</th>
                {rows.map((row) => (
                  <th key={row.source} className="px-2 py-2 text-left">
                    {sourceLabel(row.source)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={`field-row-${field}`} className="border-t border-brand-dark">
                  <td className="px-2 py-2 font-semibold">{field}</td>
                  {rows.map((row) => {
                    const pct = row.field_coverage[field] ?? 0;
                    return (
                      <td key={`${row.source}-${field}`} className="px-2 py-2">
                        <div className={`rounded px-1.5 py-1 text-center text-[11px] ${heatmapCellClass(pct)}`}>{fmtPct(pct)}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-brand-muted">
          <span className="rounded border border-brand-dark px-2 py-1">Green &gt; 85%</span>
          <span className="rounded border border-brand-dark px-2 py-1">Yellow 60-85%</span>
          <span className="rounded border border-brand-dark px-2 py-1">Red &lt; 60%</span>
        </div>
      </article>
    </section>
  );
}
