import Link from "next/link";
import { createPrivilegedServerClient } from "@/lib/supabase/server";
import type { DealDeskSeed } from "../types";
import DealDeskPageClient from "./DealDeskPageClient";

type ListingRow = Record<string, unknown>;

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseFlipExplanation(raw: unknown): DealDeskSeed["flipExplanation"] {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as DealDeskSeed["flipExplanation"];
  }
  if (typeof raw === "string") {
    try {
      const v: unknown = JSON.parse(raw);
      return typeof v === "object" && v !== null && !Array.isArray(v)
        ? (v as DealDeskSeed["flipExplanation"])
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function buildAircraftLabel(row: ListingRow | null, listingId: string): string {
  if (!row) return `Listing ${listingId}`;
  const year = asNumber(row.year);
  const make = asString(row.make);
  const model = asString(row.model);
  const nNumber = asString(row.n_number);
  const base = [year ? String(Math.round(year)) : "", make ?? "", model ?? ""].filter(Boolean).join(" ").trim();
  if (base && nNumber) return `${base} — ${nNumber}`;
  if (base) return base;
  return `Listing ${listingId}`;
}

export default async function DealDeskListingPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  const supabase = createPrivilegedServerClient();
  const { data } = await supabase.from("public_listings").select("*").eq("id", listingId).maybeSingle();
  const row = (data ?? null) as ListingRow | null;

  const askingPrice = asNumber(row?.asking_price) ?? 0;
  const deferredMaintenance = asNumber(row?.deferred_total) ?? 0;
  const engineReservePerHour = asNumber(row?.ev_engine_reserve_per_hour) ?? asNumber(row?.engine_reserve_per_hour) ?? null;
  const sourceUrl = asString(row?.listing_url) || asString(row?.source_url) || asString(row?.url) || "";
  const aircraftLabel = buildAircraftLabel(row, listingId);
  const make = asString(row?.make) || "";
  const model = asString(row?.model) || "";
  const daysOnMarket = asNumber(row?.days_on_market);
  const priceReduced =
    typeof row?.price_reduced === "boolean"
      ? row.price_reduced
      : typeof row?.price_reduced === "string"
        ? row.price_reduced.toLowerCase() === "true"
        : null;
  const vsMedianPricePct = asNumber(row?.vs_median_price);
  const isSteamGauge =
    typeof row?.is_steam_gauge === "boolean"
      ? row.is_steam_gauge
      : typeof row?.is_steam_gauge === "string"
        ? row.is_steam_gauge.toLowerCase() === "true"
        : null;
  const hasGlassCockpit =
    typeof row?.has_glass_cockpit === "boolean"
      ? row.has_glass_cockpit
      : typeof row?.has_glass_cockpit === "string"
        ? row.has_glass_cockpit.toLowerCase() === "true"
        : null;
  const riskLevel = asString(row?.risk_level);
  const avionicsScore = asNumber(row?.avionics_score);
  const flipScoreRaw = asNumber(row?.flip_score);
  const flipTierRaw = asString(row?.flip_tier);
  const flipExplanation = parseFlipExplanation(row?.flip_explanation);
  const evPctLifeRemaining = asNumber(row?.ev_pct_life_remaining);
  const faaMatched =
    typeof row?.faa_matched === "boolean"
      ? row.faa_matched
      : typeof row?.faa_matched === "string"
        ? row.faa_matched.toLowerCase() === "true"
        : null;

  const engineScore = asNumber(row?.engine_score);
  const propScore = asNumber(row?.prop_score);
  const llpScore = asNumber(row?.llp_score);
  const pricingConfidence = asString(row?.pricing_confidence);
  const compSelectionTier = asString(row?.comp_selection_tier);
  const compUniverseSize = asNumber(row?.comp_universe_size);
  const compExactCount = asNumber(row?.comp_exact_count);
  const compFamilyCount = asNumber(row?.comp_family_count);
  const compMakeCount = asNumber(row?.comp_make_count);
  const compMedianPrice = asNumber(row?.comp_median_price);
  const compP25Price = asNumber(row?.comp_p25_price);
  const compP75Price = asNumber(row?.comp_p75_price);
  const mispricingZscore = asNumber(row?.mispricing_zscore);
  const evExplanation = asString(row?.ev_explanation);
  const evDataQuality = asString(row?.ev_data_quality);
  const evHoursSmoh = asNumber(row?.ev_hours_smoh);
  const evTboHours = asNumber(row?.ev_tbo_hours);
  const evHoursRemaining = asNumber(row?.ev_hours_remaining);
  const evScoreContribution = asNumber(row?.ev_score_contribution);
  const intelligenceVersion = asString(row?.intelligence_version);
  const hasAccidentHistory =
    typeof row?.has_accident_history === "boolean"
      ? row.has_accident_history
      : typeof row?.has_accident_history === "string"
        ? row.has_accident_history.toLowerCase() === "true"
        : null;
  const accidentCount = asNumber(row?.accident_count);

  return (
    <main className="space-y-3">
      <p className="no-print text-sm">
        <Link href="/internal/deal-desk" className="text-brand-muted hover:text-brand-orange">
          ← Back to Deal Desk
        </Link>
      </p>
      <DealDeskPageClient
        seed={{
          listingId,
          aircraftLabel,
          sourceUrl,
          askingPrice,
          deferredMaintenance,
          engineReservePerHour: engineReservePerHour ?? undefined,
          make,
          model,
          daysOnMarket: daysOnMarket ?? undefined,
          priceReduced: priceReduced ?? undefined,
          vsMedianPricePct: vsMedianPricePct ?? undefined,
          isSteamGauge: isSteamGauge ?? undefined,
          hasGlassCockpit: hasGlassCockpit ?? undefined,
          riskLevel: riskLevel ?? undefined,
          avionicsScore: avionicsScore ?? undefined,
          flipScore: askingPrice > 0 ? flipScoreRaw ?? undefined : undefined,
          flipTier: askingPrice > 0 ? flipTierRaw ?? undefined : undefined,
          flipExplanation: askingPrice > 0 ? flipExplanation ?? undefined : undefined,
          evPctLifeRemaining: evPctLifeRemaining ?? undefined,
          faaMatched: faaMatched ?? undefined,
          engineScore: engineScore ?? undefined,
          propScore: propScore ?? undefined,
          llpScore: llpScore ?? undefined,
          pricingConfidence: pricingConfidence ?? undefined,
          compSelectionTier: compSelectionTier ?? undefined,
          compUniverseSize: compUniverseSize ?? undefined,
          compExactCount: compExactCount ?? undefined,
          compFamilyCount: compFamilyCount ?? undefined,
          compMakeCount: compMakeCount ?? undefined,
          compMedianPrice: compMedianPrice ?? undefined,
          compP25Price: compP25Price ?? undefined,
          compP75Price: compP75Price ?? undefined,
          mispricingZscore: mispricingZscore ?? undefined,
          evExplanation: evExplanation ?? undefined,
          evDataQuality: evDataQuality ?? undefined,
          evHoursSmoh: evHoursSmoh ?? undefined,
          evTboHours: evTboHours ?? undefined,
          evHoursRemaining: evHoursRemaining ?? undefined,
          evScoreContribution: evScoreContribution ?? undefined,
          intelligenceVersion: intelligenceVersion ?? undefined,
          hasAccidentHistory: hasAccidentHistory ?? undefined,
          accidentCount: accidentCount ?? undefined,
        }}
      />
    </main>
  );
}
