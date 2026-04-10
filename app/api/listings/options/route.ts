import { NextResponse } from "next/server";
import { getListingFilterOptionsClientPayload } from "../../../../lib/db/listingsRepository";

export const revalidate = 86400;
import type { ListingsFilterOptionsClientShape } from "../../../../lib/listings/filterOptionsAggregate";
import {
  beechcraftPairModelLabel,
  canonicalModelCaseForOptions,
} from "../../../../lib/listings/beechcraftDisplayNames";

function enhanceListingFilterOptions(
  data: ListingsFilterOptionsClientShape
): ListingsFilterOptionsClientShape & { modelPairLabels: Record<string, string> } {
  const pairDedupe = new Map<string, { make: string; model: string }>();
  const pairCountByDedupe = new Map<string, number>();

  for (const [pairKey, c] of Object.entries(data.modelPairCounts)) {
    const sep = pairKey.indexOf("|||");
    if (sep < 0) continue;
    const mk = pairKey.slice(0, sep);
    const md = pairKey.slice(sep + 3);
    const dk = `${mk.toLowerCase()}|||${md.toLowerCase()}`;
    pairCountByDedupe.set(dk, (pairCountByDedupe.get(dk) ?? 0) + c);
    if (!pairDedupe.has(dk)) {
      pairDedupe.set(dk, { make: mk, model: canonicalModelCaseForOptions(mk, md) });
    }
  }

  const modelPairs = Array.from(pairDedupe.values()).sort(
    (a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model)
  );

  const modelPairCounts: Record<string, number> = {};
  for (const p of modelPairs) {
    const dk = `${p.make.toLowerCase()}|||${p.model.toLowerCase()}`;
    const n = pairCountByDedupe.get(dk);
    if (n !== undefined) {
      modelPairCounts[`${p.make}|||${p.model}`] = n;
    }
  }

  const modelCountMerge = new Map<string, { display: string; count: number }>();
  for (const [k, c] of Object.entries(data.modelCounts)) {
    const lk = k.toLowerCase();
    const display = canonicalModelCaseForOptions("", k);
    const cur = modelCountMerge.get(lk);
    if (!cur) {
      modelCountMerge.set(lk, { display, count: c });
    } else {
      cur.count += c;
    }
  }
  const modelCounts: Record<string, number> = {};
  const models: string[] = [];
  for (const { display, count } of modelCountMerge.values()) {
    modelCounts[display] = (modelCounts[display] ?? 0) + count;
    models.push(display);
  }
  models.sort((a, b) => a.localeCompare(b));

  const modelPairLabels: Record<string, string> = {};
  for (const p of modelPairs) {
    if (p.make.toLowerCase() !== "beechcraft") continue;
    const label = beechcraftPairModelLabel(p.model);
    if (label !== p.model) {
      modelPairLabels[`${p.make}|||${p.model}`] = label;
    }
  }

  return {
    ...data,
    models,
    modelCounts,
    modelPairs,
    modelPairCounts,
    modelPairLabels,
  };
}

export async function GET() {
  const startedAt = Date.now();
  try {
    const raw = await getListingFilterOptionsClientPayload();
    const data = enhanceListingFilterOptions(raw);
    const elapsedMs = Date.now() - startedAt;
    return NextResponse.json(
      { data, error: null },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
          "X-Response-Time-Ms": String(elapsedMs),
        },
      }
    );
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    return NextResponse.json(
      {
        data: {
          makes: [],
          models: [],
          states: [],
          modelPairs: [],
          makeCounts: {},
          modelCounts: {},
          modelPairCounts: {},
          modelPairLabels: {},
          sourceCounts: {},
          dealTierCounts: {
            all: 0,
            TOP_DEALS: 0,
            HOT: 0,
            GOOD: 0,
            FAIR: 0,
            PASS: 0,
          },
          minimumValueScoreCounts: { any: 0, "60": 0, "80": 0 },
        },
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: { "X-Response-Time-Ms": String(elapsedMs) } }
    );
  }
}
