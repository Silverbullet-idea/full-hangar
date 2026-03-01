import Link from "next/link"
import { formatMoney, formatScore, getRiskClass } from "../../../lib/listings/format"
import { getListingById, getListingRawById } from "../../../lib/listings/queries"
import type { AircraftListing } from "../../../lib/types"

type ListingPageProps = {
  params: { id: string }
}

type UnknownRow = Record<string, unknown> | null

export default async function ListingDetailPage({ params }: ListingPageProps) {
  const [listing, raw] = await Promise.all([getListingById(params.id), getListingRawById(params.id)])

  if (!listing) {
    return (
      <main className="container">
        <p>Listing not found.</p>
        <Link href="/listings">Back to listings</Link>
      </main>
    )
  }

  const listingRow = listing as AircraftListing
  const imageUrls = collectImageUrls(listingRow.primary_image_url, raw)
  const deferredBreakdown = extractDeferredBreakdown(raw)
  const faaMatched = toBool(raw, "faa_matched")
  const registrationAlert = pickText(raw, ["faa_registration_alert"])
  const scoreDate = formatDate(
    pickText(raw, ["scoring_date", "score_date", "intelligence_scored_at", "scored_at", "updated_at"])
  )
  const sourceUrl = listingRow.url || pickText(raw, ["source_url", "listing_url", "url"])

  return (
    <main className="container">
      <p>
        <Link href="/listings">← Back to listings</Link>
      </p>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {listingRow.title}
        </h1>
        <span className={`badge ${getRiskClass(listingRow.risk_level)}`}>{listingRow.risk_level || "UNKNOWN"}</span>
      </div>

      <div className="detail-grid">
        <section className="panel">
          <h3>Image Gallery</h3>
          {imageUrls.length ? (
            <>
              <img className="hero-image" src={imageUrls[0]} alt={listingRow.title || "Aircraft listing"} />
              {imageUrls.length > 1 ? (
                <div className="image-gallery-grid">
                  {imageUrls.slice(1).map((url) => (
                    <img key={url} className="gallery-thumb" src={url} alt={`${listingRow.title || "Aircraft"} gallery image`} />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="hero-image" />
          )}

          <h3>Seller Description</h3>
          <p>{listingRow.description_full || listingRow.description || "No description available."}</p>

          {sourceUrl ? (
            <p>
              <a className="button-link" href={sourceUrl} target="_blank" rel="noreferrer">
                View on Controller.com
              </a>
            </p>
          ) : null}
        </section>

        <div className="panel-stack">
          <section className="panel">
            <h3>Score Summary</h3>
            <p className="score-display">
              {typeof listingRow.value_score === "number" ? `${formatScore(listingRow.value_score)} / 100` : "N/A"}
            </p>
            <p>
              <span className={`badge ${getRiskClass(listingRow.risk_level)}`}>{listingRow.risk_level || "UNKNOWN"}</span>
            </p>
            {registrationAlert ? (
              <div className="warning-banner">
                <strong>{registrationAlert}</strong>
                <p>Verify registration status before purchase</p>
              </div>
            ) : null}
          </section>

          <section className="panel">
            <h3>Aircraft Details</h3>
            <p className="kv">
              <span>Year</span>
              <strong>{listingRow.year ?? "N/A"}</strong>
            </p>
            <p className="kv">
              <span>Make</span>
              <strong>{listingRow.make || "N/A"}</strong>
            </p>
            <p className="kv">
              <span>Model</span>
              <strong>{listingRow.model || "N/A"}</strong>
            </p>
            <p className="kv">
              <span>Serial Number</span>
              <strong>{listingRow.serial_number || "N/A"}</strong>
            </p>
            <p className="kv">
              <span>N-Number</span>
              <strong>{listingRow.n_number || "N/A"}</strong>
            </p>
            <p className="kv">
              <span>Total Time Airframe</span>
              <strong>{formatHours(listingRow.total_time_airframe)}</strong>
            </p>
            <p className="kv">
              <span>Engine Time SMOH</span>
              <strong>{formatHours(listingRow.engine_time_since_overhaul)}</strong>
            </p>
            <p className="kv">
              <span>Engine TBO</span>
              <strong>{formatHours(listingRow.engine_tbo_hours ?? pickNumber(raw, ["engine_tbo_hours", "engine_tbo"]))}</strong>
            </p>
            <p className="kv">
              <span>Engine Model</span>
              <strong>{pickText(raw, ["engine_model"]) || "N/A"}</strong>
            </p>
            <p className="kv">
              <span>Avionics</span>
              <strong>{pickText(raw, ["avionics_description", "avionics_notes"]) || "N/A"}</strong>
            </p>
            <p className="kv">
              <span>Location</span>
              <strong>{listingRow.location_label || "N/A"}</strong>
            </p>
            <p className="kv">
              <span>Airworthy status</span>
              <strong>{formatAirworthy(raw)}</strong>
            </p>
          </section>

          <section className="panel">
            <h3>Cost Analysis</h3>
            <p className="kv">
              <span>Asking price</span>
              <strong>{formatMoney(listingRow.price_asking)}</strong>
            </p>
            <p className="kv">
              <span>Estimated deferred maintenance total</span>
              <strong>{formatMoney(listingRow.deferred_total)}</strong>
            </p>
            <p className="kv">
              <span>True cost estimate</span>
              <strong>{formatMoney(calculateTrueCost(listingRow.price_asking, listingRow.deferred_total, listingRow.true_cost))}</strong>
            </p>
            {deferredBreakdown.length ? (
              <div>
                <p className="subtle" style={{ marginTop: "0.9rem", marginBottom: "0.4rem" }}>
                  Deferred Breakdown
                </p>
                {deferredBreakdown.map(([category, amount]) => (
                  <p key={category} className="kv">
                    <span>{humanizeCategory(category)}</span>
                    <strong>{formatMoney(amount)}</strong>
                  </p>
                ))}
              </div>
            ) : (
              <p className="subtle">Deferred category breakdown unavailable.</p>
            )}
          </section>

          {faaMatched ? (
            <section className="panel">
              <h3>FAA Registry Data</h3>
              <p className="kv">
                <span>Owner name</span>
                <strong>{pickText(raw, ["faa_owner"]) || "N/A"}</strong>
              </p>
              <p className="kv">
                <span>FAA status</span>
                <strong>{pickText(raw, ["faa_status"]) || "N/A"}</strong>
              </p>
              <p className="kv">
                <span>Registration alert</span>
                <strong>{registrationAlert || "None"}</strong>
              </p>
              <p className="kv">
                <span>Cert issue date</span>
                <strong>{pickText(raw, ["faa_cert_date"]) || "N/A"}</strong>
              </p>
              <p className="kv">
                <span>FAA city/state</span>
                <strong>{joinCityState(pickText(raw, ["faa_city"]), pickText(raw, ["faa_state"])) || "N/A"}</strong>
              </p>
              <p className="kv">
                <span>Cruising speed</span>
                <strong>{formatWithUnit(pickNumber(raw, ["faa_cruising_speed"]), "kt")}</strong>
              </p>
              <p className="kv">
                <span>Seats</span>
                <strong>{formatInteger(pickNumber(raw, ["faa_num_seats"]))}</strong>
              </p>
              <p className="kv">
                <span>Engine horsepower</span>
                <strong>{formatWithUnit(pickNumber(raw, ["faa_engine_horsepower"]), "hp")}</strong>
              </p>
            </section>
          ) : null}

          <section className="panel">
            <h3>Intelligence Metadata</h3>
            <p className="kv">
              <span>Intelligence version</span>
              <strong>{listingRow.intelligence_version || "N/A"}</strong>
            </p>
            <p className="kv">
              <span>Scoring date</span>
              <strong>{scoreDate || "N/A"}</strong>
            </p>
            <p>
              <Link href="/listings">Back to listings</Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}

function collectImageUrls(primaryImageUrl: unknown, raw: UnknownRow): string[] {
  const values: string[] = []
  if (typeof primaryImageUrl === "string" && primaryImageUrl.trim()) {
    values.push(primaryImageUrl.trim())
  }
  const fromRaw = raw?.image_urls
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
      }
    } catch {
      values.push(fromRaw.trim())
    }
  }
  return Array.from(new Set(values))
}

function extractDeferredBreakdown(raw: UnknownRow): Array<[string, number]> {
  const candidates = [
    raw?.deferred_breakdown,
    getNested(raw, ["deferred_maintenance", "breakdown"]),
    getNested(raw, ["intelligence", "deferred_maintenance", "breakdown"]),
    getNested(raw, ["intel", "deferred_maintenance", "breakdown"]),
  ]

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue
    const entries = Object.entries(candidate)
      .map(([key, value]) => [key, toNumber(value)] as const)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
    if (entries.length) return entries
  }
  return []
}

function toBool(row: UnknownRow, key: string): boolean {
  const value = row?.[key]
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.toLowerCase() === "true"
  return false
}

function pickText(row: UnknownRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row?.[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function pickNumber(row: UnknownRow, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(row?.[key])
    if (typeof value === "number") return value
  }
  return null
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function formatHours(value: number | null): string {
  if (typeof value !== "number") return "N/A"
  return `${Math.round(value).toLocaleString("en-US")} hrs`
}

function formatInteger(value: number | null): string {
  if (typeof value !== "number") return "N/A"
  return `${Math.round(value).toLocaleString("en-US")}`
}

function formatWithUnit(value: number | null, unit: string): string {
  if (typeof value !== "number") return "N/A"
  return `${Math.round(value).toLocaleString("en-US")} ${unit}`
}

function formatAirworthy(raw: UnknownRow): string {
  const boolValue = raw?.is_airworthy
  if (typeof boolValue === "boolean") return boolValue ? "Yes" : "No"
  const text = pickText(raw, ["airworthy"])
  return text || "Unknown"
}

function calculateTrueCost(askingPrice: number | null, deferredTotal: number | null, trueCost: number | null): number | null {
  if (typeof trueCost === "number") return trueCost
  if (typeof askingPrice !== "number" || typeof deferredTotal !== "number") return null
  return askingPrice + deferredTotal
}

function joinCityState(city: string | null, state: string | null): string | null {
  const value = [city, state].filter(Boolean).join(", ")
  return value || null
}

function humanizeCategory(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function getNested(root: unknown, path: string[]): unknown {
  let cursor: any = root
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object") return null
    cursor = cursor[segment]
  }
  return cursor
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}
