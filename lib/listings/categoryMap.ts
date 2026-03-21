/**
 * Maps `/listings?category=` URL params to `aircraft_type` values stored on `aircraft_listings`
 * (exposed on `public_listings` after migration). Scrapers use a mix of canonical and legacy
 * tokens (e.g. TAP `piston_single` vs Barnstormers `single_engine_piston`).
 */
export const CATEGORY_PARAM_TO_DB: Record<
  "single" | "multi" | "jet" | "helicopter" | "lsp" | "sea",
  string[]
> = {
  single: ["single_engine_piston", "piston_single", "single_piston"],
  multi: [
    "multi_engine_piston",
    "piston_multi",
    "twin_piston",
    "twin_engine_piston",
  ],
  jet: ["jet"],
  helicopter: ["helicopter", "rotorcraft"],
  lsp: ["light_sport", "light_sport_aircraft", "lsa", "ultralight"],
  sea: ["amphibious_float", "amphibian", "float_plane", "seaplane"],
};
