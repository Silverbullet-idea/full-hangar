"use client";

import { useEffect, useState } from "react";
import DealDeskCalculator, { type DealDeskScenarioWithContext, type DealDeskSeed } from "../components/DealDeskCalculator";

export default function DealDeskPageClient({ seed }: { seed: DealDeskSeed }) {
  const [loading, setLoading] = useState(true);
  const [initialScenario, setInitialScenario] = useState<DealDeskScenarioWithContext | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/internal/deal-desk?listing_id=${encodeURIComponent(seed.listingId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as DealDeskScenarioWithContext[];
      })
      .then((rows) => {
        if (!active) return;
        setInitialScenario(Array.isArray(rows) && rows.length > 0 ? rows[0] : null);
      })
      .catch(() => {
        if (!active) return;
        setInitialScenario(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [seed.listingId]);

  if (loading) {
    return (
      <div className="rounded border border-brand-dark bg-card-bg p-4 text-sm text-brand-muted">
        Loading Deal Desk scenario...
      </div>
    );
  }

  return <DealDeskCalculator seed={seed} initialScenario={initialScenario} />;
}
