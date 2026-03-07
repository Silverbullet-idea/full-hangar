import type { ReactNode } from "react"
import { safeDisplay, type UnknownRow } from "./detailUtils"

export type ParsedSellerDescription = {
  condition: string | null
  totalTimeAirframe: number | null
  engineSmoh: number | null
  engineTbo: number | null
  engineModel: string | null
  cylindersSinceNewHours: number | null
  hoursSinceIran: number | null
  lastAnnualInspection: string | null
  avionics: string | null
  avionicsList: string[]
  avionicsDisplayLines: string[]
  airworthy: string | null
}

type ParsedDescriptionIntelligence = {
  pricingContext: {
    isFractional: boolean
    shareNumerator: number | null
    shareDenominator: number | null
    sharePercent: number | null
    sharePrice: number | null
    normalizedFullPrice: number | null
    reviewNeeded: boolean
    evidence: string[]
  }
  engineModel: string | null
  times: {
    totalTime: number | null
    engineSmoh: number | null
    engineTbo: number | null
  }
  maintenance: {
    cylindersSinceNewHours: number | null
    hoursSinceIran: number | null
    lastAnnualInspection: string | null
  }
  avionics: string[]
}

export function parseSellerDescription(description: string | null | undefined): ParsedSellerDescription {
  const text = typeof description === "string" ? description : ""
  if (!text.trim()) {
    return {
      condition: null,
      totalTimeAirframe: null,
      engineSmoh: null,
      engineTbo: null,
      engineModel: null,
      cylindersSinceNewHours: null,
      hoursSinceIran: null,
      lastAnnualInspection: null,
      avionics: null,
      avionicsList: [],
      avionicsDisplayLines: [],
      airworthy: null,
    }
  }

  const condition = cleanParsedText(
    captureLabeledValue(text, ["Condition"]) ||
    captureFirstMatch(text, /\b(like new|excellent|very good|good|fair|used)\s+condition\b/i, 0)
  )

  const totalTimeAirframe = parseNumberToken(
    captureLabeledValue(text, ["Total Time", "Total Time Since New", "AFTT", "TTAF"]) ||
    captureFirstMatch(text, /\b(?:total\s*time(?:\s*since\s*new)?|ttaf|aftt|tt)\s*[:\-]?\s*([\d,]{2,7})\b/i, 1) ||
    captureFirstMatch(text, /\b([\d,]{2,7})\s*(?:ttaf|tt)\b/i, 1)
  )

  const engineSmoh = parseNumberToken(
    captureLabeledValue(text, ["SMOH", "TSMOH", "STOH", "Engine 1 Time", "Engine Time"]) ||
    captureFirstMatch(text, /\b(?:smoh|tsmoh|stoh|engine\s*1?\s*time|time\s*since\s*(?:major\s*)?overhaul)\s*[:\-]?\s*([\d,]{2,7})\b/i, 1)
  )

  const engineTbo = parseNumberToken(
    captureLabeledValue(text, ["Engine TBO", "TBO"]) ||
    captureFirstMatch(text, /\b(?:engine\s*tbo|tbo)\s*[:\-]?\s*([\d,]{3,6})\b/i, 1) ||
    captureFirstMatch(text, /\b([\d,]{3,6})\s*(?:hours?|hrs?)\s*tbo\b/i, 1)
  )

  const engineModel = cleanParsedText(
    captureLabeledValue(text, ["Engine Model", "Engine", "Powerplant"]) ||
    captureFirstMatch(text, /\b(Lycoming|Continental|Pratt\s*&\s*Whitney|Rotax)\b[^\n.;]{0,120}/i, 0) ||
    captureFirstMatch(text, /\b((?:TSIO|TIO|IO|O|AEIO|GO|LTSIO|PT6A|RR)\-?[A-Z0-9]{2,}(?:\-[A-Z0-9]{1,4})?)\b/i, 1)
  )
  const cylindersSinceNewHours = parseNumberToken(
    captureFirstMatch(text, /\b([\d,]{1,6})\s*(?:hours?|hrs?)\s+since\s+new\s+cylinders?\b/i, 1)
  )
  const hoursSinceIran = parseNumberToken(
    captureFirstMatch(text, /\b([\d,]{1,6})\s*(?:hours?|hrs?)\s+since\s+IRAN\b/i, 1)
  )
  const lastAnnualInspection = parseMonthYear(
    captureFirstMatch(text, /\bannual(?:\s+inspection)?\s*[:\-]?\s*(?:completed\s*)?(?:in\s*)?([A-Za-z]{3,9}\s+\d{4})\b/i, 1)
  ) || cleanParsedText(captureFirstMatch(text, /\bannual(?:\s+inspection)?\s*[:\-]?\s*(\d{1,2}\/\d{4})\b/i, 1))

  const avionicsSectionLines = extractSectionLines(text, ["Avionics / Equipment", "Avionics"])
  const labeledAvionics = cleanParsedText(captureLabeledValue(text, ["Avionics", "Avionics/Equipment"]))
  const avionicsList = mergeAvionicsItems(
    parseAvionicsLineItems(avionicsSectionLines.join(" ")),
    parseAvionicsLineItems(labeledAvionics)
  )
  const avionicsDisplayLines = extractAvionicsDisplayLines(text, avionicsSectionLines, labeledAvionics)
  const avionics = avionicsList.length
    ? avionicsList.join(" | ")
    : cleanParsedText(extractSectionContent(text, ["Avionics / Equipment", "Avionics"]) || labeledAvionics)

  const airworthy = cleanParsedText(
    captureLabeledValue(text, ["Airworthy"]) ||
    (() => {
      const low = text.toLowerCase()
      if (low.includes("not airworthy")) return "No"
      if (low.includes("airworthy")) return "Yes"
      return null
    })()
  )

  return {
    condition,
    totalTimeAirframe,
    engineSmoh,
    engineTbo,
    engineModel: cleanEngineModelText(engineModel),
    cylindersSinceNewHours,
    hoursSinceIran,
    lastAnnualInspection,
    avionics,
    avionicsList,
    avionicsDisplayLines,
    airworthy,
  }
}

export function cleanEngineModelText(value: string | null | undefined): string | null {
  const clean = cleanParsedText(value || null)
  if (!clean) return null
  const explicitMakeModel = /\bengine\s*make\s*:\s*([A-Za-z&/.\-\s]+?)\s+model\s*:\s*([A-Za-z0-9\-\/]+)/i.exec(clean)
  if (explicitMakeModel?.[1] && explicitMakeModel?.[2]) {
    const make = explicitMakeModel[1].replace(/\s+/g, " ").trim()
    const model = explicitMakeModel[2].replace(/\s+/g, " ").trim()
    return `${make} ${model}`.trim()
  }
  const cutMarkers = [
    /\s[-|]\s*\d{2,7}\s*(?:tt|hours?|hrs?)\b/i,
    /\b\d{2,7}\s*tt(?:af)?\b/i,
    /\bsince\s+new\b/i,
    /\bengines?\s*\/\s*mods?\s*\/\s*prop\b/i,
    /\bengine\s*make\s*:\b/i,
    /\bannual(?:\s+inspection)?\b/i,
    /\bavionics\b/i,
    /\badditional\s+equipment\b/i,
    /\bexceptional\s+features\b/i,
    /\bupgrades?\b/i,
    /\badvanced\s+garmin\b/i,
    /\bgarmin\b/i,
  ]

  let end = clean.length
  for (const marker of cutMarkers) {
    const match = marker.exec(clean)
    if (match && match.index > 8) {
      end = Math.min(end, match.index)
    }
  }

  let trimmed = clean.slice(0, end).trim().replace(/[\s\-:;,]+$/, "")
  if (trimmed.length > 110) {
    trimmed = trimmed.slice(0, 110).trim().replace(/[\s\-:;,]+$/, "")
  }
  return trimmed || null
}

export function inferEngineManufacturerFromModel(engineModel: string | null): string | null {
  const value = cleanParsedText(engineModel)
  if (!value) return null
  const lowered = value.toLowerCase()
  if (lowered.includes("continental")) return "Continental"
  if (lowered.includes("lycoming")) return "Lycoming"
  if (lowered.includes("pratt") || lowered.includes("pt6")) return "Pratt & Whitney"
  if (lowered.includes("rotax")) return "Rotax"
  if (lowered.includes("rolls-royce") || lowered.includes("rolls royce") || lowered.startsWith("rr")) return "Rolls-Royce"
  return null
}

export function parseDescriptionIntelligence(row: UnknownRow): ParsedDescriptionIntelligence {
  const emptyValue: ParsedDescriptionIntelligence = {
    pricingContext: {
      isFractional: false,
      shareNumerator: null,
      shareDenominator: null,
      sharePercent: null,
      sharePrice: null,
      normalizedFullPrice: null,
      reviewNeeded: false,
      evidence: [],
    },
    engineModel: null,
    times: { totalTime: null, engineSmoh: null, engineTbo: null },
    maintenance: { cylindersSinceNewHours: null, hoursSinceIran: null, lastAnnualInspection: null },
    avionics: [],
  }
  const rawValue = row?.description_intelligence
  if (!rawValue) return emptyValue

  let parsed: unknown = rawValue
  if (typeof rawValue === "string") {
    try {
      parsed = JSON.parse(rawValue)
    } catch {
      return emptyValue
    }
  }
  if (!parsed || typeof parsed !== "object") return emptyValue

  const parsedRecord = parsed as Record<string, unknown>
  const avionicsRaw = parsedRecord.avionics

  const avionics = Array.isArray(avionicsRaw)
    ? avionicsRaw
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : []

  const engine = parsedRecord.engine as Record<string, unknown> | undefined
  const times = parsedRecord.times as Record<string, unknown> | undefined
  const maintenance = parsedRecord.maintenance as Record<string, unknown> | undefined
  const pricingContext = parsedRecord.pricing_context as Record<string, unknown> | undefined

  const engineModel = cleanEngineModelText(
    typeof engine?.model === "string" ? engine.model : null
  )

  return {
    pricingContext: {
      isFractional: pricingContext?.is_fractional === true,
      shareNumerator: toFiniteNumber(pricingContext?.share_numerator),
      shareDenominator: toFiniteNumber(pricingContext?.share_denominator),
      sharePercent: toFiniteNumber(pricingContext?.share_percent),
      sharePrice: toFiniteNumber(pricingContext?.share_price),
      normalizedFullPrice: toFiniteNumber(pricingContext?.normalized_full_price),
      reviewNeeded: pricingContext?.review_needed === true,
      evidence: Array.isArray(pricingContext?.evidence)
        ? pricingContext.evidence
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean)
        : [],
    },
    engineModel,
    times: {
      totalTime: toFiniteNumber(times?.total_time),
      engineSmoh: toFiniteNumber(times?.engine_smoh),
      engineTbo: toFiniteNumber(times?.engine_tbo),
    },
    maintenance: {
      cylindersSinceNewHours: toFiniteNumber(maintenance?.cylinders_since_new_hours ?? times?.cylinders_since_new_hours),
      hoursSinceIran: toFiniteNumber(maintenance?.hours_since_iran ?? times?.hours_since_iran),
      lastAnnualInspection: cleanParsedText(
        typeof maintenance?.last_annual_inspection === "string" ? maintenance.last_annual_inspection : null
      ),
    },
    avionics: Array.from(new Set(avionics)),
  }
}

export function mergeAvionicsItems(...lists: Array<string[] | null | undefined>): string[] {
  const merged: string[] = []
  const seen = new Set<string>()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const cleaned = item.replace(/\s+/g, " ").trim()
      if (!cleaned) continue
      const token = normalizeAvionicsToken(cleaned)
      if (!token || seen.has(token)) continue
      seen.add(token)
      merged.push(cleaned)
    }
  }
  return merged
}

export function renderAvionicsValue(avionicsList: string[], avionicsText: string | null): ReactNode {
  if (avionicsList.length === 0) return safeDisplay(avionicsText)
  const rendered = avionicsList.map((line, index) => {
    const lower = line.toLowerCase()
    const className = lower.startsWith("avionics") ? "avionics-inline-line heading" : lower.startsWith("additional equipment")
      ? "avionics-inline-line subheading"
      : "avionics-inline-line item"
    return <p className={className} key={`${line}-${index}`}>{`- ${line}`}</p>
  })
  return (
    <div className="avionics-inline-list" role="list">{rendered}</div>
  )
}

function captureLabeledValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const match = new RegExp(`\\b${escaped}\\s*[:\\-]\\s*([^\\n\\r]+)`, "i").exec(text)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

function extractSectionContent(text: string, sectionNames: string[]): string | null {
  const sectionLines = extractSectionLines(text, sectionNames)
  if (!sectionLines.length) return null
  return sectionLines.join(" ")
}

function captureFirstMatch(text: string, pattern: RegExp, groupIndex: number): string | null {
  const match = pattern.exec(text)
  if (!match) return null
  return typeof match[groupIndex] === "string" ? match[groupIndex] : null
}

function parseNumberToken(value: string | null): number | null {
  if (!value) return null
  const match = /[\d,]+/.exec(value)
  if (!match) return null
  const numeric = Number(match[0].replace(/,/g, ""))
  return Number.isFinite(numeric) ? numeric : null
}

export function cleanParsedText(value: string | null): string | null {
  if (!value) return null
  const clean = value.replace(/\s+/g, " ").trim()
  if (!clean) return null
  if (/^(unknown|n\/a|na|none|-|--|tbd)$/i.test(clean)) return null
  return clean
}

function parseMonthYear(value: string | null): string | null {
  const clean = cleanParsedText(value)
  if (!clean) return null
  const match = /^([A-Za-z]{3,9})\s+(\d{4})$/.exec(clean)
  if (!match) return clean
  const [, monthRaw, year] = match
  const month = monthRaw.slice(0, 1).toUpperCase() + monthRaw.slice(1).toLowerCase()
  return `${month} ${year}`
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return null
  const numeric = Number(value.replace(/,/g, "").trim())
  return Number.isFinite(numeric) ? numeric : null
}

function extractSectionLines(text: string, sectionNames: string[]): string[] {
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim().toLowerCase()
    if (!line) continue
    const matchedSection = sectionNames.find((name) => {
      const normalized = name.toLowerCase()
      return line === `${normalized}:` || line === normalized
    })
    if (!matchedSection) continue
    const sectionLines: string[] = []
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const trimmed = lines[cursor].trim()
      if (!trimmed) {
        if (sectionLines.length) break
        continue
      }
      if (/^[a-z0-9 /()&.-]+:\s*$/i.test(trimmed) && !trimmed.toLowerCase().includes("http")) {
        break
      }
      sectionLines.push(trimmed)
    }
    if (sectionLines.length) return sectionLines
  }
  return []
}

function parseAvionicsLineItems(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .replace(/\r/g, "\n")
    .split(/\n|,|;|\u2022/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((part) => !/^(avionics|equipment)$/i.test(part))
}

function extractAvionicsDisplayLines(
  text: string,
  sectionLines: string[],
  labeledAvionics: string | null
): string[] {
  const sectionText = sectionLines.length ? sectionLines.join("\n") : null
  const inlineBlock = extractInlineAvionicsBlock(text)
  const source = sectionText || inlineBlock || labeledAvionics
  if (!source) return []
  return splitAvionicsDisplayLines(source)
}

function extractInlineAvionicsBlock(text: string): string | null {
  const source = text.replace(/\r/g, "\n")
  const startMatch = /avionics(?:\s*\/\s*equipment)?\b/i.exec(source)
  if (!startMatch || typeof startMatch.index !== "number") return null

  const start = startMatch.index
  const tail = source.slice(start)
  const endMatch = /\b(?:seller description|prop:|interior:|exterior:|year:|paint|specs?:|remarks?:|annual(?: inspection)?|airframe:)\b/i.exec(tail.slice(12))
  const end = endMatch?.index ? start + 12 + endMatch.index : Math.min(source.length, start + 2200)
  const block = source.slice(start, end).trim()
  return block || null
}

function splitAvionicsDisplayLines(source: string): string[] {
  let text = source.replace(/\r/g, "\n").trim()
  if (!text) return []

  text = text.replace(/\bAdditional Equipment\b\s*[:\-]?/gi, "\nAdditional Equipment:")
  text = text.replace(/[;,]\s+/g, "\n")

  const tokenPattern = /\b(?:Garmin Synthetic Vision Technology|Garmin Electronic Stability Protection|GMA[-\s]?\d{2,4}[A-Z]*|GTC[-\s]?\d{2,4}[A-Z]*|GTX[-\s]?\d{2,4}[A-Z]*|GTS[-\s]?\d{2,4}[A-Z]*|GIA[-\s]?\d{2,4}[A-Z]*|GSR[-\s]?\d{2,4}[A-Z]*|GDU[-\s]?\d{2,4}[A-Z]*|GEA[-\s]?\d{2,4}[A-Z]*|GRS[-\s]?\d{2,4}[A-Z]*|GDC[-\s]?\d{2,4}[A-Z]*|GMU[-\s]?\d{2,4}[A-Z]*|GCU[-\s]?\d{2,4}[A-Z]*|GFC[-\s]?\d{2,4}[A-Z]*|GMC[-\s]?\d{2,4}[A-Z]*|GDL[-\s]?\d{2,4}[A-Z]*|ADS-B(?:\s+Out|\s+In)?|WAAS|XM Weather|FIKI|Factory Air Conditioning|Artex ELT[-\s]?[A-Z0-9]+|Built-in Oxygen System|Engine Pre-Heat|Custom Aircraft Cover|Trilogy ESI[-\s]?\d{3,4})\b/gi
  text = text.replace(tokenPattern, (match, offset, full) => {
    if (offset === 0) return match
    const prev = full[offset - 1]
    if (prev === "\n" || prev === ":" || prev === "/") return match
    return `\n${match}`
  })

  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)

  const deduped: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const key = normalizeAvionicsToken(line)
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(line)
  }
  return deduped
}

function normalizeAvionicsToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
