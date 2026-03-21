import Link from "next/link";
import { createPrivilegedServerClient } from "@/lib/supabase/server";
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

  return (
    <main className="space-y-3">
      <p className="text-sm">
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
        }}
      />
    </main>
  );
}
