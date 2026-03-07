import type { RecentSoldRecord } from '../types'

type RecentSalesPanelProps = {
  recentSalesLoading: boolean
  recentSales: RecentSoldRecord[]
  normalizeText: (value: string | null | undefined) => string
  formatIsoDate: (value: string | null | undefined) => string
}

export default function RecentSalesPanel({
  recentSalesLoading,
  recentSales,
  normalizeText,
  formatIsoDate,
}: RecentSalesPanelProps) {
  return (
    <div className="rounded border border-brand-dark bg-[#131313] p-2">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-brand-orange">Recently Sold Aircraft (FAA Ownership Transfers)</h2>
        <span className="text-[11px] text-brand-muted">Last 30 days</span>
      </div>
      {recentSalesLoading ? (
        <div className="text-xs text-brand-muted">Loading recent FAA ownership transfers...</div>
      ) : recentSales.length === 0 ? (
        <div className="text-xs text-brand-muted">No recent ownership transfers detected yet.</div>
      ) : (
        <div className="overflow-x-auto rounded border border-brand-dark bg-[#111]">
          <table className="min-w-[980px] w-full text-xs">
            <thead className="bg-[#1c1c1c] text-brand-muted">
              <tr>
                <th className="px-2 py-2 text-left">N-number</th>
                <th className="px-2 py-2 text-left">Aircraft</th>
                <th className="px-2 py-2 text-left">Asking Price</th>
                <th className="px-2 py-2 text-left">Est. Sale Date</th>
                <th className="px-2 py-2 text-left">Days On Market</th>
                <th className="px-2 py-2 text-left">Source</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.map((sale) => {
                const aircraft = [sale.listing?.year, sale.listing?.make, sale.listing?.model]
                  .filter((part) => part !== null && part !== undefined && part !== '')
                  .join(' ')
                return (
                  <tr key={sale.id} className="border-t border-brand-dark bg-[#131313]">
                    <td className="px-2 py-2">{normalizeText(sale.n_number) || 'Unknown'}</td>
                    <td className="px-2 py-2 text-white">{aircraft || 'Unknown Aircraft'}</td>
                    <td className="px-2 py-2 text-brand-orange">
                      {typeof sale.asking_price_at_detection === 'number'
                        ? `$${Math.round(sale.asking_price_at_detection).toLocaleString()}`
                        : 'N/A'}
                    </td>
                    <td className="px-2 py-2">{formatIsoDate(sale.new_cert_date || sale.detected_at)}</td>
                    <td className="px-2 py-2">
                      {typeof sale.listing?.days_on_market === 'number'
                        ? `${Math.round(Math.max(0, sale.listing.days_on_market))} days`
                        : 'Unknown'}
                    </td>
                    <td className="px-2 py-2 text-brand-muted">{normalizeText(sale.estimation_method) || 'FAA transfer signal'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
