import { NextResponse } from "next/server";
import { getListingFilterOptionsClientPayload } from "../../../../lib/db/listingsRepository";
import type { ListingsFilterOptionsClientShape } from "../../../../lib/listings/filterOptionsAggregate";

/** Mirrors `scraper/config.py` BEECHCRAFT_MODEL_DISPLAY_NAMES for sub-model filter labels (API-only). */
const BEECHCRAFT_MODEL_DISPLAY_NAMES: Record<string, string> = {
  "17": "Staggerwing (Model 17)",
  d17s: "Staggerwing D17S",
  "18": "Model 18 (Twin Beech)",
  c18s: "Model 18C",
  d18s: "Model 18D",
  h18: "Model 18H",
  "19": "Musketeer Sport 19",
  "23": "Musketeer 23",
  "24": "Musketeer Super / Sierra",
  a24r: "Sierra A24R",
  "33": "Bonanza 33 (Debonair)",
  "35": "Bonanza 35 (V-Tail)",
  "36": "Bonanza 36",
  a36: "Bonanza A36",
  b36tc: "Bonanza B36TC",
  a36tc: "Bonanza A36TC",
  v35: "Bonanza V35",
  v35b: "Bonanza V35B",
  f33a: "Bonanza F33A",
  "55": "Baron 55",
  "56": "Baron 56TC",
  "58": "Baron 58",
  "58p": "Baron 58P (Pressurized)",
  "58tc": "Baron 58TC",
  baron: "Baron",
  "60": "Duke 60",
  "65": "Queen Air 65",
  "70": "Queen Air 70",
  "80": "Queen Air 80",
  "88": "Queen Air 88",
  "76": "Duchess 76",
  "90": "King Air 90",
  a90: "King Air A90",
  b90: "King Air B90",
  c90: "King Air C90",
  c90a: "King Air C90A",
  c90b: "King Air C90B",
  c90gt: "King Air C90GT",
  c90gtx: "King Air C90GTX",
  e90: "King Air E90",
  f90: "King Air F90",
  "f90-1": "King Air F90-1",
  "100": "King Air 100",
  a100: "King Air A100",
  b100: "King Air B100",
  "200": "King Air 200",
  a200: "King Air A200",
  b200: "King Air B200",
  b200gt: "King Air B200GT",
  b200gtr: "King Air B200GTR",
  "250": "King Air 250",
  "260": "King Air 260",
  "300": "King Air 300",
  "300lw": "King Air 300LW",
  "350": "King Air 350",
  "350er": "King Air 350ER",
  "350i": "King Air 350i",
  "360": "King Air 360",
  "360er": "King Air 360ER",
  "1900": "1900 Airliner",
  "1900c": "1900C Airliner",
  "1900d": "1900D Airliner",
};

const MODEL_CASE_OVERRIDES: Record<string, string> = {
  "king air c90gtx": "King Air C90GTX",
  "king air c90gt": "King Air C90GT",
  "king air b200gt": "King Air B200GT",
  "king air b200gtr": "King Air B200GTR",
  "king air 350er": "King Air 350ER",
  "king air 350ier": "King Air 350iER",
  g1000: "G1000",
  g600: "G600",
  gfc500: "GFC500",
};

function canonicalModelCase(_make: string, raw: string): string {
  const m = raw.trim().replace(/\s+/g, " ");
  if (!m) return "";
  const key = m.toLowerCase();
  if (MODEL_CASE_OVERRIDES[key]) return MODEL_CASE_OVERRIDES[key];
  return m
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function beechcraftModelLabel(raw: string): string {
  const norm = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (BEECHCRAFT_MODEL_DISPLAY_NAMES[norm]) {
    return BEECHCRAFT_MODEL_DISPLAY_NAMES[norm];
  }
  const parts = norm.split(/\s+/);
  const last = parts[parts.length - 1] ?? norm;
  if (BEECHCRAFT_MODEL_DISPLAY_NAMES[last]) {
    return BEECHCRAFT_MODEL_DISPLAY_NAMES[last];
  }
  return raw.trim();
}

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
      pairDedupe.set(dk, { make: mk, model: canonicalModelCase(mk, md) });
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
    const display = canonicalModelCase("", k);
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
    const label = beechcraftModelLabel(p.model);
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
          "Cache-Control": "s-maxage=300, stale-while-revalidate=900",
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
