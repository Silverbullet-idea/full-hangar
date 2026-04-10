/**
 * Beechcraft model display labels (aligned with `scraper/config.py` BEECHCRAFT_MODEL_DISPLAY_NAMES).
 * Used by listings filter UI (model family + sub-model) and `/api/listings/options`.
 */

export const BEECHCRAFT_MODEL_DISPLAY_NAMES: Record<string, string> = {
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

export function canonicalModelCaseForOptions(_make: string, raw: string): string {
  const m = raw.trim().replace(/\s+/g, " ");
  if (!m) return "";
  const key = m.toLowerCase();
  if (MODEL_CASE_OVERRIDES[key]) return MODEL_CASE_OVERRIDES[key];
  return m
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Full listing model string → display label (sub-model / pair row). */
export function beechcraftPairModelLabel(raw: string): string {
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

/**
 * `deriveModelFamily()` token (e.g. "35", "350", "BARON") → human-readable label for the Model family dropdown.
 * Filter `value` stays the raw token; only the visible label changes.
 */
export function beechcraftFamilyTokenLabel(familyToken: string): string {
  const t = familyToken.trim();
  if (!t) return t;
  const k = t.toLowerCase();
  if (BEECHCRAFT_MODEL_DISPLAY_NAMES[k]) {
    return BEECHCRAFT_MODEL_DISPLAY_NAMES[k];
  }
  if (/^[a-z]{2,}$/i.test(t)) {
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }
  if (/^\d{2,4}$/.test(t)) {
    return `Beechcraft ${t}`;
  }
  return t;
}
