import Link from "next/link"
import type { ReactNode } from "react"
import { formatMoney, formatScore, getRiskClass } from "../../../lib/listings/format"
import { getListingById, getListingRawById } from "../../../lib/listings/queries"
import type { AircraftListing } from "../../../lib/types"

type ListingPageProps = {
  params: Promise<{ id: string }>
}

type UnknownRow = Record<string, unknown> | null

export default async function ListingDetailPage({ params }: ListingPageProps) {
  const { id } = await params
  const [listing, raw] = await Promise.all([getListingById(id), getListingRawById(id)])

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
  const faaMatched = toBool(raw, "faa_matched")
  const registrationAlert = pickText(raw, ["faa_registration_alert"])
  const nNumber = safeDisplay(listingRow.n_number || pickText(raw, ["n_number"]))
  const accidentCount = pickNumber(raw, ["accident_count"]) ?? 0
  const mostRecentAccidentDate = pickText(raw, ["most_recent_accident_date"])
  const mostSevereDamage = pickText(raw, ["most_severe_damage"])
  const hasAccidentHistory = toBool(raw, "has_accident_history") || accidentCount > 0
  const sourceUrl = listingRow.url || pickText(raw, ["source_url", "listing_url", "url"])
  const titleText = formatTitle(listingRow.year, listingRow.make, listingRow.model, listingRow.title)
  const scoreColor = getScoreColor(listingRow.value_score)
  const primaryImageUrl = typeof listingRow.primary_image_url === "string" ? listingRow.primary_image_url.trim() : ""
  const galleryUrls = primaryImageUrl
    ? imageUrls.filter((url) => url !== primaryImageUrl)
    : imageUrls
  const logbookUrls = collectLinkUrls(raw, "logbook_urls")
  const scoreExplanation = collectTextList(raw, "score_explanation")
  const dataConfidence = pickText(raw, ["data_confidence"])
  const dealComparisonSource = pickText(raw, ["deal_comparison_source"]) || listingRow.deal_comparison_source

  const accidentHistoryValue = hasAccidentHistory ? (
    <div>
      <div style={{ color: "#dc2626", fontWeight: 700 }}>
        {`⚠ ${accidentCount} accident(s) on record — most recent: ${formatIsoDate(mostRecentAccidentDate)}, damage: ${safeDisplay(mostSevereDamage)}`}
      </div>
      {nNumber !== "—" ? (
        <a
          href={`https://www.ntsb.gov/Pages/AviationQueryV2.aspx?NNumber=${encodeURIComponent(nNumber)}`}
          target="_blank"
          rel="noreferrer"
        >
          Search NTSB records
        </a>
      ) : null}
    </div>
  ) : (
    <div style={{ color: "#16a34a", fontWeight: 700 }}>✓ No NTSB accidents on record</div>
  )

  return (
    <main className="container">
      <p>
        <Link href="/listings">← Back to listings</Link>
      </p>

      <h1 className="listing-title">{titleText}</h1>

      <div className="detail-grid">
        <section className="panel">
          {primaryImageUrl ? (
            <>
              <img className="hero-image" src={toProxyImageUrl(primaryImageUrl)} alt={listingRow.title || "Aircraft listing"} />
              {galleryUrls.length > 0 ? (
                <div className="image-gallery-grid">
                  {galleryUrls.map((url) => (
                    <img
                      key={url}
                      className="gallery-thumb"
                      src={toProxyImageUrl(url)}
                      alt={`${listingRow.title || "Aircraft"} gallery image`}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="hero-image hero-placeholder">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M22 16.5v-2l-8-5V4a2 2 0 0 0-4 0v5.5l-8 5v2l8-2.5V20l-2 1.5V23l4-1 4 1v-1.5L14 20v-6z"
                />
              </svg>
            </div>
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

          {logbookUrls.length > 0 ? (
            <div style={{ marginTop: "1rem" }}>
              <h3>Logbooks & Records</h3>
              <ul>
                {logbookUrls.map((url, index) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer">
                      {`Record ${index + 1}`}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <div className="panel-stack">
          <section className="panel">
            <h3>Score Summary</h3>
            <div
              className="score-badge"
              style={{
                borderColor: scoreColor,
                boxShadow: `0 0 0 6px ${scoreColor}20 inset`,
              }}
            >
              <span className="score-value">{safeDisplay(formatScore(listingRow.value_score))}</span>
              <span className="score-max">/ 100</span>
            </div>
            <p style={{ marginTop: "0.85rem" }}>
              <span className={`badge ${getRiskClass(listingRow.risk_level)}`}>{listingRow.risk_level || "UNKNOWN"}</span>
            </p>
            {registrationAlert ? (
              <div className="warning-banner">
                <strong>{registrationAlert}</strong>
                <p>Verify registration status before purchase</p>
              </div>
            ) : null}

            <div style={{ marginTop: "0.8rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {dataConfidence ? (
                <span className="badge score-none">{`Data Confidence: ${dataConfidence}`}</span>
              ) : null}
              {dealComparisonSource ? (
                <span className="badge risk-moderate">{`Comp Source: ${dealComparisonSource}`}</span>
              ) : null}
            </div>

            {scoreExplanation.length > 0 ? (
              <div style={{ marginTop: "1rem" }}>
                <h3>How We Scored This</h3>
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {scoreExplanation.map((item) => (
                    <li key={item} style={{ marginBottom: "0.35rem" }}>
                      {renderScoreExplanationItem(item)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <DetailTableCard
            title="Aircraft Details"
            rows={[
              ["Year", safeDisplay(listingRow.year)],
              ["Make", safeDisplay(listingRow.make)],
              ["Model", safeDisplay(listingRow.model)],
              ["Serial Number", safeDisplay(listingRow.serial_number)],
              ["N-Number", safeDisplay(listingRow.n_number)],
              ["Location", safeDisplay(listingRow.location_label)],
              ["Condition", safeDisplay(pickText(raw, ["condition", "listing_condition", "aircraft_condition"]))],
            ]}
          />

          <DetailTableCard
            title="Airframe & Engine"
            rows={[
              ["Total Time", safeDisplay(formatHours(listingRow.total_time_airframe))],
              ["Engine Time SMOH", safeDisplay(formatHours(listingRow.engine_time_since_overhaul))],
              ["Engine TBO", safeDisplay(formatHours(listingRow.engine_tbo_hours ?? pickNumber(raw, ["engine_tbo_hours", "engine_tbo"])))],
              ["Engine Model", safeDisplay(pickText(raw, ["engine_model"]))],
              ["Avionics", safeDisplay(pickText(raw, ["avionics_description", "avionics_notes"]))],
              ["Airworthy", safeDisplay(formatAirworthy(raw), { unknownAsDash: true })],
            ]}
          />

          <DetailTableCard
            title="Cost Analysis"
            rows={[
              ["Asking Price", safeDisplay(formatMoney(listingRow.price_asking))],
              ["Deferred Maintenance", safeDisplay(formatMoney(listingRow.deferred_total))],
              [
                "True Cost Estimate",
                safeDisplay(formatMoney(calculateTrueCost(listingRow.price_asking, listingRow.deferred_total, listingRow.true_cost))),
              ],
            ]}
          />

          {faaMatched ? (
            <DetailTableCard
              title="FAA Registry"
              rows={[
                ["Owner", safeDisplay(pickText(raw, ["faa_owner"]))],
                ["FAA Status", safeDisplay(pickText(raw, ["faa_status"]))],
                ["Registration Alert", safeDisplay(registrationAlert)],
                ["Cert Date", safeDisplay(pickText(raw, ["faa_cert_date"]))],
                ["Accident History", accidentHistoryValue],
              ]}
            />
          ) : null}
        </div>
      </div>

      <style jsx>{`
        .listing-title {
          margin: 0 0 1.25rem;
          font-size: clamp(2rem, 4vw, 3rem);
          line-height: 1.1;
          white-space: nowrap;
        }
        .detail-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 1rem;
          align-items: start;
        }
        .panel,
        .table-card {
          background: #121212;
          border: 1px solid #2a2a2a;
          border-radius: 12px;
          padding: 1rem;
        }
        .panel-stack {
          display: grid;
          gap: 1rem;
        }
        .hero-image {
          width: 100%;
          border-radius: 10px;
          display: block;
          object-fit: cover;
          border: 1px solid #2f2f2f;
          min-height: 260px;
          max-height: 420px;
        }
        .hero-placeholder {
          background: #0f0f0f;
          display: grid;
          place-items: center;
          color: #5e5e5e;
        }
        .hero-placeholder svg {
          width: 64px;
          height: 64px;
        }
        .image-gallery-grid {
          margin-top: 0.8rem;
          display: grid;
          gap: 0.6rem;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .gallery-thumb {
          width: 100%;
          height: 88px;
          border-radius: 8px;
          object-fit: cover;
          border: 1px solid #2f2f2f;
        }
        .button-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: 0.2rem;
          background: #ff9900;
          color: #101010;
          padding: 0.65rem 1rem;
          border-radius: 8px;
          font-weight: 700;
          text-decoration: none;
        }
        .button-link:hover {
          background: #af4d27;
          color: #ffffff;
        }
        .score-badge {
          width: 210px;
          max-width: 100%;
          min-height: 106px;
          border-radius: 999px;
          border: 3px solid;
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 0.35rem;
          margin-top: 0.2rem;
          padding: 0.9rem 1rem;
          background: #151515;
        }
        .score-value {
          font-size: 2.4rem;
          font-weight: 800;
          line-height: 1;
        }
        .score-max {
          font-size: 1rem;
          color: #b2b2b2;
          font-weight: 600;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0.35rem 0.7rem;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .risk-low {
          background: #ff990022;
          border: 1px solid #ff9900;
          color: #ff9900;
        }
        .risk-moderate {
          background: #af4d2722;
          border: 1px solid #af4d27;
          color: #af4d27;
        }
        .risk-high {
          background: #d9770622;
          border: 1px solid #d97706;
          color: #d97706;
        }
        .risk-critical {
          background: #dc262622;
          border: 1px solid #dc2626;
          color: #dc2626;
        }
        .score-none {
          background: #2a2a2a;
          border: 1px solid #4a4a4a;
          color: #b2b2b2;
        }
        .warning-banner {
          margin-top: 0.8rem;
          border: 1px solid #af4d27;
          border-radius: 10px;
          padding: 0.75rem;
          background: #af4d2717;
        }
        @media (max-width: 980px) {
          .listing-title {
            white-space: normal;
          }
          .detail-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
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

function collectLinkUrls(raw: UnknownRow, key: string): string[] {
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

function collectTextList(raw: UnknownRow, key: string): string[] {
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

function renderScoreExplanationItem(item: string): string {
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

function formatAirworthy(raw: UnknownRow): string {
  const boolValue = raw?.is_airworthy
  if (typeof boolValue === "boolean") return boolValue ? "Yes" : "No"
  const text = pickText(raw, ["airworthy"])
  return text || "Unknown"
}

function formatIsoDate(value: string | null): string {
  if (!value) return "—"
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  return new Date(timestamp).toLocaleDateString("en-US")
}

function calculateTrueCost(askingPrice: number | null, deferredTotal: number | null, trueCost: number | null): number | null {
  if (typeof trueCost === "number") return trueCost
  if (typeof askingPrice !== "number" || typeof deferredTotal !== "number") return null
  return askingPrice + deferredTotal
}

function formatTitle(year: number | null, make: string | null, model: string | null, fallbackTitle: string | null): string {
  const composed = [year, make, model].filter((part) => part !== null && part !== undefined && part !== "").join(" ")
  return composed || fallbackTitle || "Aircraft Listing"
}

function toProxyImageUrl(url: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`
}

function safeDisplay(
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

function getScoreColor(score: number | null): string {
  if (typeof score !== "number") return "#6b7280"
  if (score >= 80) return "#16a34a"
  if (score >= 60) return "#65a30d"
  if (score >= 40) return "#d97706"
  return "#dc2626"
}

function DetailTableCard({ title, rows }: { title: string; rows: Array<[string, ReactNode]> }) {
  return (
    <section className="table-card">
      <h3 className="section-title">{title}</h3>
      <table className="detail-table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <style jsx>{`
        .section-title {
          color: #ff9900;
          font-weight: 800;
          margin: 0 0 0.75rem;
        }
        .detail-table {
          width: 100%;
          border-collapse: collapse;
        }
        .detail-table tr {
          border-bottom: 1px solid #2e2e2e;
        }
        .detail-table tr:last-child {
          border-bottom: none;
        }
        .detail-table th,
        .detail-table td {
          text-align: left;
          padding: 0.62rem 0.2rem;
          vertical-align: top;
        }
        .detail-table th {
          width: 46%;
          color: #b2b2b2;
          font-weight: 500;
        }
        .detail-table td {
          color: #ffffff;
          font-weight: 700;
        }
      `}</style>
    </section>
  )
}
