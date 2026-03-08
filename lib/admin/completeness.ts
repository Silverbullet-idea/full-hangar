export type CompletenessWeight = "critical" | "high" | "medium";

export type CompletenessField = {
  field: string;
  category: string;
  weight: CompletenessWeight;
  parser_hint: string;
};

export const COMPLETENESS_FIELDS: CompletenessField[] = [
  { field: "year", category: "Identity", weight: "critical", parser_hint: "listing title and spec table" },
  { field: "make", category: "Identity", weight: "critical", parser_hint: "listing title" },
  { field: "model", category: "Identity", weight: "critical", parser_hint: "listing title" },
  { field: "n_number", category: "Identity", weight: "critical", parser_hint: "FAA N-number field in listing" },
  { field: "serial_number", category: "Identity", weight: "high", parser_hint: "serial number / S/N field in spec table" },
  { field: "price", category: "Pricing", weight: "critical", parser_hint: "listing header price field" },
  { field: "price_reduced", category: "Pricing", weight: "critical", parser_hint: "price history / reduced tag parsing" },
  { field: "total_time", category: "Hours", weight: "high", parser_hint: "TT, TTAF, Total Time keywords" },
  { field: "smoh", category: "Hours", weight: "high", parser_hint: "SMOH, Since Major, Since OH keywords" },
  { field: "snew", category: "Hours", weight: "medium", parser_hint: "SNEW, Since New keywords" },
  { field: "stoh", category: "Hours", weight: "medium", parser_hint: "STOH, prop overhaul keywords" },
  { field: "spoh", category: "Hours", weight: "medium", parser_hint: "SPOH keywords in engine/prop section" },
  { field: "engine_make", category: "Powerplant", weight: "high", parser_hint: "Lycoming/Continental/Rotax in title or specs" },
  { field: "engine_model", category: "Powerplant", weight: "high", parser_hint: "engine model number from spec table" },
  { field: "engine_count", category: "Powerplant", weight: "high", parser_hint: "FAA or spec table engine count" },
  { field: "has_ads_b", category: "Avionics", weight: "medium", parser_hint: "ADS-B keyword in description or spec" },
  { field: "has_waas", category: "Avionics", weight: "medium", parser_hint: "WAAS keyword in avionics section" },
  { field: "has_autopilot", category: "Avionics", weight: "medium", parser_hint: "autopilot, A/P, KAP140, GFC keywords" },
  { field: "has_glass_panel", category: "Avionics", weight: "medium", parser_hint: "glass panel, G1000, Aspen keywords" },
  { field: "avionics_notes", category: "Avionics", weight: "medium", parser_hint: "avionics section of description" },
  { field: "paint_score", category: "Condition", weight: "medium", parser_hint: "paint score, fresh paint, X/10 paint keywords" },
  { field: "interior_score", category: "Condition", weight: "medium", parser_hint: "interior score, X/10 interior keywords" },
  { field: "condition_notes", category: "Condition", weight: "medium", parser_hint: "condition section of listing description" },
  { field: "city", category: "Location", weight: "medium", parser_hint: "location field or listing header" },
  { field: "state", category: "Location", weight: "medium", parser_hint: "state from location field" },
  { field: "primary_image_url", category: "Media", weight: "medium", parser_hint: "first listing image" },
  { field: "image_urls", category: "Media", weight: "medium", parser_hint: "gallery image extraction from detail page" },
  { field: "faa_matched", category: "FAA", weight: "high", parser_hint: "run enrich_faa.py after scraping" },
  { field: "registered_owner", category: "FAA", weight: "high", parser_hint: "populated by enrich_faa.py owner fields" },
  { field: "cert_issue_date", category: "FAA", weight: "high", parser_hint: "FAA certificate date enrichment" },
  { field: "value_score", category: "Intelligence", weight: "high", parser_hint: "run backfill_scores.py" },
  { field: "intelligence_version", category: "Intelligence", weight: "high", parser_hint: "scoring engine version tag persistence" },
  { field: "score_explanation", category: "Intelligence", weight: "medium", parser_hint: "populated by scoring engine" },
  { field: "days_on_market", category: "Market", weight: "medium", parser_hint: "first_seen/last_seen delta calculation" },
  { field: "market_comp_count", category: "Market", weight: "medium", parser_hint: "run compute_market_comps.py" },
  { field: "estimated_market_value", category: "Market", weight: "medium", parser_hint: "market comps valuation output" },
];

export function getRecommendationLevel(weight: CompletenessWeight, fillPct: number): "critical" | "high" | "medium" | null {
  if (weight === "critical" && fillPct < 60) return "critical";
  if (weight === "high" && fillPct < 60) return "high";
  if (weight === "medium" && fillPct < 40) return "medium";
  return null;
}
