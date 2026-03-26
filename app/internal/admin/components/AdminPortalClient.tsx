"use client";

import Link from "next/link";
import { useState } from "react";
import { SourceQualitySection } from "./SourceQualitySection";
import { KpiCard } from "./KpiCard";

type SourceFreshnessRow = {
  source: string;
  active_listings: number;
  seen_last_24h_pct: number;
  seen_last_72h_pct: number;
  new_last_24h: number;
  new_last_7d: number;
  last_seen_at: string | null;
};

type FieldStat = { field: string; category: string; fill_pct: number };

type ScoreDistribution = {
  tier_85_plus: number;
  tier_70_84: number;
  tier_50_69: number;
  tier_25_49: number;
  tier_under_25: number;
  no_score: number;
};

type FlipTierDistribution = {
  HOT: number;
  GOOD: number;
  FAIR: number;
  PASS: number;
  NO_FLIP: number;
};

type SourceStatRow = {
  source: string;
  listing_count: number;
  overall_fill_pct: number;
  field_breakdown: Record<string, number>;
};

type AdminPortalClientProps = {
  failedPanels: string[];
  platform: {
    listings: {
      total_active: number;
      added_last_7_days: number;
      score_coverage_pct: number;
      by_source: Record<string, number>;
      source_freshness: SourceFreshnessRow[];
      faa_matched_count?: number;
      faa_match_pct?: number;
      n_number_filled?: number;
      n_number_pct?: number;
      no_price_listings?: number;
      engine_value_scored?: number;
      engine_value_coverage_pct?: number;
      distinct_sources?: number;
      score_distribution?: ScoreDistribution;
      flip_tier_distribution?: FlipTierDistribution;
      flip_missing_with_disclosed_price?: number;
      deal_tier_without_disclosed_price?: number;
      exceptional_deal_without_disclosed_price?: number;
    };
    deals: { high_score_listings: number; price_reductions_last_7d: number; exceptional_deals?: number };
    market_intelligence: { ownership_changes_detected_30d: number; faa_records_loaded: number };
  };
  dataQuality: {
    overall_completeness_pct: number;
    completeness_distribution: Record<string, number>;
    field_stats: FieldStat[];
    source_stats?: SourceStatRow[];
  };
  buyer: {
    deal_patterns: {
      aging_high_value: Array<{ listing_id: string; year: number; make: string; model: string; price: number }>;
      price_drops: Array<{ listing_id: string; year: number; make: string; model: string; reduction_pct: number }>;
    };
    admin_inventory_highlights?: Array<{
      listing_id: string;
      year: number;
      make: string;
      model: string;
      asking_price: number | null;
      flip_score: number;
      flip_tier: string;
    }>;
  };
  audience: {
    admin_users_active: number;
    beta_sessions_total: number;
    deal_desk_saved_scenarios: number;
    recent_beta_activity: Array<{
      session_id: string;
      invite_label: string;
      email_hint: string;
      last_seen_at: string;
      created_at: string;
    }>;
  };
  invites: {
    invites: Array<Record<string, unknown>>;
    stats: { currently_active_sessions: number };
  };
  avionics: {
    catalog: {
      units_active: number;
      aliases_total: number;
      market_values_total: number;
      price_observations_total: number;
    };
    listings_scanned: number;
    listings_with_avionics_text: number;
    listings_with_observations: number;
    listings_with_observations_in_avionics_text: number;
    observation_rows_total: number;
    matched_rows: number;
    unresolved_rows: number;
    matched_rate_pct: number;
    unresolved_rate_pct: number;
    extraction_coverage_pct: number;
    avg_match_confidence: number;
    leading_parser_version: string;
    parser_version_breakdown: Record<string, number>;
    top_unresolved_tokens: Array<{ token: string; count: number }>;
    segment_rollout?: Array<{
      id: string;
      label: string;
      listings_with_avionics_text: number;
      extraction_coverage_pct: number;
    }>;
    priced_observations_split?: {
      bas_part_sales: number;
      global_aircraft: number;
      other: number;
      priced_active_total: number;
    };
  };
  engineIntel: {
    total_active: number;
    smoh_listings: number;
    smoh_coverage_pct: number;
    engine_value_scored: number;
    engine_value_coverage_pct: number;
    pricing_gap_listings: number;
    tbo_reference_rows: number;
    manufacturer_bars: Array<{
      id: string;
      label: string;
      listings: number;
      value_scored: number;
      coverage_pct: number;
    }>;
    top_pricing_gaps: Array<{ engine_model: string; count: number }>;
    life_remaining_distribution: {
      high_remaining: number;
      mid_remaining: number;
      low_remaining: number;
      past_tbo: number;
      unknown: number;
    };
  };
  sourceCounts: Array<[string, number]>;
  freshnessBySource: SourceFreshnessRow[];
  /** Approximate share of active rows with flip_score ≥ 75 (high-opportunity lane). */
  avgHighFlipInventoryPct: number;
};

function statValue(value: number | string) {
  if (typeof value === "number") return value.toLocaleString();
  return value;
}

function heatmapPillClass(pct: number): string {
  if (pct >= 85) return "bg-emerald-600 text-white [data-theme=light]:bg-emerald-600 [data-theme=light]:text-white";
  if (pct >= 60) return "bg-amber-500 text-zinc-950 [data-theme=light]:bg-amber-400 [data-theme=light]:text-zinc-950";
  if (pct >= 40) return "bg-orange-600 text-white [data-theme=light]:bg-orange-500";
  return "bg-rose-700 text-white [data-theme=light]:bg-rose-600";
}

function avionicsFieldBlend(b: Record<string, number>): number {
  const keys = ["has_ads_b", "has_waas", "has_autopilot", "has_glass_panel", "avionics_notes"];
  const sum = keys.reduce((acc, k) => acc + (b[k] ?? 0), 0);
  return keys.length > 0 ? Number((sum / keys.length).toFixed(1)) : 0;
}

function locationFieldBlend(b: Record<string, number>): number {
  return Number((((b.city ?? 0) + (b.state ?? 0)) / 2).toFixed(1));
}

function imagesFieldBlend(b: Record<string, number>): number {
  return Math.round(Math.max(b.primary_image_url ?? 0, b.image_urls ?? 0));
}

const HEATMAP_COLUMNS: Array<{ label: string; pick: (b: Record<string, number>) => number }> = [
  { label: "Price", pick: (b) => b.price ?? 0 },
  { label: "TTAF", pick: (b) => b.total_time ?? 0 },
  { label: "SMOH", pick: (b) => b.smoh ?? 0 },
  { label: "Eng. model", pick: (b) => b.engine_model ?? 0 },
  { label: "N#", pick: (b) => b.n_number ?? 0 },
  { label: "Location", pick: (b) => locationFieldBlend(b) },
  { label: "Images", pick: (b) => imagesFieldBlend(b) },
  { label: "Avionics", pick: (b) => avionicsFieldBlend(b) },
  { label: "FAA", pick: (b) => b.faa_matched ?? 0 },
];

function sourceGroupTotal(bySource: Record<string, number>, keys: string[]): number {
  return keys.reduce((sum, k) => sum + (bySource[k] ?? 0), 0);
}

/** Avionics segment rollout bar color (Phase 4E). */
function segmentRolloutBarClass(pct: number): string {
  if (pct >= 90) return "bg-emerald-500";
  if (pct >= 60) return "bg-amber-500";
  return "bg-rose-600";
}

const DEMO_VISITORS_14D = [412, 438, 455, 520, 498, 540, 698, 732, 685, 612, 640, 672, 718, 791];
const DEMO_TOP_PAGES = [
  { path: "/listings", views: 18420, color: "var(--fh-orange)" },
  { path: "/listings/[id]", views: 12650, color: "var(--fh-blue, #38bdf8)" },
  { path: "/", views: 9820, color: "var(--fh-green, #22c55e)" },
  { path: "/beta/join", views: 3210, color: "var(--fh-purple, #a78bfa)" },
];

const LISTINGS_SOURCE_GROUPS: Array<{
  label: string;
  keys: string[];
  accent: "default" | "warn";
  hint?: string;
}> = [
  { label: "Controller", keys: ["controller"], accent: "default" },
  { label: "Trade-A-Plane", keys: ["tradaplane"], accent: "default" },
  { label: "ASO", keys: ["aso"], accent: "default" },
  { label: "Barnstormers", keys: ["barnstormers"], accent: "default" },
  { label: "AvBuyer", keys: ["avbuyer"], accent: "default" },
  {
    label: "Secondary lanes",
    keys: ["aerotrader", "afs", "globalair"],
    accent: "warn",
    hint: "AeroTrader + AFS + GlobalAir",
  },
];

type TabId = "overview" | "listings" | "avionics" | "engine" | "scoring" | "users";

const TABS: Array<{ id: TabId; label: string; engineBadge?: string }> = [
  { id: "overview", label: "📊 Overview" },
  { id: "listings", label: "✈ Listings & Sources" },
  { id: "avionics", label: "📡 Avionics Intelligence" },
  { id: "engine", label: "⚙ Engine Intelligence", engineBadge: "v1.9.3" },
  { id: "scoring", label: "🎯 Scoring" },
  { id: "users", label: "👥 Users & Beta" },
];

export default function AdminPortalClient(props: AdminPortalClientProps) {
  const [tab, setTab] = useState<TabId>("overview");
  const inviteRows = props.invites.invites as Array<Record<string, unknown>>;
  const avionicsParser =
    props.avionics.leading_parser_version && props.avionics.leading_parser_version !== "n/a"
      ? props.avionics.leading_parser_version.startsWith("v")
        ? props.avionics.leading_parser_version
        : `v${props.avionics.leading_parser_version}`
      : "v2.1.3";

  return (
    <div className="space-y-0">
      <header className="rounded border border-brand-dark bg-card-bg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Admin Portal</h1>
            <p className="text-sm text-brand-muted">
              Operational command center for platform health, data quality, and buyer intelligence.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/internal/market-intel"
              className="rounded border border-brand-dark px-3 py-2 text-sm text-brand-muted hover:border-brand-orange hover:text-brand-orange"
            >
              📈 Market Intel
            </Link>
            <Link
              href="/internal/deal-desk"
              className="fh-cta-on-orange-fill rounded bg-brand-orange px-3 py-2 text-sm font-semibold whitespace-nowrap hover:bg-brand-burn"
            >
              🧮 Open Deal Desk
            </Link>
          </div>
        </div>
        {props.failedPanels.length > 0 ? (
          <p className="mt-3 rounded border border-brand-dark bg-[#161616] px-3 py-2 text-xs text-brand-orange">
            Live data is temporarily unavailable for: {props.failedPanels.join(", ")}. Displaying fallback values.
          </p>
        ) : null}
      </header>

      <nav
        className="sticky z-[99] mt-4 flex flex-wrap gap-0 border-b-2 border-[var(--fh-border)] bg-[var(--fh-bg2)] px-2 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white"
        style={{ top: "52px" }}
        aria-label="Admin sections"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative mb-[-2px] flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-semibold transition-colors sm:text-sm ${
                active
                  ? "border-[var(--fh-orange)] text-[var(--fh-orange)]"
                  : "border-transparent text-[var(--fh-text-muted)] hover:text-[var(--fh-text-dim)]"
              }`}
            >
              <span>{t.label}</span>
              {t.id === "avionics" ? (
                <span
                  className="rounded bg-[var(--fh-orange-dim)] px-1 py-0.5 text-[9px] font-bold text-[var(--fh-orange)]"
                  style={{ fontFamily: "var(--font-dm-mono), monospace" }}
                >
                  {avionicsParser}
                </span>
              ) : null}
              {t.id === "engine" ? (
                <span
                  className="rounded bg-[var(--fh-orange-dim)] px-1 py-0.5 text-[9px] font-bold text-[var(--fh-orange)]"
                  style={{ fontFamily: "var(--font-dm-mono), monospace" }}
                >
                  {t.engineBadge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div
        key={tab}
        className="admin-tab-panel mt-4 space-y-4 pb-8"
        style={{
          animation: "adminTabFade 0.2s ease forwards",
        }}
      >
        <style>{`
          @keyframes adminTabFade {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {tab === "overview" ? (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="Total active listings" value={props.platform.listings.total_active} accent="default" />
              <KpiCard
                label="Distinct sources"
                value={props.platform.listings.distinct_sources ?? 0}
                hint="Normalized scraper lanes"
                accent="default"
              />
              <KpiCard
                label="FAA registry match"
                value={`${props.platform.listings.faa_match_pct ?? 0}%`}
                hint={`${(props.platform.listings.faa_matched_count ?? 0).toLocaleString()} rows`}
                accent="success"
              />
              <KpiCard
                label="N-number coverage"
                value={`${props.platform.listings.n_number_pct ?? 0}%`}
                hint={`${(props.platform.listings.n_number_filled ?? 0).toLocaleString()} tails`}
                accent="success"
              />
              <KpiCard
                label="No / undisclosed price"
                value={props.platform.listings.no_price_listings ?? 0}
                hint="Null or non-positive ask"
                accent="warn"
              />
              <KpiCard
                label="HOT flip tier"
                value={props.platform.deals.exceptional_deals ?? 0}
                hint="flip_tier = HOT with disclosed ask"
                accent="success"
              />
              <KpiCard
                label="Engine value scored"
                value={`${props.platform.listings.engine_value_coverage_pct ?? 0}%`}
                hint={`${(props.platform.listings.engine_value_scored ?? 0).toLocaleString()} rows`}
                accent="default"
              />
              <KpiCard
                label="Flip score coverage"
                value={`${props.platform.listings.score_coverage_pct}%`}
                hint={`Flip ≥75: ${props.platform.deals.high_score_listings.toLocaleString()} · ~${props.avgHighFlipInventoryPct}% of active`}
                accent="default"
              />
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                <h2 className="text-lg font-semibold">Flip score distribution</h2>
                <p className="mt-1 text-xs text-[var(--fh-text-muted)]">Active inventory buckets (flip_score 0–100)</p>
                <div className="mt-4 space-y-2">
                  {(() => {
                    const sd = props.platform.listings.score_distribution ?? {
                      tier_85_plus: 0,
                      tier_70_84: 0,
                      tier_50_69: 0,
                      tier_25_49: 0,
                      tier_under_25: 0,
                      no_score: 0,
                    };
                    const rows = [
                      { label: "Tier A (85+)", count: sd.tier_85_plus, color: "rgb(34 197 94)" },
                      { label: "Tier B (70–84)", count: sd.tier_70_84, color: "rgb(234 179 8)" },
                      { label: "Tier C (50–69)", count: sd.tier_50_69, color: "rgb(249 115 22)" },
                      { label: "Tier D (25–49)", count: sd.tier_25_49, color: "rgb(248 113 113)" },
                      { label: "Critical (under 25)", count: sd.tier_under_25, color: "rgb(190 18 60)" },
                      { label: "No score", count: sd.no_score, color: "rgb(148 163 184)" },
                    ];
                    const max = Math.max(...rows.map((r) => r.count), 1);
                    return rows.map((row) => (
                      <div key={row.label}>
                        <div className="flex justify-between text-xs text-[var(--fh-text-muted)]">
                          <span>{row.label}</span>
                          <span className="tabular-nums text-[var(--fh-text)]">{row.count.toLocaleString()}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/15 [data-theme=light]:bg-slate-200">
                          <div
                            className="h-2 rounded-full transition-[width] duration-500 ease-out"
                            style={{ width: `${(row.count / max) * 100}%`, backgroundColor: row.color }}
                          />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </section>

              <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                <h2 className="text-lg font-semibold">Activity pulse</h2>
                <p className="mt-1 text-xs text-[var(--fh-text-muted)]">Derived from the latest admin snapshot</p>
                <ul className="mt-4 space-y-3 text-sm">
                  <li className="flex gap-3 border-b border-[var(--fh-border)] pb-3 [data-theme=light]:border-slate-200">
                    <span className="shrink-0 text-xs font-mono text-[var(--fh-text-dim)]">now</span>
                    <div>
                      <p className="font-semibold text-[var(--fh-text)]">Inventory</p>
                      <p className="text-[var(--fh-text-muted)]">
                        {props.platform.listings.total_active.toLocaleString()} active listings indexed across{" "}
                        {(props.platform.listings.distinct_sources ?? 0).toLocaleString()} sources.
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3 border-b border-[var(--fh-border)] pb-3 [data-theme=light]:border-slate-200">
                    <span className="shrink-0 text-xs font-mono text-[var(--fh-text-dim)]">now</span>
                    <div>
                      <p className="font-semibold text-[var(--fh-text)]">Pricing visibility</p>
                      <p className="text-[var(--fh-text-muted)]">
                        {(props.platform.listings.no_price_listings ?? 0).toLocaleString()} rows lack a positive ask price
                        (call-for-price / undisclosed).
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3 border-b border-[var(--fh-border)] pb-3 [data-theme=light]:border-slate-200">
                    <span className="shrink-0 text-xs font-mono text-[var(--fh-text-dim)]">now</span>
                    <div>
                      <p className="font-semibold text-[var(--fh-text)]">Registry linkage</p>
                      <p className="text-[var(--fh-text-muted)]">
                        FAA match {(props.platform.listings.faa_match_pct ?? 0).toFixed(1)}% · N-number fill{" "}
                        {(props.platform.listings.n_number_pct ?? 0).toFixed(1)}% · FAA reference rows{" "}
                        {props.platform.market_intelligence.faa_records_loaded.toLocaleString()}.
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 text-xs font-mono text-[var(--fh-text-dim)]">7d</span>
                    <div>
                      <p className="font-semibold text-[var(--fh-text)]">Market motion</p>
                      <p className="text-[var(--fh-text-muted)]">
                        {props.platform.listings.added_last_7_days.toLocaleString()} new listings (7d) ·{" "}
                        {props.platform.deals.price_reductions_last_7d.toLocaleString()} price reductions flagged ·{" "}
                        {props.platform.market_intelligence.ownership_changes_detected_30d.toLocaleString()} ownership
                        transfers (30d).
                      </p>
                    </div>
                  </li>
                </ul>
              </section>
            </div>

            <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Data quality summary</h2>
                <Link href="/internal/admin/data-quality" className="text-sm text-[var(--fh-orange)] hover:opacity-90">
                  View full breakdown
                </Link>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {props.dataQuality.field_stats.slice(0, 9).map((field) => (
                  <div
                    key={field.field}
                    className="rounded border border-[var(--fh-border)] px-3 py-2 [data-theme=light]:border-slate-200"
                  >
                    <p className="text-xs text-[var(--fh-text-muted)]">{field.category}</p>
                    <p className="text-sm font-semibold text-[var(--fh-text)]">{field.field}</p>
                    <p className="text-sm text-[var(--fh-orange)]">{field.fill_pct}%</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {tab === "listings" ? (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {LISTINGS_SOURCE_GROUPS.map((g) => {
                const n = sourceGroupTotal(props.platform.listings.by_source, g.keys);
                const pct =
                  props.platform.listings.total_active > 0
                    ? ((n / props.platform.listings.total_active) * 100).toFixed(1)
                    : "0.0";
                return (
                  <KpiCard
                    key={g.label}
                    label={g.label}
                    value={n}
                    hint={`${pct}% of active · ${g.hint ?? g.keys.join(", ")}`}
                    accent={g.accent}
                  />
                );
              })}
            </section>

            <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">Field completeness heatmap</h2>
                  <p className="text-xs text-[var(--fh-text-muted)]">Per-source fill % (admin completeness map)</p>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-[var(--fh-text-dim)]">
                  <span>
                    <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-600" />≥85%
                  </span>
                  <span>
                    <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500" />
                    60–84%
                  </span>
                  <span>
                    <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-orange-600" />
                    40–59%
                  </span>
                  <span>
                    <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-rose-700" />
                    &lt;40%
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[920px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--fh-border)] text-[var(--fh-text-muted)] [data-theme=light]:border-slate-200">
                      <th className="sticky left-0 z-[1] bg-[var(--fh-bg-elevated)] px-2 py-2 font-semibold [data-theme=light]:bg-white">
                        Source
                      </th>
                      <th className="px-2 py-2 font-semibold">Count</th>
                      {HEATMAP_COLUMNS.map((c) => (
                        <th key={c.label} className="px-1 py-2 text-center font-semibold">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(props.dataQuality.source_stats ?? []).map((src) => (
                      <tr key={src.source} className="border-t border-[var(--fh-border)] [data-theme=light]:border-slate-100">
                        <td className="sticky left-0 z-[1] bg-[var(--fh-bg-elevated)] px-2 py-2 font-semibold capitalize [data-theme=light]:bg-white">
                          {src.source}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-[var(--fh-text-muted)]">
                          {src.listing_count.toLocaleString()}
                        </td>
                        {HEATMAP_COLUMNS.map((col) => {
                          const pct = col.pick(src.field_breakdown);
                          return (
                            <td key={col.label} className="px-1 py-1 text-center">
                              <span
                                className={`inline-block min-w-[2.75rem] rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${heatmapPillClass(pct)}`}
                              >
                                {pct.toFixed(0)}%
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(props.dataQuality.source_stats ?? []).length === 0 ? (
                  <p className="py-4 text-sm text-[var(--fh-text-muted)]">No per-source stats (data quality panel unavailable).</p>
                ) : null}
              </div>
            </section>

            <section className="rounded border border-brand-dark bg-card-bg p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Source Inventory</h2>
                <p className="text-xs text-brand-muted">Total active: {props.platform.listings.total_active.toLocaleString()}</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {props.sourceCounts.map(([source, count]) => {
                  const pct =
                    props.platform.listings.total_active > 0
                      ? ((count / props.platform.listings.total_active) * 100).toFixed(1)
                      : "0.0";
                  return (
                    <div key={source} className="rounded border border-brand-dark px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-brand-muted">{source}</p>
                      <p className="mt-1 text-lg font-semibold text-brand-orange">{count.toLocaleString()}</p>
                      <p className="text-xs text-brand-muted">{pct}% of active inventory</p>
                    </div>
                  );
                })}
                {props.sourceCounts.length === 0 ? <p className="text-sm text-brand-muted">No source breakdown available.</p> : null}
              </div>
              <div className="mt-3 overflow-auto rounded border border-brand-dark">
                <table className="min-w-[780px] text-xs">
                  <thead className="bg-[#111111] uppercase tracking-wide text-brand-muted">
                    <tr>
                      <th className="px-2 py-2 text-left">Source</th>
                      <th className="px-2 py-2 text-left">Active</th>
                      <th className="px-2 py-2 text-left">Seen 24h %</th>
                      <th className="px-2 py-2 text-left">Seen 72h %</th>
                      <th className="px-2 py-2 text-left">New 24h</th>
                      <th className="px-2 py-2 text-left">New 7d</th>
                      <th className="px-2 py-2 text-left">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.freshnessBySource.map((row) => (
                      <tr key={`fresh-${row.source}`} className="border-t border-brand-dark">
                        <td className="px-2 py-2 font-semibold">{row.source}</td>
                        <td className="px-2 py-2">{row.active_listings.toLocaleString()}</td>
                        <td className="px-2 py-2">{row.seen_last_24h_pct.toFixed(1)}%</td>
                        <td className="px-2 py-2">{row.seen_last_72h_pct.toFixed(1)}%</td>
                        <td className="px-2 py-2">{row.new_last_24h.toLocaleString()}</td>
                        <td className="px-2 py-2">{row.new_last_7d.toLocaleString()}</td>
                        <td className="px-2 py-2 text-brand-muted">
                          {row.last_seen_at ? new Date(row.last_seen_at).toLocaleString() : "n/a"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <SourceQualitySection />
            </section>
          </>
        ) : null}

        {tab === "avionics" ? (
          <div className="space-y-4">
            <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Avionics intelligence</h2>
                <span className="text-xs text-[var(--fh-text-muted)]">90-day listing window · catalog live counts</span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiCard label="Catalog units" value={props.avionics.catalog.units_active} />
                <KpiCard label="Parser match rate" value={`${props.avionics.matched_rate_pct}%`} hint="Matched vs unresolved tokens" />
                <KpiCard label="Extraction coverage" value={`${props.avionics.extraction_coverage_pct}%`} accent="success" />
                <KpiCard label="Unresolved rows" value={props.avionics.unresolved_rows} accent="warn" />
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                <h3 className="text-sm font-semibold">Segment rollout (extraction in avionics text)</h3>
                <p className="mt-1 text-xs text-[var(--fh-text-muted)]">Wave 2/3 lanes · % of listings with avionics copy that emitted observations</p>
                <div className="mt-4 space-y-3">
                  {(props.avionics.segment_rollout ?? []).map((seg) => (
                    <div key={seg.id}>
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-[var(--fh-text)]">{seg.label}</span>
                        <span className="tabular-nums text-[var(--fh-text-muted)]">
                          {seg.extraction_coverage_pct}% · {seg.listings_with_avionics_text.toLocaleString()} with text
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/15 [data-theme=light]:bg-slate-200">
                        <div
                          className={`h-2 rounded-full transition-[width] duration-[900ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] ${segmentRolloutBarClass(seg.extraction_coverage_pct)}`}
                          style={{ width: `${Math.min(100, seg.extraction_coverage_pct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {(props.avionics.segment_rollout ?? []).length === 0 ? (
                    <p className="text-sm text-[var(--fh-text-muted)]">Segment stats unavailable.</p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                <h3 className="text-sm font-semibold">Priced observations (active)</h3>
                <p className="mt-1 text-xs text-[var(--fh-text-muted)]">BAS vs GlobalAir vs other sources (observed_price &gt; 0)</p>
                {(() => {
                  const split = props.avionics.priced_observations_split ?? {
                    bas_part_sales: 0,
                    global_aircraft: 0,
                    other: 0,
                    priced_active_total: 0,
                  };
                  const bas = split.bas_part_sales;
                  const glob = split.global_aircraft;
                  const other = split.other;
                  const total = Math.max(1, split.priced_active_total || bas + glob + other);
                  const a = (bas / total) * 360;
                  const b = a + (glob / total) * 360;
                  return (
                    <div className="mt-4 flex flex-wrap items-center gap-6">
                      <div
                        className="relative h-36 w-36 shrink-0 rounded-full shadow-inner"
                        style={{
                          background: `conic-gradient(
                            rgb(34 197 94) 0deg ${a}deg,
                            rgb(59 130 246) ${a}deg ${b}deg,
                            rgb(148 163 184) ${b}deg 360deg
                          )`,
                        }}
                        aria-label="Priced observations by source"
                      >
                        <div className="absolute inset-6 flex flex-col items-center justify-center rounded-full bg-[var(--fh-bg-elevated)] text-center [data-theme=light]:bg-white">
                          <p className="text-[10px] uppercase text-[var(--fh-text-muted)]">Total</p>
                          <p className="text-lg font-bold tabular-nums text-[var(--fh-text)]">{split.priced_active_total.toLocaleString()}</p>
                        </div>
                      </div>
                      <ul className="min-w-[200px] space-y-2 text-xs">
                        <li className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-sm bg-emerald-500" />
                            BAS Part Sales
                          </span>
                          <span className="font-mono tabular-nums">{bas.toLocaleString()}</span>
                        </li>
                        <li className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-sm bg-blue-500" />
                            GlobalAir
                          </span>
                          <span className="font-mono tabular-nums">{glob.toLocaleString()}</span>
                        </li>
                        <li className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-sm bg-slate-400" />
                            Other sources
                          </span>
                          <span className="font-mono tabular-nums">{other.toLocaleString()}</span>
                        </li>
                      </ul>
                    </div>
                  );
                })()}
              </section>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                <h3 className="text-sm font-semibold">Parser adoption</h3>
                <p className="mt-1 text-xs text-[var(--fh-text-muted)]">Leading: {props.avionics.leading_parser_version}</p>
                <div className="mt-2 max-h-72 space-y-1 overflow-auto text-xs">
                  {Object.entries(props.avionics.parser_version_breakdown)
                    .slice(0, 12)
                    .map(([version, count]) => (
                      <div
                        key={version}
                        className="flex items-center justify-between rounded border border-[var(--fh-border)] px-2 py-1 [data-theme=light]:border-slate-200"
                      >
                        <span className="font-mono">{version}</span>
                        <span className="font-semibold text-[var(--fh-orange)]">{count.toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              </section>

              <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Top unresolved tokens</h3>
                    <p className="mt-1 text-xs text-[var(--fh-text-muted)]">
                      {props.avionics.unresolved_rows.toLocaleString()} unresolved mentions · {props.avionics.unresolved_rate_pct}% of
                      token rows
                    </p>
                  </div>
                  <p className="max-w-xs text-[10px] leading-snug text-[var(--fh-text-dim)]">
                    Alias curation: <code className="rounded bg-black/20 px-1 [data-theme=light]:bg-slate-100">scraper/apply_reviewed_aliases.py</code>
                  </p>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[320px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--fh-border)] text-[var(--fh-text-muted)] [data-theme=light]:border-slate-200">
                        <th className="py-2 pr-2 font-semibold">Token</th>
                        <th className="py-2 pr-2 font-semibold">Count</th>
                        <th className="py-2 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {props.avionics.top_unresolved_tokens.slice(0, 25).map((row) => (
                        <tr key={row.token} className="border-t border-[var(--fh-border)] [data-theme=light]:border-slate-100">
                          <td className="py-1.5 pr-2 font-mono text-[var(--fh-text)]">{row.token}</td>
                          <td className="py-1.5 pr-2 tabular-nums text-[var(--fh-orange)]">{row.count.toLocaleString()}</td>
                          <td className="py-1.5">
                            <button
                              type="button"
                              className="rounded border border-[var(--fh-border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--fh-orange)] hover:bg-[var(--fh-orange-dim)] [data-theme=light]:border-slate-300"
                              onClick={() => {
                                void navigator.clipboard?.writeText(row.token);
                              }}
                            >
                              Copy token
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {props.avionics.top_unresolved_tokens.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--fh-text-muted)]">No unresolved tokens in window.</p>
                  ) : null}
                </div>
              </section>
            </div>

            <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
              <h3 className="text-sm font-semibold">Catalog &amp; observations</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard label="Aliases" value={props.avionics.catalog.aliases_total} />
                <KpiCard label="Market value rows" value={props.avionics.catalog.market_values_total} />
                <KpiCard label="Price observations (all)" value={props.avionics.catalog.price_observations_total} />
                <KpiCard
                  label="Avg match confidence"
                  value={props.avionics.avg_match_confidence > 0 ? props.avionics.avg_match_confidence.toFixed(3) : "n/a"}
                />
              </div>
            </section>
          </div>
        ) : null}

        {tab === "engine" ? (
          <div className="space-y-4">
            <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Engine intelligence</h2>
                <span className="rounded bg-[var(--fh-orange-dim)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--fh-orange)]">
                  scoring v2.0.0 (flip)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard
                  label="SMOH rows"
                  value={`${props.engineIntel.smoh_coverage_pct}%`}
                  hint={`${props.engineIntel.smoh_listings.toLocaleString()} with hours since OH`}
                />
                <KpiCard
                  label="Engine value scored"
                  value={`${props.engineIntel.engine_value_coverage_pct}%`}
                  hint={`${props.engineIntel.engine_value_scored.toLocaleString()} rows`}
                  accent="success"
                />
                <KpiCard
                  label="Pricing gaps"
                  value={props.engineIntel.pricing_gap_listings}
                  hint="SMOH present, no remaining-value field"
                  accent="warn"
                />
                <KpiCard label="TBO reference rows" value={props.engineIntel.tbo_reference_rows} />
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                <h3 className="text-sm font-semibold">Manufacturer coverage</h3>
                <p className="mt-1 text-xs text-[var(--fh-text-muted)]">Share of listings with engine remaining value populated</p>
                <div className="mt-4 space-y-3">
                  {props.engineIntel.manufacturer_bars.map((m) => (
                    <div key={m.id}>
                      <div className="flex justify-between text-xs">
                        <span>{m.label}</span>
                        <span className="tabular-nums text-[var(--fh-text-muted)]">
                          {m.coverage_pct}% · {m.value_scored.toLocaleString()}/{m.listings.toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/15 [data-theme=light]:bg-slate-200">
                        <div
                          className="h-2 rounded-full bg-emerald-500/90 transition-[width] duration-500 [data-theme=light]:bg-emerald-600"
                          style={{ width: `${Math.min(100, m.coverage_pct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                <h3 className="text-sm font-semibold">Life remaining (ev_pct_life_remaining)</h3>
                <p className="mt-1 text-xs text-[var(--fh-text-muted)]">Distribution across scored rows</p>
                <div className="mt-4 space-y-2">
                  {(() => {
                    const L = props.engineIntel.life_remaining_distribution;
                    const rows = [
                      { label: "High (≥70%)", n: L.high_remaining, c: "rgb(34 197 94)" },
                      { label: "Mid (40–69%)", n: L.mid_remaining, c: "rgb(234 179 8)" },
                      { label: "Low (under 40%)", n: L.low_remaining, c: "rgb(249 115 22)" },
                      { label: "Past TBO (negative)", n: L.past_tbo, c: "rgb(190 18 60)" },
                      { label: "Unknown / null", n: L.unknown, c: "rgb(148 163 184)" },
                    ];
                    const max = Math.max(...rows.map((r) => r.n), 1);
                    return rows.map((row) => (
                      <div key={row.label}>
                        <div className="flex justify-between text-xs text-[var(--fh-text-muted)]">
                          <span>{row.label}</span>
                          <span className="tabular-nums">{row.n.toLocaleString()}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/15 [data-theme=light]:bg-slate-200">
                          <div
                            className="h-2 rounded-full"
                            style={{ width: `${(row.n / max) * 100}%`, backgroundColor: row.c }}
                          />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </section>
            </div>

            <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
              <h3 className="text-sm font-semibold">Top pricing gaps by engine model</h3>
              <p className="mt-1 text-xs text-[var(--fh-text-muted)]">SMOH present but no engine_remaining_value / ev_engine_remaining_value</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[400px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--fh-border)] text-[var(--fh-text-muted)] [data-theme=light]:border-slate-200">
                      <th className="py-2 font-semibold">Engine model</th>
                      <th className="py-2 font-semibold">Gap count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.engineIntel.top_pricing_gaps.map((row) => (
                      <tr key={row.engine_model} className="border-t border-[var(--fh-border)] [data-theme=light]:border-slate-100">
                        <td className="py-1.5 font-mono text-[var(--fh-text)]">{row.engine_model}</td>
                        <td className="py-1.5 tabular-nums text-[var(--fh-orange)]">{row.count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {props.engineIntel.top_pricing_gaps.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--fh-text-muted)]">No gaps detected in snapshot.</p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "scoring" ? (
          <div className="space-y-4">
            <div
              className="rounded-lg border border-amber-500/25 px-4 py-3 text-xs leading-relaxed text-amber-200 [data-theme=light]:border-amber-400/40 [data-theme=light]:bg-amber-50 [data-theme=light]:text-amber-900"
              style={{ background: "rgba(245, 158, 11, 0.08)" }}
            >
              <p className="font-semibold text-amber-300 [data-theme=light]:text-amber-900">Flip score integrity</p>
              <p className="mt-1 text-amber-100/95 [data-theme=light]:text-amber-900/90">
                Disclosed-price rows should have a computed <span className="font-semibold">flip_score</span> after v2.0.0
                backfill. Missing flip on priced rows:{" "}
                <span className="font-semibold">
                  {(props.platform.listings.flip_missing_with_disclosed_price ?? 0).toLocaleString()}
                </span>
                . Rows with flip fields but no positive ask (should be rare):{" "}
                <span className="font-semibold">
                  {(props.platform.listings.deal_tier_without_disclosed_price ?? 0).toLocaleString()}
                </span>{" "}
                (including{" "}
                <span className="font-semibold">
                  {(props.platform.listings.exceptional_deal_without_disclosed_price ?? 0).toLocaleString()}
                </span>{" "}
                HOT without price).
              </p>
            </div>

            <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
              <h2 className="text-lg font-semibold">Flip tier mix (active)</h2>
              <p className="mt-1 text-xs text-[var(--fh-text-muted)]">HOT / GOOD / FAIR / PASS vs no flip (undisclosed ask or null score)</p>
              <div className="mt-4 space-y-2">
                {(() => {
                  const fd = props.platform.listings.flip_tier_distribution ?? {
                    HOT: 0,
                    GOOD: 0,
                    FAIR: 0,
                    PASS: 0,
                    NO_FLIP: 0,
                  };
                  const rows = [
                    { label: "HOT", count: fd.HOT, color: "rgb(249 115 22)" },
                    { label: "GOOD", count: fd.GOOD, color: "rgb(34 197 94)" },
                    { label: "FAIR", count: fd.FAIR, color: "rgb(251 191 36)" },
                    { label: "PASS", count: fd.PASS, color: "rgb(148 163 184)" },
                    { label: "No flip / undisclosed", count: fd.NO_FLIP, color: "rgb(71 85 105)" },
                  ];
                  const max = Math.max(...rows.map((r) => r.count), 1);
                  return rows.map((row) => (
                    <div key={row.label}>
                      <div className="flex justify-between text-xs text-[var(--fh-text-muted)]">
                        <span>{row.label}</span>
                        <span className="tabular-nums text-[var(--fh-text)]">{row.count.toLocaleString()}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/15 [data-theme=light]:bg-slate-200">
                        <div
                          className="h-2 rounded-full transition-[width] duration-500 ease-out"
                          style={{ width: `${(row.count / max) * 100}%`, backgroundColor: row.color }}
                        />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                <h2 className="text-lg font-semibold">Flip score pillars</h2>
                <p className="mt-1 text-xs text-[var(--fh-text-muted)]">Single displayed score (0–100) from four pillars — see listing detail for breakdown</p>
                <ul className="mt-3 space-y-2 text-sm text-[var(--fh-text)]">
                  <li>
                    <span className="font-semibold text-[var(--fh-orange)]">P1</span> Pricing edge (35) — true cost vs comps
                  </li>
                  <li>
                    <span className="font-semibold text-sky-400 [data-theme=light]:text-sky-700">P2</span> Airworthiness (20) — engine life + risk
                  </li>
                  <li>
                    <span className="font-semibold text-teal-400 [data-theme=light]:text-teal-700">P3</span> Improvement headroom (30) — avionics + condition gap
                  </li>
                  <li>
                    <span className="font-semibold text-violet-400 [data-theme=light]:text-violet-700">P4</span> Exit liquidity (15) — model demand + DOM
                  </li>
                </ul>
              </section>

              <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                <h2 className="text-lg font-semibold">Flip tier thresholds</h2>
                <p className="mt-1 text-xs text-[var(--fh-text-muted)]">Bands from flip_score (see core/intelligence/flip_score.py)</p>
                <div className="mt-4 space-y-3">
                  {[
                    { label: "HOT", range: "flip_score ≥ 80", sub: "Top flip opportunity lane", border: "border-orange-500/40", bg: "bg-orange-500/10", text: "text-orange-300 [data-theme=light]:text-orange-900" },
                    { label: "GOOD", range: "65 – 79", sub: "Solid resale profile", border: "border-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-300 [data-theme=light]:text-emerald-900" },
                    { label: "FAIR", range: "50 – 64", sub: "Marginal — diligence heavy", border: "border-amber-500/35", bg: "bg-amber-500/10", text: "text-amber-200 [data-theme=light]:text-amber-900" },
                    { label: "PASS", range: "Under 50", sub: "Not competitive on flip math", border: "border-slate-500/40", bg: "bg-slate-500/10", text: "text-slate-300 [data-theme=light]:text-slate-800" },
                    { label: "Undisclosed ask", range: "N/A", sub: "flip_score suppressed until price known", border: "border-slate-500/40", bg: "bg-slate-500/10", text: "text-slate-300 [data-theme=light]:text-slate-800" },
                  ].map((tier) => (
                    <div key={tier.label} className={`rounded-lg border px-3 py-3 ${tier.border} ${tier.bg}`}>
                      <p className={`text-sm font-bold ${tier.text}`}>{tier.label}</p>
                      <p className="text-xs text-[var(--fh-text-muted)]">{tier.range}</p>
                      <p className="mt-1 text-[11px] text-[var(--fh-text-dim)]">{tier.sub}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Deal signal feed</h2>
                <Link href="/internal/admin/buyer-intelligence" className="text-sm text-[var(--fh-orange)] hover:opacity-90">
                  Open buyer intelligence
                </Link>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--fh-text-muted)]">Aging high-value</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {props.buyer.deal_patterns.aging_high_value.slice(0, 10).map((row) => (
                      <li
                        key={row.listing_id}
                        className="rounded border border-[var(--fh-border)] px-2 py-1 [data-theme=light]:border-slate-200"
                      >
                        <Link href={`/listings/${row.listing_id}`} className="text-[var(--fh-orange)] hover:underline">
                          {row.year} {row.make} {row.model}
                        </Link>{" "}
                        — ${Math.round(row.price).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--fh-text-muted)]">Recent price drops</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {props.buyer.deal_patterns.price_drops.slice(0, 10).map((row) => (
                      <li
                        key={row.listing_id}
                        className="rounded border border-[var(--fh-border)] px-2 py-1 [data-theme=light]:border-slate-200"
                      >
                        <Link href={`/listings/${row.listing_id}`} className="text-[var(--fh-orange)] hover:underline">
                          {row.year} {row.make} {row.model}
                        </Link>{" "}
                        — {row.reduction_pct}% drop
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {tab === "users" ? (
          <div className="space-y-6">
            <section>
              <h2 className="mb-3 text-lg font-semibold">Site traffic (demo series)</h2>
              <p className="mb-3 text-xs text-[var(--fh-text-muted)]">
                Placeholder analytics until a first-party event pipeline is wired. Shape matches the UI overhaul spec.
              </p>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard topStripe="emerald" label="Visitors (7d est.)" value={DEMO_VISITORS_14D.slice(-7).reduce((a, b) => a + b, 0)} hint="Sum of demo curve" />
                <KpiCard topStripe="sky" label="Page views (7d est.)" value={DEMO_VISITORS_14D.slice(-7).reduce((a, b) => a + b, 0) * 4} />
                <KpiCard topStripe="amber" label="Avg session" value="4m 12s" />
                <KpiCard topStripe="rose" label="Bounce rate" value="38%" />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 lg:col-span-2 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                  <h3 className="text-sm font-semibold">14-day visitor trend</h3>
                  <svg viewBox="0 0 400 140" className="mt-3 h-40 w-full" role="img" aria-label="Visitors trend">
                    <defs>
                      <linearGradient id="adminVisGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(249 115 22)" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="rgb(249 115 22)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <polyline
                      fill="none"
                      stroke="rgb(249 115 22)"
                      strokeWidth="2.5"
                      points={DEMO_VISITORS_14D.map((v, i) => {
                        const x = 20 + (i * 360) / Math.max(1, DEMO_VISITORS_14D.length - 1);
                        const max = Math.max(...DEMO_VISITORS_14D);
                        const min = Math.min(...DEMO_VISITORS_14D);
                        const y = 110 - ((v - min) / Math.max(1, max - min)) * 85;
                        return `${x},${y}`;
                      }).join(" ")}
                    />
                    <polygon
                      fill="url(#adminVisGrad)"
                      points={`20,110 ${DEMO_VISITORS_14D.map((v, i) => {
                        const x = 20 + (i * 360) / Math.max(1, DEMO_VISITORS_14D.length - 1);
                        const max = Math.max(...DEMO_VISITORS_14D);
                        const min = Math.min(...DEMO_VISITORS_14D);
                        const y = 110 - ((v - min) / Math.max(1, max - min)) * 85;
                        return `${x},${y}`;
                      }).join(" ")} 380,110`}
                    />
                    <text x="20" y="130" className="fill-[var(--fh-text-dim)] text-[9px]">
                      Day 1
                    </text>
                    <text x="330" y="130" className="fill-[var(--fh-text-dim)] text-[9px]">
                      Today
                    </text>
                  </svg>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--fh-text-muted)]">
                    <span>Weekends consistently highest (demo)</span>
                    <span>
                      Peak today: {Math.max(...DEMO_VISITORS_14D).toLocaleString()} visitors
                    </span>
                    <span className="text-emerald-400 [data-theme=light]:text-emerald-700">
                      WoW growth (demo): +
                      {(
                        ((DEMO_VISITORS_14D[DEMO_VISITORS_14D.length - 1] - DEMO_VISITORS_14D[DEMO_VISITORS_14D.length - 8]) /
                          Math.max(1, DEMO_VISITORS_14D[DEMO_VISITORS_14D.length - 8])) *
                        100
                      ).toFixed(1)}
                      %
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                    <h3 className="text-sm font-semibold">Top pages</h3>
                    <div className="mt-3 space-y-2">
                      {(() => {
                        const max = Math.max(...DEMO_TOP_PAGES.map((p) => p.views), 1);
                        return DEMO_TOP_PAGES.map((p) => (
                          <div key={p.path}>
                            <div className="flex justify-between text-[10px] text-[var(--fh-text-muted)]">
                              <span className="font-mono">{p.path}</span>
                              <span>{p.views.toLocaleString()}</span>
                            </div>
                            <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-black/15 [data-theme=light]:bg-slate-200">
                              <div
                                className="h-2 rounded-full transition-[width] duration-[900ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                                style={{ width: `${(p.views / max) * 100}%`, background: p.color }}
                              />
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                    <h3 className="text-sm font-semibold">Traffic sources (demo)</h3>
                    {(() => {
                      const direct = 49;
                      const seo = 31;
                      const social = 20;
                      const a = (direct / 100) * 360;
                      const b = a + (seo / 100) * 360;
                      return (
                        <div className="mt-3 flex items-center gap-4">
                          <div
                            className="h-28 w-28 shrink-0 rounded-full"
                            style={{
                              background: `conic-gradient(rgb(249 115 22) 0deg ${a}deg, rgb(56 189 248) ${a}deg ${b}deg, rgb(34 197 94) ${b}deg 360deg)`,
                            }}
                            aria-hidden
                          />
                          <ul className="space-y-1 text-[11px]">
                            <li className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-sm bg-orange-500" /> Direct {direct}%
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-sm bg-sky-400" /> Google / SEO {seo}%
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Social / referral {social}%
                            </li>
                          </ul>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold">Users &amp; beta</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard topStripe="violet" label="Beta invites sent" value={inviteRows.length} />
                <KpiCard
                  topStripe="emerald"
                  label="Activated invites"
                  value={inviteRows.filter((row) => row.used_at != null).length}
                />
                <KpiCard topStripe="sky" label="Admin users (active)" value={props.audience.admin_users_active} />
                <KpiCard topStripe="pink" label="Saved Deal Desk scenarios" value={props.audience.deal_desk_saved_scenarios} />
              </div>
              <p className="mt-2 text-[11px] text-[var(--fh-text-dim)]">
                Watchlist counts are client-side on{" "}
                <Link href="/internal/deals" className="text-[var(--fh-orange)] hover:underline">
                  /internal/deals
                </Link>{" "}
                (localStorage) — not yet aggregated server-side.
              </p>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                  <h3 className="text-sm font-semibold">Beta session activity</h3>
                  <p className="text-xs text-[var(--fh-text-muted)]">Latest {props.audience.recent_beta_activity.length} sessions</p>
                  <div className="mt-3 max-h-72 overflow-auto text-xs">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-[var(--fh-border)] text-[var(--fh-text-muted)] [data-theme=light]:border-slate-200">
                          <th className="py-2 pr-2">Invite</th>
                          <th className="py-2 pr-2">Email / hint</th>
                          <th className="py-2">Last seen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {props.audience.recent_beta_activity.map((row) => (
                          <tr key={row.session_id} className="border-t border-[var(--fh-border)] [data-theme=light]:border-slate-100">
                            <td className="py-1.5 pr-2">{row.invite_label}</td>
                            <td className="py-1.5 pr-2 text-[var(--fh-text-muted)]">{row.email_hint || "—"}</td>
                            <td className="py-1.5 text-[var(--fh-text-dim)]">
                              {row.last_seen_at ? new Date(row.last_seen_at).toLocaleString() : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {props.audience.recent_beta_activity.length === 0 ? (
                      <p className="py-4 text-sm text-[var(--fh-text-muted)]">No recent sessions.</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
                  <h3 className="text-sm font-semibold">High-attention inventory (proxy)</h3>
                  <p className="text-xs text-[var(--fh-text-muted)]">
                    Top flip_score rows (≥65) — not watch counts. Undisclosed ask rows are flagged.
                  </p>
                  <div className="mt-3 max-h-72 overflow-auto text-xs">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-[var(--fh-border)] text-[var(--fh-text-muted)] [data-theme=light]:border-slate-200">
                          <th className="py-2 pr-2">Aircraft</th>
                          <th className="py-2 pr-2">Price</th>
                          <th className="py-2 pr-2">Flip</th>
                          <th className="py-2 pr-2">Tier</th>
                          <th className="py-2">Watches</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(props.buyer.admin_inventory_highlights ?? []).map((row) => {
                          const noPrice = row.asking_price === null || row.asking_price <= 0;
                          return (
                            <tr key={row.listing_id} className="border-t border-[var(--fh-border)] [data-theme=light]:border-slate-100">
                              <td className="py-1.5 pr-2">
                                <Link href={`/listings/${row.listing_id}`} className="text-[var(--fh-orange)] hover:underline">
                                  {row.year} {row.make} {row.model}
                                </Link>
                              </td>
                              <td className="py-1.5 pr-2">
                                {noPrice ? <span className="text-amber-400 [data-theme=light]:text-amber-700">Undisclosed</span> : `$${Math.round(row.asking_price!).toLocaleString()}`}
                              </td>
                              <td className="py-1.5 pr-2 tabular-nums">{row.flip_score}</td>
                              <td className="py-1.5 pr-2 font-mono text-[11px] text-[var(--fh-text-muted)]">{row.flip_tier || "—"}</td>
                              <td className="py-1.5 text-[var(--fh-text-dim)]">—</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {(props.buyer.admin_inventory_highlights ?? []).length === 0 ? (
                      <p className="py-4 text-sm text-[var(--fh-text-muted)]">No highlights available.</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/internal/admin/invites"
                  className="fh-cta-on-orange-fill inline-block rounded bg-[var(--fh-orange)] px-3 py-2 text-sm font-semibold hover:opacity-95"
                >
                  Create invite link
                </Link>
                <Link
                  href="/internal/admin/users"
                  className="inline-block rounded border border-[var(--fh-border)] px-3 py-2 text-sm [data-theme=light]:border-slate-300"
                >
                  Manage users &amp; Google access
                </Link>
                <span className="self-center text-xs text-[var(--fh-text-muted)]">
                  Live sessions (24h): {props.invites.stats.currently_active_sessions} · Total beta sessions:{" "}
                  {props.audience.beta_sessions_total.toLocaleString()}
                </span>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
