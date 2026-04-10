/**
 * Human-readable labels for FAA Civil Aircraft Registry reference codes.
 * Field definitions align with FAA registry data documentation (e.g. ardata.pdf — Type Engine, Status Code).
 */

/** Single-character status codes on the MASTER registration record. */
const FAA_STATUS_LETTER: Record<string, string> = {
  A: "Triennial mailed — not returned",
  D: "Expired dealer",
  E: "Revoked (enforcement)",
  M: "Manufacturer / dealer certificate",
  N: "Non-citizen corporation (flight hour report)",
  R: "Registration pending",
  S: "Second triennial mailed — not returned",
  T: "Valid (trainee)",
  V: "Valid",
  W: "Ineffective or invalid",
  X: "Enforcement letter",
  Z: "Permanent reserved",
}

/** Numeric / two-digit status codes (MASTER record). */
const FAA_STATUS_NUMERIC: Record<string, string> = {
  "1": "Triennial undeliverable",
  "2": "N-number assigned — not yet registered",
  "3": "Non-type-certificated — not yet registered",
  "4": "Import assigned — not yet registered",
  "5": "Reserved N-number",
  "6": "Administratively canceled",
  "7": "Sale reported",
  "8": "Second triennial — no response",
  "9": "Revoked",
  "10": "Assigned — pending cancellation",
  "11": "Amateur build — pending cancellation",
  "12": "Import — pending cancellation",
  "13": "Registration expired",
  "14": "First notice — re-registration / renewal",
  "15": "Second notice — re-registration / renewal",
  "16": "Expired — pending cancellation",
  "17": "Sale reported — pending cancellation",
  "18": "Sale reported — canceled",
  "19": "Registration pending — pending cancellation",
  "20": "Registration pending — canceled",
  "21": "Revoked — pending cancellation",
  "22": "Revoked — canceled",
  "23": "Expired dealer — pending cancellation",
  "24": "Third notice — re-registration / renewal",
  "25": "First notice — registration renewal",
  "26": "Second notice — registration renewal",
  "27": "Registration expired",
  "28": "Third notice — registration renewal",
  "29": "Expired — pending cancellation",
}

/** ACFTREF / ENGINE REF Type Engine field (numeric string). */
const FAA_ENGINE_TYPE_NUMERIC: Record<string, string> = {
  "0": "None",
  "1": "Piston",
  "2": "Turboprop",
  "3": "Turboshaft",
  "4": "Turbojet",
  "5": "Turbofan",
  "6": "Ramjet",
  "7": "2-stroke",
  "8": "4-stroke",
  "9": "Unknown",
  "10": "Electric",
  "11": "Rotary",
}

/** ACFTREF Type Aircraft field (single character). */
const FAA_TYPE_AIRCRAFT: Record<string, string> = {
  "1": "Glider",
  "2": "Balloon",
  "3": "Blimp / dirigible",
  "4": "Fixed wing — single engine",
  "5": "Fixed wing — multi engine",
  "6": "Rotorcraft",
  "7": "Weight-shift control",
  "8": "Powered parachute",
  "9": "Gyroplane",
  H: "Hybrid lift",
  O: "Other",
}

export function formatFaaRegistrationStatusLabel(code: string | null | undefined): string | null {
  if (code === null || code === undefined) return null
  const trimmed = String(code).trim()
  if (!trimmed) return null
  const upper = trimmed.toUpperCase()
  if (upper.length === 1 && FAA_STATUS_LETTER[upper]) {
    return FAA_STATUS_LETTER[upper]
  }
  if (FAA_STATUS_NUMERIC[trimmed]) {
    return FAA_STATUS_NUMERIC[trimmed]
  }
  if (FAA_STATUS_NUMERIC[upper]) {
    return FAA_STATUS_NUMERIC[upper]
  }
  return trimmed
}

/** Like {@link formatFaaRegistrationStatusLabel} but appends the raw registry code when it differs from the label, e.g. `Valid (V)`. */
export function formatFaaRegistrationStatusWithCode(code: string | null | undefined): string | null {
  if (code === null || code === undefined) return null
  const trimmed = String(code).trim()
  if (!trimmed) return null
  const label = formatFaaRegistrationStatusLabel(code)
  if (!label) return null
  if (label === trimmed) return label
  const paren = trimmed.length === 1 ? trimmed.toUpperCase() : trimmed
  return `${label} (${paren})`
}

export function formatFaaTypeAircraftLabel(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  if (FAA_TYPE_AIRCRAFT[trimmed]) return FAA_TYPE_AIRCRAFT[trimmed]
  if (trimmed.length === 1) {
    const upper = trimmed.toUpperCase()
    if (FAA_TYPE_AIRCRAFT[upper]) return FAA_TYPE_AIRCRAFT[upper]
  }
  return trimmed
}

/** Like {@link formatFaaTypeAircraftLabel} but appends the raw code when mapped, e.g. `Fixed wing — single engine (4)`. */
export function formatFaaTypeAircraftWithCode(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  const label = formatFaaTypeAircraftLabel(raw)
  if (!label) return null
  const mapped =
    FAA_TYPE_AIRCRAFT[trimmed] ?? (trimmed.length === 1 ? FAA_TYPE_AIRCRAFT[trimmed.toUpperCase()] : undefined)
  if (!mapped || mapped !== label) return label
  const code = trimmed.length === 1 ? trimmed.toUpperCase() : trimmed
  return `${label} (${code})`
}

/**
 * Maps FAA `type_engine` reference text (often a digit) plus optional model/manufacturer hints
 * to a short display label for the listing detail FAA panel.
 */
export function formatFaaEngineTypeLabel(
  faaTypeEngine: string | null | undefined,
  engineModel: string | null | undefined,
  engineManufacturer: string | null | undefined
): string | null {
  const model = (engineModel || "").toLowerCase()
  const manufacturer = (engineManufacturer || "").toLowerCase()
  const faaRaw = (faaTypeEngine || "").trim()
  const faa = faaRaw.toLowerCase()

  if (model.includes("rotax") || manufacturer.includes("rotax")) return "Rotax"
  if (faa.includes("rotax")) return "Rotax"

  if (/^\d+$/.test(faaRaw)) {
    const mapped = FAA_ENGINE_TYPE_NUMERIC[faaRaw]
    if (mapped) return mapped
  }

  if (
    faa.includes("recip") ||
    faa.includes("piston") ||
    faa.includes("4 cycle") ||
    faa.includes("4-cycle") ||
    faa.includes("2 cycle") ||
    faa.includes("2-cycle")
  ) {
    return "Piston"
  }

  if (
    faa.includes("turb") ||
    faa.includes("jet") ||
    faa.includes("shaft") ||
    faa.includes("fan") ||
    model.includes("pt6") ||
    model.includes("tpe") ||
    model.includes("m601")
  ) {
    return "Turbine"
  }

  if (faaRaw) return faaRaw
  return null
}

/**
 * Like {@link formatFaaEngineTypeLabel} but appends the numeric FAA code when present, e.g. `Piston (1)` or `Rotax (1)`.
 */
export function formatFaaEngineTypeWithCode(
  faaTypeEngine: string | null | undefined,
  engineModel: string | null | undefined,
  engineManufacturer: string | null | undefined
): string | null {
  const faaRaw = (faaTypeEngine || "").trim()
  const label = formatFaaEngineTypeLabel(faaTypeEngine, engineModel, engineManufacturer)
  if (!label) return null
  if (!/^\d+$/.test(faaRaw)) return label
  if (faaRaw === label) return label
  return `${label} (${faaRaw})`
}
