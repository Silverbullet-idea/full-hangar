import { computeDataQuality } from "@/lib/admin/analytics";
import DataQualityClient from "./DataQualityClient";

export const dynamic = "force-dynamic";

export default async function DataQualityPage() {
  const payload = await computeDataQuality();
  return (
    <DataQualityClient
      totalActiveListings={payload.total_active_listings}
      sourceCount={payload.source_stats.length}
      overallCompletenessPct={payload.overall_completeness_pct}
      fieldStats={payload.field_stats}
      sourceStats={payload.source_stats}
      distribution={payload.completeness_distribution}
      recommendations={payload.recommendations}
    />
  );
}
