import Image from 'next/image'
import type { ReactNode } from 'react'

type LeftDetailColumnProps = {
  primaryImageUrl: string
  galleryUrls: string[]
  title: string
  toProxyImageUrl: (url: string) => string
  aircraftRows: Array<[string, ReactNode]>
  engineRows: Array<[string, ReactNode]>
  descriptionText: string
  sourceUrl: string | null
  sourceLinkLabel: string
  logbookUrls: string[]
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
  toProxyImageUrl,
  aircraftRows,
  engineRows,
  descriptionText,
  sourceUrl,
  sourceLinkLabel,
  logbookUrls,
}: LeftDetailColumnProps) {
  return (
    <section className="panel">
      {primaryImageUrl ? (
        <>
          <Image
            className="hero-image"
            src={toProxyImageUrl(primaryImageUrl)}
            alt={title || 'Aircraft listing'}
            width={1200}
            height={720}
            sizes="(max-width: 980px) 100vw, 50vw"
            unoptimized
            priority
          />
          {galleryUrls.length > 0 ? (
            <div className="image-gallery-grid">
              {galleryUrls.map((url) => (
                <Image
                  key={url}
                  className="gallery-thumb"
                  src={toProxyImageUrl(url)}
                  alt={`${title || 'Aircraft'} gallery image`}
                  width={320}
                  height={176}
                  sizes="(max-width: 980px) 33vw, 16vw"
                  unoptimized
                  loading="lazy"
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
