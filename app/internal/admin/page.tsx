import Link from "next/link";
import { computeBuyerIntelligence, computeDataQuality, computePlatformStats, listInvitesWithSessions } from "@/lib/admin/analytics";
import { CompletenessDonut } from "./components/AdminCharts";
import { SourceQualitySection } from "./components/SourceQualitySection";

export const dynamic = "force-dynamic";

function statValue(value: number | string) {
  if (typeof value === "number") return value.toLocaleString();
  return value;
}

const EMPTY_PLATFORM = {
  listings: {
    total_active: 0,
    added_last_7_days: 0,
    score_coverage_pct: 0,
    by_source: {} as Record<string, number>,
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

export default async function InternalAdminPage() {
  const [platformResult, qualityResult, buyerResult, invitesResult] = await Promise.allSettled([
    computePlatformStats(),
    computeDataQuality(),
    computeBuyerIntelligence(),
    listInvitesWithSessions(),
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

  const platform = platformResult.status === "fulfilled" ? platformResult.value : EMPTY_PLATFORM;
  const dataQuality = qualityResult.status === "fulfilled" ? qualityResult.value : EMPTY_DATA_QUALITY;
  const buyer = buyerResult.status === "fulfilled" ? buyerResult.value : EMPTY_BUYER;
  const invites = invitesResult.status === "fulfilled" ? invitesResult.value : EMPTY_INVITES;
  const inviteRows = invites.invites as Array<Record<string, unknown>>;

  const avgValueScore = platform.listings.total_active
    ? Math.round((platform.deals.high_score_listings / platform.listings.total_active) * 100)
    : 0;
  const sourceOrder = ["aerotrader", "controller", "tradaplane", "barnstormers", "aso", "afs", "globalair", "avbuyer", "unknown"];
  const sourceCounts = Object.entries(platform.listings.by_source ?? {}).sort((a, b) => {
    const ai = sourceOrder.indexOf(a[0]);
    const bi = sourceOrder.indexOf(b[0]);
    if (ai === -1 && bi === -1) return b[1] - a[1];
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <main className="space-y-4 p-4 md:p-6">
      <header className="rounded border border-brand-dark bg-card-bg p-4">
        <h1 className="text-2xl font-semibold">Admin Portal</h1>
        <p className="text-sm text-brand-muted">
          Operational command center for platform health, data quality, and buyer intelligence.
        </p>
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
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SourceQualitySection />
        </div>
        <article className="rounded border border-brand-dark bg-card-bg p-4">
          <h2 className="mb-2 text-lg font-semibold">Completeness Distribution</h2>
          <CompletenessDonut distribution={dataQuality.completeness_distribution} />
          <p className="text-xs text-brand-muted">Overall completeness: {dataQuality.overall_completeness_pct}%</p>
        </article>
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
          <Link href="/internal/admin/invites" className="mt-3 inline-block rounded bg-brand-orange px-3 py-2 text-sm font-semibold text-black">
            Create New Invite Link
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
