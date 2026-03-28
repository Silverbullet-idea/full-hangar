export const tboReference: Record<string, number> = {
  "O-200": 1800,
  "IO-240": 2000,
  "O-235": 2000,
  "O-320": 2000,
  "O-360": 2000,
  "IO-360": 2000,
  "IO-390": 2000,
  "O-470": 1700,
  "IO-470": 1500,
  "O-540": 2000,
  "IO-520": 1700,
  "IO-540": 2000,
  "IO-550": 2000,
  "TSIO-520": 1400,
  "TSIO-550": 2000,
  "TIO-540": 1800,
  "GTSIO-520": 1400,
  CD300: 2100,
  "CD-300": 2100,
  "912 ULS": 2000,
  "912 iS": 2000,
  "914 UL": 2000,
  "915 iS": 2000,
  "916 iS": 2000,
  PT6A: 3600,
  "PT6A-34": 3600,
  "PT6A-42": 3600,
  "PT6A-114": 3600,
  "TPE331": 5400,
  "TPE331-5": 5400,
  "TPE331-10": 5400,
}

export function lookupTBO(engineModel: string): number | null {
  const m = engineModel.trim()
  if (!m) return null
  const keys = Object.keys(tboReference).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (m.startsWith(key) || m.toUpperCase().includes(key.toUpperCase())) {
      return tboReference[key] ?? null
    }
  }
  return null
}
