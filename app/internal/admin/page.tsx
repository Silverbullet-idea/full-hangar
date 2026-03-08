import Link from "next/link";
import { computeBuyerIntelligence, computeDataQuality, computePlatformStats, listInvitesWithSessions } from "@/lib/admin/analytics";
import { CompletenessDonut } from "./components/AdminCharts";
import { SourceQualitySection } from "./components/SourceQualitySection";

export const dynamic = "force-dynamic";

function statValue(value: number | string) {
  if (typeof value === "number") return value.toLocaleString();
  return value;
}

export default async function InternalAdminPage() {
  const [platform, dataQuality, buyer, invites] = await Promise.all([
    computePlatformStats(),
    computeDataQuality(),
    computeBuyerIntelligence(),
    listInvitesWithSessions(),
  ]);
  const inviteRows = invites.invites as Array<Record<string, unknown>>;

  const avgValueScore = platform.listings.total_active
    ? Math.round((platform.deals.high_score_listings / platform.listings.total_active) * 100)
    : 0;

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
