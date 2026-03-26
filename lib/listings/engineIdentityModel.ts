/** Displayable engine model vs maintenance prose. Aligned with `core/intelligence/engine_identity_model.py`. */

const COMPACT_ENGINE_MODEL_PATTERNS = [
  /\b(?:AE|GO|GIO|HIO|IO|IVO|LIO|LO|LTIO|LTSIO|O|TIO|TO|TSIO|VO)-?\d{3,4}[A-Z0-9-]*\b/,
  /\bR-?\d{3,4}[A-Z0-9-]*\b/,
  /\b(?:PT6A|PT6T|JT15D|PW\d{3,4}[A-Z]?|TPE331|M601|RR300|CF34|FJ44|TFE731|AS907|HTF7700)[A-Z0-9-]*\b/,
]

const PROSE_MARKERS =
  /\b(adapter|cylinder|repaired|repair|pre[-\s]?heat|mags?|magnetos?|\bo\s*\/\s*h\b|overhaul|poplar|reiff|filter|annual|inspection|log\s*book|logbook|since\s+new|ttaf|smoh|spoh)\b/i

const VENDOR_ONLY = new Set([
  "CONTINENTAL",
  "LYCOMING",
  "PRATT & WHITNEY",
  "PRATT AND WHITNEY",
  "ROTAX",
  "CONT MOTOR",
  "TCM",
])

export function extractCompactEngineModel(value: string | null | undefined): string | null {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null
  const upper = raw.toUpperCase()
  for (const pat of COMPACT_ENGINE_MODEL_PATTERNS) {
    const m = pat.exec(upper)
    if (m) {
      const token = m[0].replace(/\//g, "-").trim()
      return token || null
    }
  }
  return null
}

export function isPlausibleEngineModelIdentity(value: string | null | undefined): boolean {
  if (value == null) return false
  const raw = String(value).trim()
  if (!raw) return false
  const upper = raw.toUpperCase()
  const collapsed = upper.replace(/\s+/g, " ").trim()
  if (VENDOR_ONLY.has(collapsed)) return false

  if (extractCompactEngineModel(raw)) return true

  if (raw.length > 44 && PROSE_MARKERS.test(raw)) return false
  if (raw.length > 56) return false

  if (raw.length <= 44) {
    if (!/\d/.test(raw)) return false
    if (collapsed.split(" ").filter(Boolean).length > 5) return false
    if (PROSE_MARKERS.test(raw) && raw.length > 24) return false
    return true
  }

  return false
}
