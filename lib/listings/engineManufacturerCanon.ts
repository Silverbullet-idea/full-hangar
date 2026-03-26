/** Canonical display names for engine manufacturers (FAA ref abbreviations, legacy tokens). Aligned with `core/intelligence/engine_manufacturer_canon.py`. */

const ENGINE_MANUFACTURER_CANON: Record<string, string> = {
  "CONT MOTOR": "Continental",
  "CONTINENTAL MOTORS": "Continental",
  "CONTINENTAL MOTORS INC": "Continental",
  CONTINENTAL: "Continental",
  TCM: "Continental",
  "TELEDYNE CONTINENTAL": "Continental",
  "TELEDYNE CONTINENTAL MOTORS": "Continental",
  "LYCOMING ENGINES": "Lycoming",
  LYCOMING: "Lycoming",
  "PRATT WHITNEY": "Pratt & Whitney",
  "PRATT AND WHITNEY": "Pratt & Whitney",
  "PRATT & WHITNEY": "Pratt & Whitney",
  PWC: "Pratt & Whitney",
  "P W C": "Pratt & Whitney",
  ROTAX: "Rotax",
  "BOMBARDIER ROTAX": "Rotax",
  WILLIAMS: "Williams International",
  "WILLIAMS INTERNATIONAL": "Williams International",
}

function normalizeMfrKey(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeEngineManufacturerDisplay(value: string | null | undefined): string | null {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null
  const key = normalizeMfrKey(raw)
  if (ENGINE_MANUFACTURER_CANON[key]) return ENGINE_MANUFACTURER_CANON[key]
  const padded = ` ${key} `
  for (const [abbrev, label] of Object.entries(ENGINE_MANUFACTURER_CANON)) {
    if (
      key === abbrev ||
      key.startsWith(`${abbrev} `) ||
      key.endsWith(` ${abbrev}`) ||
      padded.includes(` ${abbrev} `)
    ) {
      return label
    }
  }
  return raw
}
