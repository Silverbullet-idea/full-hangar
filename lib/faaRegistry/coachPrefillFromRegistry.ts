import type { SupabaseClient } from "@supabase/supabase-js"
import { engineModelMap } from "../dealCoach/engineModelMap"
import { modelMap } from "../dealCoach/modelMap"

export type FaaCoachPrefill = {
  registration: string
  serialNumber?: string
  year?: number
  make?: string
  model?: string
  engineMake?: string
  engineModel?: string
  engineCount?: number
  location?: string
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (v == null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return undefined
}

function pickNum(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (v == null) continue
    const n = typeof v === "number" ? v : parseInt(String(v), 10)
    if (Number.isFinite(n) && n >= 1900 && n <= 2035) return n
  }
  return undefined
}

/** Alphanumeric uppercase for comparison */
export function compactN(s: string): string {
  return String(s).replace(/[^A-Za-z0-9]/g, "").toUpperCase()
}

/** Prefix used for ilike (ensure leading N for US-style typing) */
export function normalizeNPrefix(raw: string): string {
  const c = compactN(raw)
  if (!c) return ""
  if (c.startsWith("N")) return c
  return `N${c}`
}

export function nNumberEqCandidates(raw: string): string[] {
  const c = compactN(raw)
  if (!c) return []
  const out: string[] = []
  const seen = new Set<string>()
  const add = (x: string) => {
    if (!x || seen.has(x)) return
    seen.add(x)
    out.push(x)
  }
  if (c.startsWith("N")) {
    add(c)
    add(c.slice(1))
    const rest = c.slice(1)
    const digitRun = rest.match(/^(\d+)/)?.[1] ?? ""
    if (digitRun) {
      const stripped = digitRun.replace(/^0+/, "") || "0"
      if (stripped !== digitRun) {
        add(`N${stripped}${rest.slice(digitRun.length)}`)
        add(`${stripped}${rest.slice(digitRun.length)}`)
      }
    }
  } else {
    add(`N${c}`)
    add(c)
  }
  return out
}

function mapMfrToCoachMake(mfr: string | undefined): string | undefined {
  if (!mfr) return undefined
  const u = mfr.toUpperCase()
  if (u.includes("CESSNA")) return "Cessna"
  if (u.includes("PIPER")) return "Piper"
  if (u.includes("BEECH")) return "Beechcraft"
  if (u.includes("MOONEY")) return "Mooney"
  if (u.includes("GRUMMAN") || u.includes("AMERICAN GENERAL")) return "Grumman"
  if (u.includes("CIRRUS")) return "Cirrus"
  if (u.includes("DIAMOND")) return "Diamond"
  if (u.includes("CHAMPION") || u.includes("AMERICAN CHAMPION")) return "American Champion"
  if (u.includes("KITFOX")) return "Kitfox"
  return undefined
}

function mapEngMfrToCoach(mfr: string | undefined): string | undefined {
  if (!mfr) return undefined
  const u = mfr.toUpperCase()
  if (u.includes("LYCOMING")) return "Lycoming"
  if (u.includes("CONTINENTAL") || u.includes("TELEDYNE")) return "Continental"
  if (u.includes("ROTAX")) return "Rotax"
  if (u.includes("PRATT") || u.includes("P&W") || u.includes("CANADA")) return "Pratt & Whitney Canada"
  if (u.includes("HONEYWELL") || u.includes("GARRETT")) return "Honeywell (Garrett)"
  if (u.includes("ROLLS") || u.includes("ALLISON")) return "Rolls-Royce (Allison)"
  return undefined
}

function bestCoachModel(make: string, faaModel: string | undefined): string | undefined {
  if (!faaModel) return undefined
  const opts = modelMap[make]
  if (!opts?.length) return undefined
  const n = faaModel.trim().toUpperCase().replace(/\s+/g, " ")
  for (const o of opts) {
    if (o.toUpperCase() === n) return o
  }
  for (const o of opts) {
    const ou = o.toUpperCase()
    if (n.includes(ou) || ou.includes(n)) return o
  }
  const nCompact = n.replace(/\s|-/g, "")
  for (const o of opts) {
    const oc = o.toUpperCase().replace(/\s|-/g, "")
    if (oc === nCompact) return o
  }
  return undefined
}

function bestEngineModel(coachMfr: string, engName: string | undefined): string | undefined {
  if (!engName) return undefined
  const opts = engineModelMap[coachMfr]
  if (!opts?.length) return undefined
  const n = engName.trim().toUpperCase()
  for (const o of opts) {
    if (o.toUpperCase() === n) return o
  }
  for (const o of opts) {
    const ou = o.toUpperCase().replace(/\s|-/g, "")
    const nu = n.replace(/\s|-/g, "")
    if (nu.includes(ou) || ou.includes(nu)) return o
  }
  return undefined
}

export async function buildFaaCoachPrefill(
  supabase: SupabaseClient,
  registry: Record<string, unknown>
): Promise<FaaCoachPrefill | null> {
  const nRaw = pickStr(registry, ["n_number", "n_number_normalized"])
  if (!nRaw) return null
  const registration = nRaw.toUpperCase().startsWith("N") ? nRaw.toUpperCase() : `N${compactN(nRaw).replace(/^N/, "")}`

  const mfrCode = pickStr(registry, ["mfr_mdl_code", "mfr_model_code"])
  const engCode = pickStr(registry, ["eng_mfr_mdl_code", "eng_mfr_mdl"])

  let aircraftRef: Record<string, unknown> | null = null
  let engineRef: Record<string, unknown> | null = null

  if (mfrCode) {
    const { data } = await supabase.from("faa_aircraft_ref").select("*").eq("mfr_mdl_code", mfrCode).limit(1).maybeSingle()
    if (data && typeof data === "object") aircraftRef = data as Record<string, unknown>
  }
  if (engCode) {
    const { data } = await supabase.from("faa_engine_ref").select("*").eq("eng_mfr_mdl_code", engCode).limit(1).maybeSingle()
    if (data && typeof data === "object") engineRef = data as Record<string, unknown>
  }

  const mfrName = pickStr(aircraftRef ?? {}, ["mfr_name"]) ?? pickStr(registry, ["aircraft_mfr", "manufacturer"])
  const modelName = pickStr(aircraftRef ?? {}, ["model_name"]) ?? pickStr(registry, ["model_name", "aircraft_model"])
  const coachMake = mapMfrToCoachMake(mfrName) ?? (modelName ? mapMfrToCoachMake(modelName) : undefined)
  const coachModel = coachMake ? bestCoachModel(coachMake, modelName) : undefined

  const engMfrName = pickStr(engineRef ?? {}, ["eng_mfr_name"]) ?? pickStr(registry, ["engine_manufacturer", "eng_mfr_name"])
  const engModelName = pickStr(engineRef ?? {}, ["eng_model_name"]) ?? pickStr(registry, ["engine_model", "eng_model_name"])
  const coachEngMake = mapEngMfrToCoach(engMfrName)
  const coachEngModel = coachEngMake ? bestEngineModel(coachEngMake, engModelName) : undefined

  const numEngines = aircraftRef?.num_engines
  const engineCount =
    typeof numEngines === "number" && Number.isFinite(numEngines) && numEngines >= 2 ? 2 : 1

  const city = pickStr(registry, ["city"])
  const state = pickStr(registry, ["state"])
  const location = [city, state].filter(Boolean).join(", ") || undefined

  const year = pickNum(registry, ["year_mfr", "year_manufactured", "aircraft_year", "year"])

  const serial = pickStr(registry, ["serial_number", "serial_no", "serial"])

  return {
    registration,
    serialNumber: serial,
    year,
    make: coachMake,
    model: coachModel,
    engineMake: coachEngMake,
    engineModel: coachEngModel,
    engineCount,
    location,
  }
}
