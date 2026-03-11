import type { ReactNode } from 'react'
import ListingImageGallery from './ListingImageGallery'

type LeftDetailColumnProps = {
  primaryImageUrl: string
  galleryUrls: string[]
  title: string
  aircraftRows: Array<[string, ReactNode]>
  engineRows: Array<[string, ReactNode]>
  descriptionText: string
  sourceUrl: string | null
  sourceLinkLabel: string
  logbookUrls: string[]
  dealTier?: string | null
  fallbackImageUrl?: string | null
  siblingListingPrices?: Array<{
    key: string
    sourceLabel: string
    priceLabel: string
    listingUrl: string | null
  }>
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
      <style>{`
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
          border-bottom: 1px solid var(--brand-dark);
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
          color: var(--brand-muted);
          font-weight: 500;
        }
        .detail-table td {
          color: var(--brand-white);
          font-weight: 700;
        }
      `}</style>
    </section>
  )
}

export default function LeftDetailColumn({
  primaryImageUrl,
  galleryUrls,
  title,
  aircraftRows,
  engineRows,
  descriptionText,
  sourceUrl,
  sourceLinkLabel,
  logbookUrls,
  dealTier = null,
  fallbackImageUrl = null,
  siblingListingPrices = [],
}: LeftDetailColumnProps) {
  const imageUrls = [
    ...new Set([
      String(primaryImageUrl || '').trim(),
      ...galleryUrls.map((value) => String(value || '').trim()),
    ].filter(Boolean)),
  ]
  const siblingPriceRows: Array<[string, ReactNode]> = siblingListingPrices.map((row) => [
    row.sourceLabel,
    row.listingUrl ? (
      <a href={row.listingUrl} target="_blank" rel="noreferrer">
        {row.priceLabel}
      </a>
    ) : (
      row.priceLabel
    ),
  ])

  return (
    <section className="panel">
      <ListingImageGallery
        title={title || "Aircraft listing"}
        imageUrls={imageUrls}
        dealTier={dealTier}
        fallbackImageUrl={fallbackImageUrl}
      />

      <div style={{ marginTop: '0.9rem', display: 'grid', gap: '0.9rem' }}>
        <DetailTableCard title="Aircraft Details" rows={aircraftRows} />
        <DetailTableCard title="Airframe & Engine" rows={engineRows} />
      </div>

      <h3>Seller Description</h3>
      <p>{descriptionText || 'No description available.'}</p>

      {sourceUrl ? (
        <p>
          <a className="button-link" href={sourceUrl} target="_blank" rel="noreferrer">
            {sourceLinkLabel}
          </a>
        </p>
      ) : null}

      {siblingPriceRows.length > 0 ? <DetailTableCard title="Also Listed On" rows={siblingPriceRows} /> : null}

      {logbookUrls.length > 0 ? (
        <div style={{ marginTop: '1rem' }}>
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
  )
}
