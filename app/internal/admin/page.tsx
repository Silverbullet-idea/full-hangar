import {
  computeAdminAudienceMetrics,
  computeAvionicsIntelligence,
  computeBuyerIntelligence,
  computeDataQuality,
  computeEngineIntelligence,
  computePlatformStats,
  getActiveListings,
  listInvitesWithSessions,
} from "@/lib/admin/analytics";
import { fetchWaitlistPendingCountOnly } from "@/lib/waitlist/adminWaitlistServer";
import AdminPortalClient from "./components/AdminPortalClient";

export const dynamic = "force-dynamic";

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
    faa_matched_count: 0,
    faa_match_pct: 0,
    n_number_filled: 0,
    n_number_pct: 0,
    no_price_listings: 0,
    engine_value_scored: 0,
    engine_value_coverage_pct: 0,
    distinct_sources: 0,
    score_distribution: {
      tier_85_plus: 0,
      tier_70_84: 0,
      tier_50_69: 0,
      tier_25_49: 0,
      tier_under_25: 0,
      no_score: 0,
    },
    deal_tier_without_disclosed_price: 0,
    exceptional_deal_without_disclosed_price: 0,
    flip_tier_distribution: { HOT: 0, GOOD: 0, FAIR: 0, PASS: 0, NO_FLIP: 0 },
    flip_missing_with_disclosed_price: 0,
  },
  deals: {
    high_score_listings: 0,
    price_reductions_last_7d: 0,
    exceptional_deals: 0,
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
  source_stats: [] as Array<{
    source: string;
    listing_count: number;
    overall_fill_pct: number;
    field_breakdown: Record<string, number>;
  }>,
};

const EMPTY_BUYER = {
  deal_patterns: {
    aging_high_value: [] as Array<{ listing_id: string; year: number; make: string; model: string; price: number }>,
    price_drops: [] as Array<{ listing_id: string; year: number; make: string; model: string; reduction_pct: number }>,
  },
  admin_inventory_highlights: [] as Array<{
    listing_id: string;
    year: number;
    make: string;
    model: string;
    asking_price: number | null;
    flip_score: number;
    flip_tier: string;
  }>,
};

const EMPTY_AUDIENCE = {
  admin_users_active: 0,
  beta_sessions_total: 0,
  deal_desk_saved_scenarios: 0,
  recent_beta_activity: [] as Array<{
    session_id: string;
    invite_label: string;
    email_hint: string;
    last_seen_at: string;
    created_at: string;
  }>,
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
  segment_rollout: [] as Array<{
    id: string;
    label: string;
    listings_with_avionics_text: number;
    extraction_coverage_pct: number;
  }>,
  priced_observations_split: {
    bas_part_sales: 0,
    global_aircraft: 0,
    other: 0,
    priced_active_total: 0,
  },
};

const EMPTY_ENGINE = {
  total_active: 0,
  smoh_listings: 0,
  smoh_coverage_pct: 0,
  engine_value_scored: 0,
  engine_value_coverage_pct: 0,
  pricing_gap_listings: 0,
  tbo_reference_rows: 0,
  manufacturer_bars: [] as Array<{
    id: string;
    label: string;
    listings: number;
    value_scored: number;
    coverage_pct: number;
  }>,
  top_pricing_gaps: [] as Array<{ engine_model: string; count: number }>,
  life_remaining_distribution: {
    high_remaining: 0,
    mid_remaining: 0,
    low_remaining: 0,
    past_tbo: 0,
    unknown: 0,
  },
};

export default async function InternalAdminPage() {
  // `computePlatformStats`, `computeDataQuality`, and `computeBuyerIntelligence` all share
  // `getActiveListings()` via React `cache()`. Per-panel 9s timeouts started in parallel all
  // counted from t=0, so one slow multi-page `select("*")` caused every panel to fail together.
  await withTimeout(getActiveListings(), 180_000, "admin listing snapshot");

  const [platformResult, qualityResult, buyerResult, invitesResult, avionicsResult, engineResult, audienceResult] =
    await Promise.allSettled([
      withTimeout(computePlatformStats(), 90_000, "platform stats"),
      withTimeout(computeDataQuality(), 90_000, "data quality"),
      withTimeout(computeBuyerIntelligence(), 90_000, "buyer intelligence"),
      withTimeout(listInvitesWithSessions(), 30_000, "invites"),
      withTimeout(computeAvionicsIntelligence({ days: 90, top: 30 }), 180_000, "avionics intelligence"),
      withTimeout(computeEngineIntelligence(), 90_000, "engine intelligence"),
      withTimeout(computeAdminAudienceMetrics(), 30_000, "admin audience metrics"),
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
  if (engineResult.status === "rejected") {
    console.error("[admin] computeEngineIntelligence failed", engineResult.reason);
  }
  if (audienceResult.status === "rejected") {
    console.error("[admin] computeAdminAudienceMetrics failed", audienceResult.reason);
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
    engineResult.status === "rejected"
      ? `Engine intelligence (${summarizeFailure(engineResult.reason)})`
      : null,
    audienceResult.status === "rejected"
      ? `Audience metrics (${summarizeFailure(audienceResult.reason)})`
      : null,
  ].filter((value): value is string => Boolean(value));

  const platform = platformResult.status === "fulfilled" ? platformResult.value : EMPTY_PLATFORM;
  const dataQuality = qualityResult.status === "fulfilled" ? qualityResult.value : EMPTY_DATA_QUALITY;
  const buyerRaw = buyerResult.status === "fulfilled" ? buyerResult.value : EMPTY_BUYER;
  const buyer = {
    ...buyerRaw,
    admin_inventory_highlights: buyerRaw.admin_inventory_highlights ?? EMPTY_BUYER.admin_inventory_highlights,
  };
  const audience = audienceResult.status === "fulfilled" ? audienceResult.value : EMPTY_AUDIENCE;
  const invites = invitesResult.status === "fulfilled" ? invitesResult.value : EMPTY_INVITES;
  const avionics = avionicsResult.status === "fulfilled" ? avionicsResult.value : EMPTY_AVIONICS;
  const engineIntel = engineResult.status === "fulfilled" ? engineResult.value : EMPTY_ENGINE;

  const avgHighFlipInventoryPct = platform.listings.total_active
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

  const waitlistPendingCount = await fetchWaitlistPendingCountOnly();

  return (
    <main className="p-4 md:p-6">
      <AdminPortalClient
        failedPanels={failedPanels}
        platform={platform}
        dataQuality={dataQuality}
        buyer={buyer}
        invites={invites}
        avionics={avionics}
        engineIntel={engineIntel}
        audience={audience}
        sourceCounts={sourceCounts}
        freshnessBySource={freshnessBySource}
        avgHighFlipInventoryPct={avgHighFlipInventoryPct}
        waitlistPendingCount={waitlistPendingCount}
      />
    </main>
  );
}
