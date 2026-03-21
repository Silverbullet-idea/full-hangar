import Link from "next/link";
import {
  computeAvionicsIntelligence,
  computeBuyerIntelligence,
  computeDataQuality,
  computePlatformStats,
  listInvitesWithSessions,
} from "@/lib/admin/analytics";
import { SourceQualitySection } from "./components/SourceQualitySection";

export const dynamic = "force-dynamic";

function statValue(value: number | string) {
  if (typeof value === "number") return value.toLocaleString();
  return value;
}

function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promiseLike)
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function summarizeFailure(reason: unknown): string {
  const raw = String(reason ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (!raw) return "request failed";
  if (raw.includes("timed out")) return "timed out";
  if (raw.includes("missing service-role supabase key")) return "service key missing";
  if (raw.includes("permission denied") || raw.includes("not authorized")) return "permission denied";
  if (raw.includes("cloudflare") || raw.includes("error 522")) return "upstream timeout";
  return "request failed";
}

const EMPTY_PLATFORM = {
  listings: {
    total_active: 0,
    added_last_7_days: 0,
    score_coverage_pct: 0,
    by_source: {} as Record<string, number>,
    source_freshness: [] as Array<{
      source: string;
      active_listings: number;
      seen_last_24h_pct: number;
      seen_last_72h_pct: number;
      new_last_24h: number;
      new_last_7d: number;
      last_seen_at: string | null;
    }>,
  },
  deals: {
    high_score_listings: 0,
    price_reductions_last_7d: 0,
  },
  market_intelligence: {
    ownership_changes_detected_30d: 0,
    faa_records_loaded: 0,
  },
};

const EMPTY_DATA_QUALITY = {
  overall_completeness_pct: 0,
  completeness_distribution: {
    excellent: 0,
    good: 0,
    fair: 0,
    sparse: 0,
  },
  field_stats: [] as Array<{ field: string; category: string; fill_pct: number }>,
};

const EMPTY_BUYER = {
  deal_patterns: {
    aging_high_value: [] as Array<{ listing_id: string; year: number; make: string; model: string; price: number }>,
    price_drops: [] as Array<{ listing_id: string; year: number; make: string; model: string; reduction_pct: number }>,
  },
};

const EMPTY_INVITES = {
  invites: [] as Array<Record<string, unknown>>,
  stats: {
    currently_active_sessions: 0,
  },
};

const EMPTY_AVIONICS = {
  catalog: {
    units_active: 0,
    aliases_total: 0,
    market_values_total: 0,
    price_observations_total: 0,
  },
  listings_scanned: 0,
  listings_with_avionics_text: 0,
  listings_with_observations: 0,
  listings_with_observations_in_avionics_text: 0,
  observation_rows_total: 0,
  matched_rows: 0,
  unresolved_rows: 0,
  matched_rate_pct: 0,
  unresolved_rate_pct: 0,
  extraction_coverage_pct: 0,
  avg_match_confidence: 0,
  leading_parser_version: "n/a",
  parser_version_breakdown: {} as Record<string, number>,
  top_unresolved_tokens: [] as Array<{ token: string; count: number }>,
};

export default async function InternalAdminPage() {
  const [platformResult, qualityResult, buyerResult, invitesResult, avionicsResult] = await Promise.allSettled([
    withTimeout(computePlatformStats(), 9000, "platform stats"),
    withTimeout(computeDataQuality(), 9000, "data quality"),
    withTimeout(computeBuyerIntelligence(), 9000, "buyer intelligence"),
    withTimeout(listInvitesWithSessions(), 9000, "invites"),
    withTimeout(computeAvionicsIntelligence({ days: 90, top: 30 }), 9000, "avionics intelligence"),
  ]);

  if (platformResult.status === "rejected") {
    console.error("[admin] computePlatformStats failed", platformResult.reason);
  }
  if (qualityResult.status === "rejected") {
    console.error("[admin] computeDataQuality failed", qualityResult.reason);
  }
  if (buyerResult.status === "rejected") {
    console.error("[admin] computeBuyerIntelligence failed", buyerResult.reason);
  }
  if (invitesResult.status === "rejected") {
    console.error("[admin] listInvitesWithSessions failed", invitesResult.reason);
  }
  if (avionicsResult.status === "rejected") {
    console.error("[admin] computeAvionicsIntelligence failed", avionicsResult.reason);
  }

  const failedPanels = [
    platformResult.status === "rejected"
      ? `Platform stats (${summarizeFailure(platformResult.reason)})`
      : null,
    qualityResult.status === "rejected"
      ? `Data quality (${summarizeFailure(qualityResult.reason)})`
      : null,
    buyerResult.status === "rejected"
      ? `Buyer intelligence (${summarizeFailure(buyerResult.reason)})`
      : null,
    invitesResult.status === "rejected"
      ? `Invites/sessions (${summarizeFailure(invitesResult.reason)})`
      : null,
    avionicsResult.status === "rejected"
      ? `Avionics intelligence (${summarizeFailure(avionicsResult.reason)})`
      : null,
  ].filter((value): value is string => Boolean(value));

  const platform = platformResult.status === "fulfilled" ? platformResult.value : EMPTY_PLATFORM;
  const dataQuality = qualityResult.status === "fulfilled" ? qualityResult.value : EMPTY_DATA_QUALITY;
  const buyer = buyerResult.status === "fulfilled" ? buyerResult.value : EMPTY_BUYER;
  const invites = invitesResult.status === "fulfilled" ? invitesResult.value : EMPTY_INVITES;
  const avionics = avionicsResult.status === "fulfilled" ? avionicsResult.value : EMPTY_AVIONICS;
  const inviteRows = invites.invites as Array<Record<string, unknown>>;

  const avgValueScore = platform.listings.total_active
    ? Math.round((platform.deals.high_score_listings / platform.listings.total_active) * 100)
    : 0;
  const hiddenSources = new Set(["unknown", "unkown"]);
  const sourceOrder = ["aerotrader", "controller", "tradaplane", "barnstormers", "aso", "afs", "globalair", "avbuyer"];
  const sourceCounts = Object.entries(platform.listings.by_source ?? {})
    .filter(([source]) => !hiddenSources.has(String(source).toLowerCase()))
    .sort((a, b) => {
    const ai = sourceOrder.indexOf(a[0]);
    const bi = sourceOrder.indexOf(b[0]);
    if (ai === -1 && bi === -1) return b[1] - a[1];
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  const freshnessBySource = (platform.listings.source_freshness ?? []).filter(
    (row) => !hiddenSources.has(String(row.source).toLowerCase())
  );

  return (
    <main className="space-y-4 p-4 md:p-6">
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
              className="rounded bg-brand-orange px-3 py-2 text-sm font-semibold !text-zinc-950 whitespace-nowrap hover:bg-brand-burn hover:!text-zinc-950"
            >
              🧮 Open Deal Desk
            </Link>
          </div>
        </div>
        {failedPanels.length > 0 ? (
          <p className="mt-3 rounded border border-brand-dark bg-[#161616] px-3 py-2 text-xs text-brand-orange">
            Live data is temporarily unavailable for: {failedPanels.join(", ")}. Displaying fallback values.
          </p>
        ) : null}
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total Active Listings", value: platform.listings.total_active },
          { label: "Listings Added (7d)", value: platform.listings.added_last_7_days },
          { label: "Score Coverage %", value: `${platform.listings.score_coverage_pct}%` },
          { label: "Avg Value Score", value: `${avgValueScore}%` },
          { label: "High-Score Deals", value: platform.deals.high_score_listings },
          { label: "Price Reductions (7d)", value: platform.deals.price_reductions_last_7d },
          { label: "Ownership Changes (30d)", value: platform.market_intelligence.ownership_changes_detected_30d },
          { label: "FAA Records", value: platform.market_intelligence.faa_records_loaded },
        ].map((stat) => (
          <article key={stat.label} className="rounded border border-brand-dark bg-card-bg p-3">
            <p className="text-xs uppercase tracking-wide text-brand-muted">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold text-brand-orange">{statValue(stat.value)}</p>
          </article>
        ))}
      </section>

      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Source Inventory</h2>
          <p className="text-xs text-brand-muted">Total active: {platform.listings.total_active.toLocaleString()}</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {sourceCounts.map(([source, count]) => {
            const pct = platform.listings.total_active > 0 ? ((count / platform.listings.total_active) * 100).toFixed(1) : "0.0";
            return (
              <div key={source} className="rounded border border-brand-dark px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-brand-muted">{source}</p>
                <p className="mt-1 text-lg font-semibold text-brand-orange">{count.toLocaleString()}</p>
                <p className="text-xs text-brand-muted">{pct}% of active inventory</p>
              </div>
            );
          })}
          {sourceCounts.length === 0 ? (
            <p className="text-sm text-brand-muted">No source breakdown available.</p>
          ) : null}
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
              {freshnessBySource.map((row) => (
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

      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Avionics Intelligence</h2>
          <span className="text-xs text-brand-muted">90-day window</span>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[
            { label: "Catalog Units", value: avionics.catalog.units_active },
            { label: "Aliases", value: avionics.catalog.aliases_total },
            { label: "Price Observations", value: avionics.catalog.price_observations_total },
            { label: "Match Rate", value: `${avionics.matched_rate_pct}%` },
            { label: "Unresolved Rows", value: avionics.unresolved_rows },
            { label: "Coverage", value: `${avionics.extraction_coverage_pct}%` },
          ].map((stat) => (
            <article key={stat.label} className="rounded border border-brand-dark bg-[#101010] p-3">
              <p className="text-xs uppercase tracking-wide text-brand-muted">{stat.label}</p>
              <p className="mt-1 text-xl font-semibold text-brand-orange">{statValue(stat.value)}</p>
            </article>
          ))}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded border border-brand-dark p-3">
            <h3 className="text-sm font-semibold">Parser Adoption</h3>
            <p className="mt-1 text-xs text-brand-muted">Leading parser: {avionics.leading_parser_version}</p>
            <div className="mt-2 space-y-1 text-xs">
              {Object.entries(avionics.parser_version_breakdown)
                .slice(0, 8)
                .map(([version, count]) => (
                  <div key={version} className="flex items-center justify-between rounded border border-brand-dark px-2 py-1">
                    <span>{version}</span>
                    <span className="font-semibold text-brand-orange">{count.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </div>

          <div className="rounded border border-brand-dark p-3">
            <h3 className="text-sm font-semibold">Top Unresolved Tokens</h3>
            <p className="mt-1 text-xs text-brand-muted">
              Remaining unresolved rows: {avionics.unresolved_rows.toLocaleString()} ({avionics.unresolved_rate_pct}%)
            </p>
            <div className="mt-2 max-h-64 space-y-1 overflow-auto text-xs">
              {avionics.top_unresolved_tokens.slice(0, 20).map((row) => (
                <div key={row.token} className="flex items-center justify-between rounded border border-brand-dark px-2 py-1">
                  <span>{row.token}</span>
                  <span className="font-semibold text-brand-orange">{row.count}</span>
                </div>
              ))}
              {avionics.top_unresolved_tokens.length === 0 ? <p className="text-brand-muted">No unresolved tokens.</p> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded border border-brand-dark bg-card-bg p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Deal Signal Feed</h2>
            <Link href="/internal/admin/buyer-intelligence" className="text-sm text-brand-orange hover:text-brand-burn">
              Open Buyer Intelligence
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-brand-muted">Aging High-Value Listings</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {buyer.deal_patterns.aging_high_value.slice(0, 10).map((row) => (
                  <li key={row.listing_id} className="rounded border border-brand-dark px-2 py-1">
                    {row.year} {row.make} {row.model} - ${Math.round(row.price).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-brand-muted">Recent Price Drops</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {buyer.deal_patterns.price_drops.slice(0, 10).map((row) => (
                  <li key={row.listing_id} className="rounded border border-brand-dark px-2 py-1">
                    {row.year} {row.make} {row.model} - {row.reduction_pct}% drop
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </article>

        <article className="rounded border border-brand-dark bg-card-bg p-4">
          <h2 className="text-lg font-semibold">Beta Invite Quick Actions</h2>
          <p className="mt-2 text-sm text-brand-muted">
            Active invites: {inviteRows.filter((row) => row.is_active === true).length}
          </p>
          <p className="text-sm text-brand-muted">Live sessions: {invites.stats.currently_active_sessions}</p>
          <Link
            href="/internal/admin/invites"
            className="mt-3 inline-block rounded bg-brand-orange px-3 py-2 text-sm font-semibold !text-black hover:bg-brand-burn hover:!text-black"
          >
            <span className="!text-zinc-950">Create New Invite Link</span>
          </Link>
          <Link href="/internal/admin/users" className="mt-2 inline-block rounded border border-brand-dark px-3 py-2 text-sm">
            Manage Users & Google Access
          </Link>
          <div className="mt-3 space-y-1 text-xs text-brand-muted">
            {inviteRows.slice(0, 5).map((row) => (
              <p key={String(row.id)}>
                {String(row.label ?? "Untitled invite")} - {String(row.created_at ?? "").slice(0, 10)}
              </p>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Data Quality Summary</h2>
          <Link href="/internal/admin/data-quality" className="text-sm text-brand-orange hover:text-brand-burn">
            View Full Breakdown
          </Link>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {dataQuality.field_stats.slice(0, 9).map((field) => (
            <div key={field.field} className="rounded border border-brand-dark px-3 py-2">
              <p className="text-xs text-brand-muted">{field.category}</p>
              <p className="text-sm font-semibold">{field.field}</p>
              <p className="text-sm text-brand-orange">{field.fill_pct}%</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
