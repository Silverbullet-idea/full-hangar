/** Fallback engine count when FAA ref has no engine count. */
export const engineCountByModel: Record<string, number> = {
  C172: 1,
  C182: 1,
  C150: 1,
  C152: 1,
  C170: 1,
  C175: 1,
  C177: 1,
  C180: 1,
  C185: 1,
  C210: 1,
  C206: 1,
  "PA-28": 1,
  "PA-18": 1,
  "PA-22": 1,
  "PA-32": 1,
  "PA-46": 1,
  A23: 1,
  A24: 1,
  B19: 1,
  C23: 1,
  M20: 1,
  "AA-1": 1,
  "AA-5": 1,
  SR20: 1,
  SR22: 1,
  DA20: 1,
  DA40: 1,
  C310: 2,
  C337: 2,
  C340: 2,
  C402: 2,
  C414: 2,
  C421: 2,
  "PA-34": 2,
  "PA-44": 2,
  "PA-30": 2,
  "PA-39": 2,
  B55: 2,
  B58: 2,
  B60: 2,
  BE76: 2,
  DA42: 2,
  "GA-7": 2,
}

export function inferEngineCount(make: string, model: string): number | null {
  const modelUpper = model?.toUpperCase() ?? ""
  const makeUpper = make?.toUpperCase() ?? ""
  const hay = `${makeUpper} ${modelUpper}`

  if (/\bCESSNA\b/.test(makeUpper) || hay.includes("CESSNA")) {
    if (/\b(310|337|340|402|414|421)\b/.test(modelUpper)) return 2
    if (/\b(172|150|152|170|175|177|180|185|206|210)\b/.test(modelUpper)) return 1
  }
  if (/\bBEECH|BEECHCRAFT\b/.test(hay) && /\b(55|58|60|76)\b/.test(modelUpper)) return 2
  if (/\bBEECH|BEECHCRAFT\b/.test(hay) && /\b(36|35|33)\b/.test(modelUpper)) return 1

  const keys = Object.keys(engineCountByModel).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    const k = key.toUpperCase()
    if (modelUpper.startsWith(k) || modelUpper.includes(k) || hay.includes(k)) {
      return engineCountByModel[key]!
    }
  }
  return null
}
