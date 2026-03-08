export type UnknownRow = Record<string, unknown> | null

export type PriceHistoryPoint = {
  observedOn: string
  askingPrice: number | null
  isActive: boolean
}

export function normalizePriceHistory(rawRows: unknown): PriceHistoryPoint[] {
  if (!Array.isArray(rawRows)) return []
  return rawRows
    .map((row) => {
      if (!row || typeof row !== "object") return null
      const item = row as Record<string, unknown>
      const observedOn = typeof item.observed_on === "string" ? item.observed_on : ""
      if (!observedOn) return null
      const askingPrice = toNumber(item.asking_price)
      const isActive = item.is_active === true || item.is_active === "true"
      return { observedOn, askingPrice, isActive }
    })
    .filter((row): row is PriceHistoryPoint => Boolean(row))
}

export function buildPriceHistoryStats(points: PriceHistoryPoint[]) {
  const prices = points.map((p) => p.askingPrice).filter((v): v is number => typeof v === "number")
  const latestPrice = prices.length ? prices[prices.length - 1] : null
  const highestPrice = prices.length ? Math.max(...prices) : null
  const lowestPrice = prices.length ? Math.min(...prices) : null
  const firstPrice = prices.length ? prices[0] : null
  const netChange = typeof latestPrice === "number" && typeof firstPrice === "number" ? latestPrice - firstPrice : null
  let priceDropCount = 0
  for (let i = 1; i < prices.length; i += 1) {
    if (prices[i] < prices[i - 1]) priceDropCount += 1
  }
  return { latestPrice, highestPrice, lowestPrice, netChange, priceDropCount }
}

export function buildPriceHistoryChart(points: PriceHistoryPoint[]): {
  linePoints: string
  dropPoints: Array<{ x: number; y: number }>
} | null {
  const pricedPoints = points.filter((point): point is PriceHistoryPoint & { askingPrice: number } => typeof point.askingPrice === "number")
  if (pricedPoints.length < 2) return null

  const values = pricedPoints.map((point) => point.askingPrice)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(1, max - min)
  const chartWidth = 100
  const chartHeight = 34

  const mapped = pricedPoints.map((point, index) => {
    const x = pricedPoints.length === 1 ? chartWidth / 2 : (index / (pricedPoints.length - 1)) * chartWidth
    const normalized = (point.askingPrice - min) / span
    const y = chartHeight - normalized * (chartHeight - 2) - 1
    return { x, y, value: point.askingPrice }
  })

  const linePoints = mapped.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")
  const dropPoints: Array<{ x: number; y: number }> = []
  for (let i = 1; i < mapped.length; i += 1) {
    if (mapped[i].value < mapped[i - 1].value) {
      dropPoints.push({ x: Number(mapped[i].x.toFixed(2)), y: Number(mapped[i].y.toFixed(2)) })
    }
  }

  return { linePoints, dropPoints }
}

export function collectImageUrls(primaryImageUrl: unknown, raw: UnknownRow): string[] {
  const values: string[] = []
  const pushIfValidImageUrl = (candidate: unknown) => {
    if (typeof candidate !== "string" || !candidate.trim()) return
    const normalized = toAbsoluteHttpUrl(candidate)
    if (normalized) values.push(normalized)
  }

  pushIfValidImageUrl(primaryImageUrl)
  const fromRaw = raw?.image_urls
  if (Array.isArray(fromRaw)) {
    for (const value of fromRaw) {
      pushIfValidImageUrl(value)
    }
  } else if (typeof fromRaw === "string" && fromRaw.trim()) {
    try {
      const parsed = JSON.parse(fromRaw)
      if (Array.isArray(parsed)) {
        for (const value of parsed) {
          pushIfValidImageUrl(value)
        }
      }
    } catch {
      if (fromRaw.includes(",")) {
        for (const value of fromRaw.split(",")) {
          pushIfValidImageUrl(value)
        }
      } else {
        pushIfValidImageUrl(fromRaw)
      }
    }
  }
  return Array.from(new Set(values))
}

export function collectLinkUrls(raw: UnknownRow, key: string): string[] {
  const values: string[] = []
  const fromRaw = raw?.[key]
  if (Array.isArray(fromRaw)) {
    for (const value of fromRaw) {
      if (typeof value === "string" && value.trim()) {
        values.push(value.trim())
      }
    }
  } else if (typeof fromRaw === "string" && fromRaw.trim()) {
    try {
      const parsed = JSON.parse(fromRaw)
      if (Array.isArray(parsed)) {
        for (const value of parsed) {
          if (typeof value === "string" && value.trim()) {
            values.push(value.trim())
          }
        }
      } else {
        values.push(fromRaw.trim())
      }
    } catch {
      values.push(fromRaw.trim())
    }
  }
  return Array.from(new Set(values))
}

export function collectTextList(raw: UnknownRow, key: string): string[] {
  const values: string[] = []
  const fromRaw = raw?.[key]
  if (Array.isArray(fromRaw)) {
    for (const value of fromRaw) {
      if (typeof value === "string" && value.trim()) values.push(value.trim())
    }
  } else if (typeof fromRaw === "string" && fromRaw.trim()) {
    try {
      const parsed = JSON.parse(fromRaw)
      if (Array.isArray(parsed)) {
        for (const value of parsed) {
          if (typeof value === "string" && value.trim()) values.push(value.trim())
        }
      } else {
        values.push(fromRaw.trim())
      }
    } catch {
      values.push(fromRaw.trim())
    }
  }
  return Array.from(new Set(values))
}

export function collectKeyValueList(raw: UnknownRow, key: string): Array<{ label: string; value: number | null }> {
  const values: Array<{ label: string; value: number | null }> = []
  const fromRaw = raw?.[key]

  const handleArray = (arr: unknown[]) => {
    for (const entry of arr) {
      if (!entry || typeof entry !== "object") continue
      const item = entry as Record<string, unknown>
      const labelRaw = item.item ?? item.stc_name ?? item.name
      const label = typeof labelRaw === "string" ? labelRaw.trim() : ""
      if (!label) continue
      const valueRaw = item.value ?? item.premium_value ?? item.market_premium
      values.push({ label, value: toNumber(valueRaw) })
    }
  }

  if (Array.isArray(fromRaw)) {
    handleArray(fromRaw)
  } else if (typeof fromRaw === "string" && fromRaw.trim()) {
    try {
      const parsed = JSON.parse(fromRaw)
      if (Array.isArray(parsed)) handleArray(parsed)
    } catch {
      // no-op
    }
  }

  const seen = new Set<string>()
  return values.filter((entry) => {
    const keyToken = `${entry.label.toLowerCase()}|${entry.value ?? ""}`
    if (seen.has(keyToken)) return false
    seen.add(keyToken)
    return true
  })
}

export function toTitleCase(input: string): string {
  return input
    .split(" ")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ")
}

export function renderScoreExplanationItem(item: string): string {
  const lower = item.toLowerCase()
  if (
    lower.includes("below market") ||
    lower.includes("fresh") ||
    lower.includes("upgrade") ||
    lower.includes("good") ||
    lower.includes("strong")
  ) {
    return `✓ ${item}`
  }
  if (lower.includes("risk") || lower.includes("accident") || lower.includes("deferred") || lower.includes("high")) {
    return `✗ ${item}`
  }
  return `⚠ ${item}`
}

export function toBool(row: UnknownRow, key: string): boolean {
  const value = row?.[key]
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.toLowerCase() === "true"
  return false
}

export function pickText(row: UnknownRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row?.[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

export function pickNumber(row: UnknownRow, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(row?.[key])
    if (typeof value === "number") return value
  }
  return null
}

export function formatTitle(year: number | null, make: string | null, model: string | null, fallbackTitle: string | null): string {
  const composed = [year, make, model].filter((part) => part !== null && part !== undefined && part !== "").join(" ")
  return composed || fallbackTitle || "Aircraft Listing"
}

export function toProxyImageUrl(url: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`
}

export function buildListingFallbackImagePath(input: {
  source: string | null | undefined
  sourceId: string | null | undefined
  title: string | null | undefined
}): string {
  const params = new URLSearchParams()
  const source = String(input.source ?? "").trim()
  const sourceId = String(input.sourceId ?? "").trim()
  const title = String(input.title ?? "").trim()
  if (source) params.set("source", source)
  if (sourceId) params.set("sourceId", sourceId)
  if (title) params.set("title", title)
  const query = params.toString()
  return query ? `/api/listing-fallback-image?${query}` : "/api/listing-fallback-image"
}

export function safeDisplay(
  value: string | number | null | undefined,
  options?: {
    unknownAsDash?: boolean
  }
): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "number") return String(value)
  const normalized = value.trim()
  if (!normalized || normalized.toUpperCase() === "N/A") return "—"
  if (options?.unknownAsDash && normalized.toUpperCase() === "UNKNOWN") return "—"
  return normalized
}

export function getScoreColor(score: number | null): string {
  if (typeof score !== "number") return "#6b7280"
  if (score >= 80) return "#16a34a"
  if (score >= 60) return "#65a30d"
  if (score >= 40) return "#d97706"
  return "#dc2626"
}

export function getSourceLinkLabel(source: string | null | undefined, sourceId: string | null | undefined, url: string | null): string {
  const sourceIdText = String(sourceId ?? "").trim().toLowerCase()
  if (sourceIdText.startsWith("tap_")) return "View on Trade-A-Plane.com"
  if (sourceIdText.startsWith("ctrl_")) return "View on Controller.com"

  if (url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase()
      if (hostname.includes("trade-a-plane.com") || hostname.includes("tradeaplane.com")) {
        return "View on Trade-A-Plane.com"
      }
      if (hostname.includes("controller.com")) return "View on Controller.com"
    } catch {
      // Keep fallback below for invalid URLs.
    }
  }

  const sourceText = String(source ?? "").trim().toLowerCase()
  if (sourceText.includes("trade-a-plane") || sourceText.includes("tradaplane") || sourceText === "tap") {
    return "View on Trade-A-Plane.com"
  }
  if (sourceText.includes("controller") || sourceText === "ctrl") return "View on Controller.com"
  return "View Original Listing"
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function toAbsoluteHttpUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    return parsed.toString()
  } catch {
    return null
  }
}
