"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type SourceQualityRow = {
  source: string;
  active_listings: number;
  pct_with_price: number;
  pct_with_n_number: number;
  pct_with_registration_any: number;
  pct_with_us_n_number: number;
  pct_with_non_us_registration: number;
  pct_unclassified_registration: number;
  pct_us_expected: number;
  pct_with_us_n_number_when_us_expected: number;
  pct_with_non_us_registration_when_non_us_expected: number;
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

const SOURCE_QUALITY_CACHE_KEY = "internal_source_quality_cache_v1";

type SortDirection = "asc" | "desc";
type SortKey =
  | "source"
  | "active_listings"
  | "source_health_score"
  | "critical_completeness_pct"
  | "avg_critical_completeness_pct"
  | "avg_full_completeness_pct"
  | "pct_with_price"
  | "pct_with_n_number"
  | "pct_with_registration_any"
  | "pct_with_us_n_number"
  | "pct_with_non_us_registration"
  | "pct_unclassified_registration"
  | "pct_us_expected"
  | "pct_with_us_n_number_when_us_expected"
  | "pct_with_non_us_registration_when_non_us_expected"
  | "pct_with_total_time"
  | "pct_with_smoh"
  | "pct_with_engine_model"
  | "pct_with_location"
  | "max_completeness_pct"
  | "trend_added_delta_pct"
  | "trend_full_completeness_delta_pct"
  | "trend_avg_score_delta"
  | "avg_score";

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

function sanitizeErrorMessage(value: string): string {
  const normalized = value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "Source quality is temporarily unavailable.";
  const lower = normalized.toLowerCase();
  if (
    lower.includes("doctype html") ||
    lower.includes("cloudflare") ||
    lower.includes("connection timed out") ||
    lower.includes("error 522")
  ) {
    return "Source quality is temporarily unavailable due to an upstream timeout. Please retry in a moment.";
  }
  return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized;
}

export function SourceQualitySection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [payload, setPayload] = useState<SourceQualityPayload | null>(null);
  const hasCachedPayloadRef = useRef(false);
  const [sortKey, setSortKey] = useState<SortKey>("source_health_score");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    let cancelled = false;
    const cachedRaw =
      typeof window !== "undefined" ? window.sessionStorage.getItem(SOURCE_QUALITY_CACHE_KEY) : null;
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as SourceQualityPayload;
        if (cached && Array.isArray(cached.sources)) {
          setPayload(cached);
          hasCachedPayloadRef.current = true;
          setLoading(false);
        }
      } catch {
        // Ignore malformed cache and fetch fresh data.
      }
    }

    async function load() {
      setLoading(true);
      setError("");
      setWarning("");
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch("/api/internal/source-quality", { signal: controller.signal });
        const contentType = response.headers.get("content-type") || "";
        const rawText = await response.text();
        let body: (Partial<SourceQualityPayload> & { error?: string }) | null = null;
        if (contentType.includes("application/json")) {
          body = JSON.parse(rawText) as Partial<SourceQualityPayload> & { error?: string };
        }
        if (!response.ok) {
          const cleanMessage = sanitizeErrorMessage(body?.error || rawText || "Failed to load source quality");
          throw new Error(cleanMessage || "Failed to load source quality");
        }
        if (!body) {
          throw new Error("Source quality returned an unexpected response format.");
        }
        if (!cancelled) {
          const nextPayload = {
            computed_at: String(body.computed_at ?? ""),
            completeness_fields: Array.isArray(body.completeness_fields) ? body.completeness_fields : [],
            critical_fields: Array.isArray(body.critical_fields) ? body.critical_fields : [],
            sources: Array.isArray(body.sources) ? (body.sources as SourceQualityRow[]) : [],
          };
          setPayload(nextPayload);
          hasCachedPayloadRef.current = true;
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(SOURCE_QUALITY_CACHE_KEY, JSON.stringify(nextPayload));
          }
        }
      } catch (fetchError) {
        if (!cancelled) {
          const message =
            fetchError instanceof DOMException && fetchError.name === "AbortError"
              ? "Source quality request timed out. Showing last available data."
              : sanitizeErrorMessage(
                  fetchError instanceof Error ? fetchError.message : "Failed to load source quality"
                );
          if (hasCachedPayloadRef.current) setWarning(message);
          else setError(message);
        }
      } finally {
        window.clearTimeout(timeoutId);
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
  const sortedRows = useMemo(() => {
    const numericValue = (row: SourceQualityRow): number => {
      switch (sortKey) {
        case "active_listings":
          return row.active_listings;
        case "source_health_score":
          return row.source_health_score;
        case "critical_completeness_pct":
          return row.critical_completeness_pct;
        case "avg_critical_completeness_pct":
          return row.avg_critical_completeness_pct;
        case "avg_full_completeness_pct":
          return row.avg_full_completeness_pct;
        case "pct_with_price":
          return row.pct_with_price;
        case "pct_with_n_number":
          return row.pct_with_n_number;
        case "pct_with_registration_any":
          return row.pct_with_registration_any;
        case "pct_with_us_n_number":
          return row.pct_with_us_n_number;
        case "pct_with_non_us_registration":
          return row.pct_with_non_us_registration;
        case "pct_unclassified_registration":
          return row.pct_unclassified_registration;
        case "pct_us_expected":
          return row.pct_us_expected;
        case "pct_with_us_n_number_when_us_expected":
          return row.pct_with_us_n_number_when_us_expected;
        case "pct_with_non_us_registration_when_non_us_expected":
          return row.pct_with_non_us_registration_when_non_us_expected;
        case "pct_with_total_time":
          return row.pct_with_total_time;
        case "pct_with_smoh":
          return row.pct_with_smoh;
        case "pct_with_engine_model":
          return row.pct_with_engine_model;
        case "pct_with_location":
          return row.pct_with_location;
        case "max_completeness_pct":
          return row.max_completeness_pct;
        case "trend_added_delta_pct":
          return row.trend.added_delta_pct ?? Number.NEGATIVE_INFINITY;
        case "trend_full_completeness_delta_pct":
          return row.trend.full_completeness_delta_pct ?? Number.NEGATIVE_INFINITY;
        case "trend_avg_score_delta":
          return row.trend.avg_score_delta ?? Number.NEGATIVE_INFINITY;
        case "avg_score":
          return row.avg_score ?? Number.NEGATIVE_INFINITY;
        default:
          return 0;
      }
    };

    return [...rows].sort((a, b) => {
      if (sortKey === "source") {
        const cmp = a.source.localeCompare(b.source);
        return sortDirection === "asc" ? cmp : -cmp;
      }
      const cmp = numericValue(a) - numericValue(b);
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [rows, sortDirection, sortKey]);

  const toggleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "source" ? "asc" : "desc");
  };

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return "↕";
    return sortDirection === "asc" ? "↑" : "↓";
  };

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
        {warning ? (
          <p className="mt-2 rounded border border-brand-dark bg-[#161616] px-2 py-1 text-xs text-brand-orange">
            {warning}
          </p>
        ) : null}
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
          <table className="min-w-[2250px] text-sm">
            <thead className="sticky top-0 bg-[#111111] text-left text-xs uppercase tracking-wide text-brand-muted">
              <tr>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("source")}>
                    Source <span aria-hidden>{sortArrow("source")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("active_listings")}>
                    Active Listings <span aria-hidden>{sortArrow("active_listings")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("source_health_score")}>
                    Health Score <span aria-hidden>{sortArrow("source_health_score")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("critical_completeness_pct")}>
                    Critical 100% <span aria-hidden>{sortArrow("critical_completeness_pct")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("avg_critical_completeness_pct")}>
                    Avg Critical <span aria-hidden>{sortArrow("avg_critical_completeness_pct")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("avg_full_completeness_pct")}>
                    Avg Full <span aria-hidden>{sortArrow("avg_full_completeness_pct")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("pct_with_price")}>
                    % with Price <span aria-hidden>{sortArrow("pct_with_price")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("pct_with_n_number")}>
                    % with N-Number <span aria-hidden>{sortArrow("pct_with_n_number")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("pct_with_registration_any")}>
                    % with Any Registration <span aria-hidden>{sortArrow("pct_with_registration_any")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("pct_with_us_n_number")}>
                    % with US Registration <span aria-hidden>{sortArrow("pct_with_us_n_number")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("pct_with_non_us_registration")}>
                    % with Non-US Registration <span aria-hidden>{sortArrow("pct_with_non_us_registration")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("pct_unclassified_registration")}>
                    % Unclassified Registration <span aria-hidden>{sortArrow("pct_unclassified_registration")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("pct_us_expected")}>
                    % US-Expected Inventory <span aria-hidden>{sortArrow("pct_us_expected")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("pct_with_us_n_number_when_us_expected")}>
                    % US Reg (US-Expected) <span aria-hidden>{sortArrow("pct_with_us_n_number_when_us_expected")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("pct_with_non_us_registration_when_non_us_expected")}>
                    % Non-US Reg (Non-US-Expected) <span aria-hidden>{sortArrow("pct_with_non_us_registration_when_non_us_expected")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("pct_with_total_time")}>
                    % with Total Time <span aria-hidden>{sortArrow("pct_with_total_time")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("pct_with_smoh")}>
                    % with SMOH <span aria-hidden>{sortArrow("pct_with_smoh")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("pct_with_engine_model")}>
                    % with Engine Model <span aria-hidden>{sortArrow("pct_with_engine_model")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("pct_with_location")}>
                    % with Location <span aria-hidden>{sortArrow("pct_with_location")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("max_completeness_pct")}>
                    Max Completeness % <span aria-hidden>{sortArrow("max_completeness_pct")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("trend_added_delta_pct")}>
                    7d Added Δ <span aria-hidden>{sortArrow("trend_added_delta_pct")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("trend_full_completeness_delta_pct")}>
                    7d Full Δ <span aria-hidden>{sortArrow("trend_full_completeness_delta_pct")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("trend_avg_score_delta")}>
                    7d Score Δ <span aria-hidden>{sortArrow("trend_avg_score_delta")}</span>
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-brand-white" onClick={() => toggleSort("avg_score")}>
                    Avg Score <span aria-hidden>{sortArrow("avg_score")}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
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
                  <td className="px-3 py-2">{fmtPct(row.pct_with_registration_any)}</td>
                  <td className="px-3 py-2">{fmtPct(row.pct_with_us_n_number)}</td>
                  <td className="px-3 py-2">{fmtPct(row.pct_with_non_us_registration)}</td>
                  <td className="px-3 py-2">{fmtPct(row.pct_unclassified_registration)}</td>
                  <td className="px-3 py-2">{fmtPct(row.pct_us_expected)}</td>
                  <td className="px-3 py-2">{fmtPct(row.pct_with_us_n_number_when_us_expected)}</td>
                  <td className="px-3 py-2">{fmtPct(row.pct_with_non_us_registration_when_non_us_expected)}</td>
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
